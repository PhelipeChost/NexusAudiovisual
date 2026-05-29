import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import multer from 'multer'
import { MercadoPagoConfig, Preference, Payment as MPPayment } from 'mercadopago'
import { run, get, all, createDefaultColumns } from './db.js'
import { generateToken, authMiddleware, requireRole, requireActiveSubscription } from './auth.js'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { validateContract } = require('./contract-validator.cjs')

// Multer config for PDF uploads (max 20MB, memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true)
    else cb(new Error('Apenas arquivos PDF são aceitos'))
  },
})

const router = Router()

// Mercado Pago config (reads token from platform_settings in DB)
let mpClient = null
let mpTokenCache = null
function getMPClient() {
  const row = get("SELECT value FROM platform_settings WHERE key = 'mp_access_token'")
  const token = row?.value || process.env.MP_ACCESS_TOKEN || ''
  if (!token) { mpClient = null; mpTokenCache = null; return null }
  // Rebuild client if token changed
  if (token !== mpTokenCache) {
    mpClient = new MercadoPagoConfig({ accessToken: token })
    mpTokenCache = token
  }
  return mpClient
}

// ============ PUBLIC ROUTES (landing page data) ============

router.get('/public/plans', (req, res) => {
  const plans = all('SELECT id, name, price, description, max_editors, max_clients, max_orders_month, visible, featured, type, benefits, discount_3m, discount_6m, discount_12m, position FROM plans WHERE active = 1 AND visible = 1 AND price > 0 ORDER BY position, price')
  // Parse benefits JSON
  for (const p of plans) {
    try { p.benefits = JSON.parse(p.benefits || '[]') } catch { p.benefits = [] }
  }
  res.json(plans)
})

router.get('/public/stats', (req, res) => {
  const companies = get('SELECT COUNT(*) as count FROM companies').count
  const orders = get('SELECT COUNT(*) as count FROM orders').count
  const editors = get("SELECT COUNT(*) as count FROM users WHERE role = 'editor'").count
  res.json({ companies, orders, editors })
})

// ============ AUTH ============

router.post('/auth/register', (req, res) => {
  const { name, email, password, companyName, role } = req.body

  // Editor self-registration: no company needed
  if (role === 'editor') {
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' })
    }
    const existing = get('SELECT id FROM users WHERE email = ?', [email])
    if (existing) return res.status(400).json({ error: 'Email já cadastrado' })

    const hash = bcrypt.hashSync(password, 10)
    // Create a personal company for the editor (needed for company_id NOT NULL constraint)
    const companyResult = run('INSERT INTO companies (name) VALUES (?)', [`Freelancer - ${name}`])
    const companyId = companyResult.lastInsertRowid

    const userResult = run(
      'INSERT INTO users (company_id, name, email, password, role, phone, specialty) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [companyId, name, email, hash, 'editor', req.body.phone || null, req.body.specialty || null]
    )

    // Check if there are any pending team invites for this email
    const pendingInvites = all('SELECT * FROM team_invites WHERE editor_email = ? AND status = ?', [email, 'pending'])
    for (const inv of pendingInvites) {
      run('UPDATE team_invites SET editor_id = ? WHERE id = ?', [userResult.lastInsertRowid, inv.id])
      // Create notification for the new editor
      const company = get('SELECT name FROM companies WHERE id = ?', [inv.company_id])
      run('INSERT INTO notifications (company_id, user_id, type, title, message, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [companyId, userResult.lastInsertRowid, 'team_invite', 'Convite de equipe',
         `${company?.name || 'Uma empresa'} convidou você para a equipe`, inv.id, 'team_invite']
      )
    }

    const user = { id: userResult.lastInsertRowid, company_id: companyId, role: 'editor', name, email }
    const token = generateToken(user)
    return res.json({ token, user: { id: user.id, name, email, role: 'editor', company_id: companyId } })
  }

  // Gestor registration: creates workspace
  const { plan_id } = req.body
  if (!name || !email || !password || !companyName) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' })
  }

  const existing = get('SELECT id FROM users WHERE email = ?', [email])
  if (existing) return res.status(400).json({ error: 'Email já cadastrado' })

  // Validate chosen plan (if provided)
  let chosenPlan = null
  if (plan_id) {
    chosenPlan = get('SELECT * FROM plans WHERE id = ? AND active = 1', [plan_id])
  }
  if (!chosenPlan) {
    chosenPlan = get('SELECT * FROM plans WHERE active = 1 ORDER BY price LIMIT 1')
  }

  const hash = bcrypt.hashSync(password, 10)
  const companyResult = run('INSERT INTO companies (name) VALUES (?)', [companyName])
  const companyId = companyResult.lastInsertRowid

  const userResult = run(
    'INSERT INTO users (company_id, name, email, password, role) VALUES (?, ?, ?, ?, ?)',
    [companyId, name, email, hash, 'gestor']
  )

  // Create subscription with 'pending' status — needs payment to activate
  run(
    'INSERT INTO subscriptions (company_id, plan_id, status) VALUES (?, ?, ?)',
    [companyId, chosenPlan?.id || 1, 'pending']
  )

  const user = { id: userResult.lastInsertRowid, company_id: companyId, role: 'gestor', name, email }
  const token = generateToken(user)
  res.json({ token, user: { id: user.id, name, email, role: 'gestor', company_id: companyId, plan_name: chosenPlan?.name || 'Profissional' } })
})

router.post('/auth/login', (req, res) => {
  const { email, password } = req.body
  const user = get(
    'SELECT u.*, c.name as company_name FROM users u JOIN companies c ON c.id = u.company_id WHERE u.email = ?',
    [email]
  )

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Credenciais inválidas' })
  }

  const token = generateToken(user)
  res.json({
    token,
    user: {
      id: user.id, name: user.name, email: user.email,
      role: user.role, company_id: user.company_id,
      company_name: user.company_name, avatar: user.avatar
    }
  })
})

router.get('/auth/me', authMiddleware, (req, res) => {
  const user = get(
    'SELECT u.id, u.name, u.email, u.role, u.company_id, u.avatar, u.phone, c.name as company_name, c.logo as company_logo, c.primary_color FROM users u JOIN companies c ON c.id = u.company_id WHERE u.id = ?',
    [req.user.id]
  )
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' })
  if (user.role === 'cliente') {
    const client = get('SELECT id, name FROM clients WHERE user_id = ? AND company_id = ?', [user.id, user.company_id])
    user.client_id = client?.id || null
    user.client_name = client?.name || null
  }
  if (user.role === 'editor') {
    // Return list of teams this editor belongs to
    user.teams = all(
      `SELECT tm.id as membership_id, tm.company_id, c.name as company_name, tm.status
       FROM team_memberships tm JOIN companies c ON c.id = tm.company_id
       WHERE tm.user_id = ? AND tm.status = 'active'`,
      [user.id]
    )
  }

  // Attach subscription info for gestor
  if (user.role === 'gestor' || user.role === 'admin') {
    const sub = get(
      'SELECT s.*, p.name as plan_name, p.price as plan_price FROM subscriptions s LEFT JOIN plans p ON p.id = s.plan_id WHERE s.company_id = ?',
      [user.company_id]
    )
    user.subscription = sub || null
  }

  res.json(user)
})

// Update user avatar and/or name
router.put('/auth/profile', authMiddleware, (req, res) => {
  const { avatar, name } = req.body

  if (avatar !== undefined) {
    // empty string = remove avatar
    run('UPDATE users SET avatar = ? WHERE id = ?', [avatar || null, req.user.id])
  }
  if (name && name.trim()) {
    run('UPDATE users SET name = ? WHERE id = ?', [name.trim(), req.user.id])
  }

  const user = get(
    'SELECT u.id, u.name, u.email, u.role, u.company_id, u.avatar, u.phone, c.name as company_name, c.logo as company_logo, c.primary_color FROM users u JOIN companies c ON c.id = u.company_id WHERE u.id = ?',
    [req.user.id]
  )
  res.json(user)
})

// ============ INVITES ============

router.post('/clients/:id/invite', authMiddleware, requireRole('gestor'), (req, res) => {
  const client = get('SELECT * FROM clients WHERE id = ? AND company_id = ?', [req.params.id, req.user.company_id])
  if (!client) return res.status(404).json({ error: 'Cliente não encontrado' })

  const token = crypto.randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  run(
    'INSERT INTO invites (company_id, client_id, token, email, expires_at) VALUES (?, ?, ?, ?, ?)',
    [req.user.company_id, client.id, token, client.email || null, expiresAt]
  )

  res.json({ token, url: `/invite/${token}`, expires_at: expiresAt })
})

router.get('/invite/:token', (req, res) => {
  const invite = get(
    `SELECT i.*, c.name as client_name, co.name as company_name
     FROM invites i
     JOIN clients c ON c.id = i.client_id
     JOIN companies co ON co.id = i.company_id
     WHERE i.token = ? AND i.used = 0`,
    [req.params.token]
  )
  if (!invite) return res.status(404).json({ error: 'Convite inválido ou expirado' })
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Convite expirado' })
  }
  res.json({ client_name: invite.client_name, company_name: invite.company_name, email: invite.email })
})

router.post('/auth/register-client', (req, res) => {
  const { name, email, password, invite_token } = req.body
  if (!name || !email || !password) return res.status(400).json({ error: 'Campos obrigatórios faltando' })

  const existing = get('SELECT id FROM users WHERE email = ?', [email])
  if (existing) return res.status(400).json({ error: 'Email já cadastrado' })

  let companyId, clientId

  if (invite_token) {
    const invite = get(
      'SELECT * FROM invites WHERE token = ? AND used = 0',
      [invite_token]
    )
    if (!invite) return res.status(400).json({ error: 'Convite inválido' })
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Convite expirado' })
    }
    companyId = invite.company_id
    clientId = invite.client_id
    run('UPDATE invites SET used = 1 WHERE id = ?', [invite.id])
  } else {
    const client = get(
      'SELECT c.*, co.id as co_id FROM clients c JOIN companies co ON co.id = c.company_id WHERE c.email = ? AND c.active = 1 AND c.user_id IS NULL',
      [email]
    )
    if (!client) return res.status(400).json({ error: 'Nenhum convite encontrado para este email. Solicite um convite ao gestor.' })
    companyId = client.co_id
    clientId = client.id
  }

  const hash = bcrypt.hashSync(password, 10)
  const userResult = run(
    'INSERT INTO users (company_id, name, email, password, role) VALUES (?, ?, ?, ?, ?)',
    [companyId, name, email, hash, 'cliente']
  )

  run('UPDATE clients SET user_id = ? WHERE id = ?', [userResult.lastInsertRowid, clientId])

  const user = { id: userResult.lastInsertRowid, company_id: companyId, role: 'cliente', name, email }
  const token = generateToken(user)
  res.json({ token, user: { ...user, client_id: clientId } })
})

// ============ CLIENT PORTAL ============

router.get('/client/projects', authMiddleware, requireRole('cliente'), (req, res) => {
  const client = get('SELECT id FROM clients WHERE user_id = ? AND company_id = ?', [req.user.id, req.user.company_id])
  if (!client) return res.status(404).json({ error: 'Cliente não vinculado' })

  const orders = all(
    `SELECT o.id, o.title, o.description, o.briefing, o.drive_links, o.priority,
       o.due_date, o.value, o.approved, o.delivery_url, o.delivery_notes,
       o.video_type, o.duration, o.format, o.created_at, o.updated_at,
       o.client_id, o.column_id, o.company_id,
       kc.name as column_name, kc.color as column_color
     FROM orders o
     LEFT JOIN kanban_columns kc ON kc.id = o.column_id
     WHERE o.client_id = ?
     ORDER BY o.updated_at DESC`,
    [client.id]
  )

  const columns = all(
    'SELECT * FROM kanban_columns WHERE client_id = ? ORDER BY position',
    [client.id]
  )

  const stats = {
    total: orders.length,
    completed: orders.filter(o => o.column_name === 'Finalizado').length,
    inProgress: orders.filter(o => !['Finalizado', 'Não iniciado'].includes(o.column_name)).length,
    approved: orders.filter(o => o.approved).length,
  }

  res.json({ orders, columns, stats })
})

router.post('/client/orders/:id/approve', authMiddleware, requireRole('cliente'), (req, res) => {
  const client = get('SELECT id FROM clients WHERE user_id = ? AND company_id = ?', [req.user.id, req.user.company_id])
  if (!client) return res.status(403).json({ error: 'Sem permissão' })

  const order = get('SELECT * FROM orders WHERE id = ? AND client_id = ?', [req.params.id, client.id])
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' })

  const finishedCol = get(
    "SELECT id FROM kanban_columns WHERE client_id = ? AND name = 'Finalizado'",
    [client.id]
  )

  run(
    'UPDATE orders SET approved = 1, approved_at = CURRENT_TIMESTAMP, approved_by = ?, column_id = COALESCE(?, column_id) WHERE id = ?',
    [req.user.id, finishedCol?.id, req.params.id]
  )

  run('INSERT INTO activity_log (company_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.company_id, req.user.id, 'approved', 'order', req.params.id, `Cliente aprovou "${order.title}"`]
  )

  if (order.editor_id) {
    run('INSERT INTO notifications (company_id, user_id, type, title, message, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.company_id, order.editor_id, 'approved', 'Vídeo aprovado', `O cliente aprovou "${order.title}"`, order.id, 'order']
    )
  }

  res.json({ success: true })
})

router.post('/client/orders/:id/request-changes', authMiddleware, requireRole('cliente'), (req, res) => {
  const { text, timestamp_mark } = req.body
  const client = get('SELECT id FROM clients WHERE user_id = ? AND company_id = ?', [req.user.id, req.user.company_id])
  if (!client) return res.status(403).json({ error: 'Sem permissão' })

  const order = get('SELECT * FROM orders WHERE id = ? AND client_id = ?', [req.params.id, client.id])
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' })

  const correctionCol = get(
    "SELECT id FROM kanban_columns WHERE client_id = ? AND name = 'Correção'",
    [client.id]
  )

  run('INSERT INTO comments (order_id, user_id, text, timestamp_mark) VALUES (?, ?, ?, ?)',
    [req.params.id, req.user.id, text, timestamp_mark || null]
  )

  if (correctionCol) {
    run('UPDATE orders SET column_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [correctionCol.id, req.params.id]
    )
  }

  run('INSERT INTO activity_log (company_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.company_id, req.user.id, 'requested_changes', 'order', req.params.id, `Cliente solicitou alterações em "${order.title}"`]
  )

  if (order.editor_id) {
    run('INSERT INTO notifications (company_id, user_id, type, title, message, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.company_id, order.editor_id, 'changes_requested', 'Alteração solicitada', `Cliente solicitou alterações em "${order.title}"`, order.id, 'order']
    )
  }

  res.json({ success: true })
})

// Client financial view (read-only)
router.get('/client/financial', authMiddleware, requireRole('cliente'), (req, res) => {
  const client = get('SELECT id FROM clients WHERE user_id = ? AND company_id = ?', [req.user.id, req.user.company_id])
  if (!client) return res.status(404).json({ error: 'Cliente nao vinculado' })

  // All invoices for this client
  const invoices = all(`
    SELECT ci.*, GROUP_CONCAT(o.title, ', ') as order_titles, COUNT(cii.id) as item_count
    FROM client_invoices ci
    LEFT JOIN client_invoice_items cii ON cii.invoice_id = ci.id
    LEFT JOIN orders o ON o.id = cii.order_id
    WHERE ci.client_id = ?
    GROUP BY ci.id
    ORDER BY ci.created_at DESC
  `, [client.id])

  // Orders with values for this client (value only, no editor_value)
  const orders = all(`
    SELECT o.id, o.title, o.value, o.updated_at,
      kc.name as column_name, kc.color as column_color,
      (SELECT ci.id FROM client_invoice_items cii JOIN client_invoices ci ON ci.id = cii.invoice_id WHERE cii.order_id = o.id LIMIT 1) as invoice_id,
      (SELECT ci.status FROM client_invoice_items cii JOIN client_invoices ci ON ci.id = cii.invoice_id WHERE cii.order_id = o.id LIMIT 1) as invoice_status
    FROM orders o
    LEFT JOIN kanban_columns kc ON kc.id = o.column_id
    WHERE o.client_id = ?
    ORDER BY o.updated_at DESC
  `, [client.id])

  // Client standalone entries
  const clientEntries = all(`
    SELECT cse.id, cse.amount, cse.description, cse.entry_date, cse.status, cse.proof_url, cse.paid_at, cse.created_at
    FROM client_standalone_entries cse
    WHERE cse.client_id = ? AND cse.company_id = ?
    ORDER BY cse.entry_date DESC
  `, [client.id, req.user.company_id])

  const totalValue = orders.reduce((s, o) => s + (o.value || 0), 0)
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total_amount || 0), 0)
    + clientEntries.filter(e => e.status === 'paid').reduce((s, e) => s + (e.amount || 0), 0)
  const totalPending = invoices.filter(i => i.status === 'pending').reduce((s, i) => s + (i.total_amount || 0), 0)
    + clientEntries.filter(e => e.status === 'pending').reduce((s, e) => s + (e.amount || 0), 0)

  res.json({ invoices, orders, clientEntries, totalValue, totalPaid, totalPending })
})

// Client get invoice items (read-only)
router.get('/client/invoices/:id/items', authMiddleware, requireRole('cliente'), (req, res) => {
  const client = get('SELECT id FROM clients WHERE user_id = ? AND company_id = ?', [req.user.id, req.user.company_id])
  if (!client) return res.status(404).json({ error: 'Cliente nao vinculado' })

  const invoice = get('SELECT * FROM client_invoices WHERE id = ? AND client_id = ?', [req.params.id, client.id])
  if (!invoice) return res.status(404).json({ error: 'Fatura nao encontrada' })

  const items = all(`
    SELECT cii.*, o.title as order_title, o.description, u.name as editor_name, c.name as client_name
    FROM client_invoice_items cii
    JOIN orders o ON o.id = cii.order_id
    LEFT JOIN users u ON u.id = o.editor_id
    LEFT JOIN clients c ON c.id = o.client_id
    WHERE cii.invoice_id = ?
  `, [req.params.id])

  res.json({ invoice, items })
})

// ============ EDITOR PORTAL ============

router.get('/editor/dashboard', authMiddleware, requireRole('editor'), (req, res) => {
  const uid = req.user.id

  // Get all company IDs this editor has access to (personal + team memberships)
  const memberCompanyIds = all(
    "SELECT company_id FROM team_memberships WHERE user_id = ? AND status = 'active'",
    [uid]
  ).map(r => r.company_id)

  // Orders from ALL companies where editor is assigned (not filtered by single company_id)
  const assignedOrders = all(
    `SELECT o.*, kc.name as column_name, kc.color as column_color, c.name as client_name, co.name as company_name
     FROM orders o
     LEFT JOIN kanban_columns kc ON kc.id = o.column_id
     LEFT JOIN clients c ON c.id = o.client_id
     LEFT JOIN companies co ON co.id = o.company_id
     WHERE o.editor_id = ?
     ORDER BY CASE WHEN kc.name = 'Finalizado' THEN 1 ELSE 0 END, o.updated_at DESC`,
    [uid]
  )

  const totalAssigned = assignedOrders.length
  const completed = assignedOrders.filter(o => o.column_name === 'Finalizado').length
  const pending = totalAssigned - completed
  const overdue = assignedOrders.filter(o => o.due_date && new Date(o.due_date) < new Date() && o.column_name !== 'Finalizado').length

  const totalEarned = get(
    "SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE editor_id = ? AND status = 'paid'",
    [uid]
  ).total
  const pendingPayment = get(
    "SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE editor_id = ? AND status = 'pending'",
    [uid]
  ).total

  const recentPayments = all(
    "SELECT p.*, o.title as order_title FROM payments p LEFT JOIN orders o ON o.id = p.order_id WHERE p.editor_id = ? ORDER BY p.created_at DESC LIMIT 10",
    [uid]
  )

  // Pending team invites count
  const pendingInvites = all(
    "SELECT ti.id, c.name as company_name FROM team_invites ti JOIN companies c ON c.id = ti.company_id WHERE ti.editor_id = ? AND ti.status = 'pending'",
    [uid]
  )

  res.json({
    stats: { totalAssigned, completed, pending, overdue, totalEarned, pendingPayment },
    orders: assignedOrders,
    recentPayments,
    teams: memberCompanyIds.length,
    pendingInvites,
  })
})

// Editor kanban board: shows all orders assigned to editor across ALL companies
router.get('/editor/board', authMiddleware, requireRole('editor'), (req, res) => {
  const uid = req.user.id

  // Get all distinct client+company combos where this editor has assignments
  const combos = all(
    'SELECT DISTINCT client_id, company_id FROM orders WHERE editor_id = ?',
    [uid]
  )

  if (combos.length === 0) return res.json({ clients: [] })

  const clients = combos.map(({ client_id, company_id }) => {
    const client = get('SELECT id, name, logo FROM clients WHERE id = ?', [client_id])
    const company = get('SELECT name FROM companies WHERE id = ?', [company_id])
    const columns = all(
      'SELECT * FROM kanban_columns WHERE company_id = ? AND client_id = ? ORDER BY position',
      [company_id, client_id]
    )
    // Only show orders assigned to THIS editor
    const orders = all(
      `SELECT o.*, u.name as editor_name, kc.name as column_name, kc.color as column_color
       FROM orders o
       LEFT JOIN users u ON u.id = o.editor_id
       LEFT JOIN kanban_columns kc ON kc.id = o.column_id
       WHERE o.company_id = ? AND o.client_id = ? AND o.editor_id = ?
       ORDER BY o.position`,
      [company_id, client_id, uid]
    )
    return { ...client, company_id, company_name: company?.name, columns, orders }
  })

  res.json({ clients })
})

// ============ DASHBOARD ============

router.get('/dashboard', authMiddleware, (req, res) => {
  const cid = req.user.company_id

  const totalOrders = get('SELECT COUNT(*) as count FROM orders WHERE company_id = ?', [cid]).count
  const completedOrders = get(
    "SELECT COUNT(*) as count FROM orders o JOIN kanban_columns kc ON kc.id = o.column_id WHERE o.company_id = ? AND kc.name = 'Finalizado'",
    [cid]
  ).count
  const inProgress = get(
    "SELECT COUNT(*) as count FROM orders o JOIN kanban_columns kc ON kc.id = o.column_id WHERE o.company_id = ? AND kc.name NOT IN ('Finalizado', 'Não iniciado')",
    [cid]
  ).count
  const overdue = get(
    "SELECT COUNT(*) as count FROM orders o JOIN kanban_columns kc ON kc.id = o.column_id WHERE o.company_id = ? AND o.due_date < date('now') AND kc.name != 'Finalizado'",
    [cid]
  ).count
  const totalClients = get('SELECT COUNT(*) as count FROM clients WHERE company_id = ? AND active = 1', [cid]).count
  const totalEditors = get("SELECT COUNT(*) as count FROM users WHERE company_id = ? AND role = 'editor' AND active = 1", [cid]).count

  const revenue = get(
    "SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE company_id = ? AND status = 'paid'",
    [cid]
  ).total
  const pendingPayments = get(
    "SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE company_id = ? AND status = 'pending'",
    [cid]
  ).total

  const recentActivity = all(
    'SELECT al.*, u.name as user_name FROM activity_log al LEFT JOIN users u ON u.id = al.user_id WHERE al.company_id = ? ORDER BY al.created_at DESC LIMIT 15',
    [cid]
  )

  const ordersByColumn = all(
    `SELECT kc.name as column_name, kc.color, COUNT(o.id) as count
     FROM kanban_columns kc
     LEFT JOIN orders o ON o.column_id = kc.id
     WHERE kc.company_id = ? AND kc.client_id IS NULL
     GROUP BY kc.id ORDER BY kc.position`,
    [cid]
  )

  const topClients = all(
    `SELECT c.name, COUNT(o.id) as order_count,
     SUM(CASE WHEN kc.name = 'Finalizado' THEN 1 ELSE 0 END) as completed
     FROM clients c
     LEFT JOIN orders o ON o.client_id = c.id
     LEFT JOIN kanban_columns kc ON kc.id = o.column_id
     WHERE c.company_id = ? AND c.active = 1
     GROUP BY c.id ORDER BY order_count DESC LIMIT 5`,
    [cid]
  )

  const editorPerformance = all(
    `SELECT u.name, COUNT(o.id) as total_orders,
     SUM(CASE WHEN kc.name = 'Finalizado' THEN 1 ELSE 0 END) as completed
     FROM users u
     LEFT JOIN orders o ON o.editor_id = u.id
     LEFT JOIN kanban_columns kc ON kc.id = o.column_id
     WHERE u.company_id = ? AND u.role = 'editor'
     GROUP BY u.id ORDER BY completed DESC LIMIT 5`,
    [cid]
  )

  res.json({
    stats: { totalOrders, completedOrders, inProgress, overdue, totalClients, totalEditors, revenue, pendingPayments },
    recentActivity, ordersByColumn, topClients, editorPerformance
  })
})

// ============ CLIENTS ============

router.get('/clients', authMiddleware, (req, res) => {
  const clients = all(
    `SELECT c.*,
     COUNT(o.id) as order_count,
     SUM(CASE WHEN kc.name = 'Finalizado' THEN 1 ELSE 0 END) as completed_count,
     SUM(CASE WHEN kc.name NOT IN ('Finalizado','Não iniciado') THEN 1 ELSE 0 END) as in_progress_count
     FROM clients c
     LEFT JOIN orders o ON o.client_id = c.id
     LEFT JOIN kanban_columns kc ON kc.id = o.column_id
     WHERE c.company_id = ? AND c.active = 1
     GROUP BY c.id ORDER BY c.name`,
    [req.user.company_id]
  )
  res.json(clients)
})

router.post('/clients', authMiddleware, requireRole('gestor'), (req, res) => {
  const { name, contact_name, email, phone, notes } = req.body
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' })

  const result = run(
    'INSERT INTO clients (company_id, name, contact_name, email, phone, notes) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.company_id, name, contact_name || null, email || null, phone || null, notes || null]
  )

  createDefaultColumns(req.user.company_id, result.lastInsertRowid)

  run('INSERT INTO activity_log (company_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.company_id, req.user.id, 'created', 'client', result.lastInsertRowid, `Cliente "${name}" criado`]
  )

  const client = get('SELECT * FROM clients WHERE id = ?', [result.lastInsertRowid])
  res.json(client)
})

router.get('/clients/:id', authMiddleware, (req, res) => {
  const client = get('SELECT * FROM clients WHERE id = ? AND company_id = ?', [req.params.id, req.user.company_id])
  if (!client) return res.status(404).json({ error: 'Cliente não encontrado' })
  res.json(client)
})

router.put('/clients/:id', authMiddleware, requireRole('gestor'), (req, res) => {
  const { name, contact_name, email, phone, notes, logo } = req.body
  run(
    'UPDATE clients SET name = ?, contact_name = ?, email = ?, phone = ?, notes = ?, logo = COALESCE(?, logo) WHERE id = ? AND company_id = ?',
    [name, contact_name, email, phone, notes, logo || null, req.params.id, req.user.company_id]
  )
  const client = get('SELECT * FROM clients WHERE id = ?', [req.params.id])
  res.json(client)
})

// Upload client logo (base64)
router.put('/clients/:id/logo', authMiddleware, requireRole('gestor'), (req, res) => {
  const { logo } = req.body
  if (!logo) return res.status(400).json({ error: 'Logo é obrigatório' })
  run('UPDATE clients SET logo = ? WHERE id = ? AND company_id = ?',
    [logo, req.params.id, req.user.company_id])
  res.json({ success: true, logo })
})

router.delete('/clients/:id', authMiddleware, requireRole('gestor'), (req, res) => {
  run('UPDATE clients SET active = 0 WHERE id = ? AND company_id = ?', [req.params.id, req.user.company_id])
  res.json({ success: true })
})

// ============ KANBAN COLUMNS ============

router.get('/clients/:clientId/columns', authMiddleware, (req, res) => {
  const columns = all(
    'SELECT * FROM kanban_columns WHERE company_id = ? AND client_id = ? ORDER BY position',
    [req.user.company_id, req.params.clientId]
  )
  res.json(columns)
})

router.post('/clients/:clientId/columns', authMiddleware, requireRole('gestor'), (req, res) => {
  const { name, color } = req.body
  const maxPos = get(
    'SELECT MAX(position) as max FROM kanban_columns WHERE company_id = ? AND client_id = ?',
    [req.user.company_id, req.params.clientId]
  )
  const result = run(
    'INSERT INTO kanban_columns (company_id, client_id, name, color, position) VALUES (?, ?, ?, ?, ?)',
    [req.user.company_id, req.params.clientId, name, color || '#6c5ce7', (maxPos?.max || 0) + 1]
  )
  const column = get('SELECT * FROM kanban_columns WHERE id = ?', [result.lastInsertRowid])
  res.json(column)
})

// ============ ORDERS ============

router.get('/clients/:clientId/orders', authMiddleware, (req, res) => {
  const { month } = req.query // format: YYYY-MM
  let where = 'o.company_id = ? AND o.client_id = ?'
  const params = [req.user.company_id, req.params.clientId]

  if (month) {
    where += " AND strftime('%Y-%m', o.created_at) = ?"
    params.push(month)
  }

  const orders = all(
    `SELECT o.*, u.name as editor_name, kc.name as column_name, kc.color as column_color
     FROM orders o
     LEFT JOIN users u ON u.id = o.editor_id
     LEFT JOIN kanban_columns kc ON kc.id = o.column_id
     WHERE ${where}
     ORDER BY o.position`,
    params
  )
  res.json(orders)
})

router.get('/orders', authMiddleware, (req, res) => {
  const params = [req.user.company_id]
  let query = `SELECT o.*, u.name as editor_name, kc.name as column_name, kc.color as column_color, c.name as client_name
     FROM orders o
     LEFT JOIN users u ON u.id = o.editor_id
     LEFT JOIN kanban_columns kc ON kc.id = o.column_id
     LEFT JOIN clients c ON c.id = o.client_id
     WHERE o.company_id = ?`

  if (req.user.role === 'editor') {
    query += ' AND o.editor_id = ?'
    params.push(req.user.id)
  }

  query += ' ORDER BY o.updated_at DESC'
  res.json(all(query, params))
})

router.post('/clients/:clientId/orders', authMiddleware, requireRole('gestor', 'supervisor', 'cliente'), (req, res) => {
  const { title, description, briefing, drive_links, priority, due_date, editor_id, value, editor_value, video_type, duration, format } = req.body
  if (!title) return res.status(400).json({ error: 'Título é obrigatório' })

  // For client users, verify they own this client record
  if (req.user.role === 'cliente') {
    const client = get('SELECT id FROM clients WHERE id = ? AND user_id = ? AND company_id = ?',
      [req.params.clientId, req.user.id, req.user.company_id])
    if (!client) return res.status(403).json({ error: 'Sem permissão para criar pedidos neste cliente' })
  }

  const firstCol = get(
    'SELECT id FROM kanban_columns WHERE company_id = ? AND client_id = ? ORDER BY position LIMIT 1',
    [req.user.company_id, req.params.clientId]
  )

  const maxPos = get(
    'SELECT MAX(position) as max FROM orders WHERE company_id = ? AND client_id = ? AND column_id = ?',
    [req.user.company_id, req.params.clientId, firstCol?.id]
  )

  const orderValue = value ? parseFloat(value) : 0
  const editorValue = editor_value ? parseFloat(editor_value) : 0

  const result = run(
    `INSERT INTO orders (company_id, client_id, column_id, editor_id, title, description, briefing, drive_links, priority, due_date, position, value, editor_value, video_type, duration, format)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user.company_id, req.params.clientId, firstCol?.id || null,
      editor_id || null, title, description || null, briefing || null,
      drive_links || null, priority || 'normal', due_date || null, (maxPos?.max || 0) + 1, orderValue, editorValue,
      video_type || null, duration || null, format || null
    ]
  )

  const orderId = result.lastInsertRowid

  run('INSERT INTO activity_log (company_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.company_id, req.user.id, 'created', 'order', orderId, `Pedido "${title}" criado`]
  )

  if (editor_id) {
    run('INSERT INTO notifications (company_id, user_id, type, title, message, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.company_id, editor_id, 'new_order', 'Novo pedido', `Você recebeu o pedido "${title}"`, orderId, 'order']
    )
    // Auto-create pending payment if editor_value > 0
    if (editorValue > 0) {
      run('INSERT INTO payments (company_id, editor_id, order_id, amount, status) VALUES (?, ?, ?, ?, ?)',
        [req.user.company_id, editor_id, orderId, editorValue, 'pending']
      )
    }
  }

  // Notify gestor(s) if created by client
  if (req.user.role === 'cliente') {
    const gestores = all("SELECT id FROM users WHERE company_id = ? AND role = 'gestor'", [req.user.company_id])
    for (const g of gestores) {
      run('INSERT INTO notifications (company_id, user_id, type, title, message, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [req.user.company_id, g.id, 'new_order', 'Novo pedido do cliente', `Cliente criou o pedido "${title}"`, orderId, 'order']
      )
    }
  }

  const order = get(
    'SELECT o.*, u.name as editor_name FROM orders o LEFT JOIN users u ON u.id = o.editor_id WHERE o.id = ?',
    [orderId]
  )
  res.json(order)
})

router.put('/orders/:id', authMiddleware, (req, res) => {
  // Editors can update orders from any company they belong to (multi-team)
  let order
  if (req.user.role === 'editor') {
    order = get('SELECT * FROM orders WHERE id = ? AND editor_id = ?', [req.params.id, req.user.id])
  } else {
    order = get('SELECT * FROM orders WHERE id = ? AND company_id = ?', [req.params.id, req.user.company_id])
  }
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' })

  // Helper: undefined -> null (sql.js cannot bind undefined)
  const n = (v) => v === undefined ? null : v

  const { title, description, briefing, drive_links, priority, due_date, editor_id, column_id, position, value, editor_value } = req.body

  // Column movement restrictions for editors:
  // Editors can ONLY move cards between "Liberado", "Para edição", "Editado", "Correção"
  // Editors CANNOT touch "Não iniciado" or "Finalizado" columns (gestor only)
  if (column_id && column_id !== order.column_id && req.user.role === 'editor') {
    const oldCol = get('SELECT name FROM kanban_columns WHERE id = ?', [order.column_id])
    const newCol = get('SELECT name FROM kanban_columns WHERE id = ?', [column_id])
    const normalize = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    const oldName = normalize(oldCol?.name)
    const newName = normalize(newCol?.name)

    const blocked =
      oldName === 'nao iniciado' ||
      oldName === 'finalizado' ||
      newName === 'nao iniciado' ||
      newName === 'finalizado'

    if (blocked) {
      return res.status(403).json({ error: 'Apenas o gestor pode mover para/de esta coluna' })
    }
  }

  run(
    `UPDATE orders SET
     title = COALESCE(?, title), description = COALESCE(?, description),
     briefing = COALESCE(?, briefing), drive_links = COALESCE(?, drive_links),
     priority = COALESCE(?, priority), due_date = COALESCE(?, due_date),
     editor_id = COALESCE(?, editor_id), column_id = COALESCE(?, column_id),
     position = COALESCE(?, position), value = COALESCE(?, value),
     editor_value = COALESCE(?, editor_value),
     updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [n(title), n(description), n(briefing), n(drive_links), n(priority), n(due_date), n(editor_id), n(column_id), n(position), n(value !== undefined ? parseFloat(value) : undefined), n(editor_value !== undefined ? parseFloat(editor_value) : undefined), req.params.id]
  )

  if (column_id && column_id !== order.column_id) {
    const col = get('SELECT name FROM kanban_columns WHERE id = ?', [column_id])
    run('INSERT INTO activity_log (company_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.company_id, req.user.id, 'moved', 'order', req.params.id, `Pedido movido para "${col?.name}"`]
    )
  }

  // Notify editor if newly assigned
  if (editor_id && editor_id !== order.editor_id) {
    run('INSERT INTO notifications (company_id, user_id, type, title, message, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.company_id, editor_id, 'new_order', 'Novo pedido atribuido', `Voce recebeu o pedido "${order.title}"`, order.id, 'order']
    )
    run('INSERT INTO activity_log (company_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.company_id, req.user.id, 'assigned', 'order', req.params.id, `Editor atribuido ao pedido "${order.title}"`]
    )
  }

  // Sync payment: re-read updated order to get final editor_id and editor_value
  const updatedOrder = get('SELECT * FROM orders WHERE id = ?', [req.params.id])
  const finalEditorId = updatedOrder.editor_id
  const finalEditorValue = updatedOrder.editor_value || 0

  // Delete old pending payment for this order if editor/value changed
  const editorChanged = editor_id !== undefined && editor_id !== order.editor_id
  const valueChanged = value !== undefined && parseFloat(value) !== order.value
  const editorValueChanged = editor_value !== undefined && parseFloat(editor_value) !== order.editor_value
  if (editorChanged || valueChanged || editorValueChanged) {
    run("DELETE FROM payments WHERE order_id = ? AND status = 'pending'", [req.params.id])
    // Create new pending payment if there's an editor and editor_value
    if (finalEditorId && finalEditorValue > 0) {
      run('INSERT INTO payments (company_id, editor_id, order_id, amount, status) VALUES (?, ?, ?, ?, ?)',
        [req.user.company_id, finalEditorId, req.params.id, finalEditorValue, 'pending']
      )
    }
  }

  const updated = get(
    'SELECT o.*, u.name as editor_name, kc.name as column_name FROM orders o LEFT JOIN users u ON u.id = o.editor_id LEFT JOIN kanban_columns kc ON kc.id = o.column_id WHERE o.id = ?',
    [req.params.id]
  )
  res.json(updated)
})

router.delete('/orders/:id', authMiddleware, requireRole('gestor'), (req, res) => {
  run('DELETE FROM orders WHERE id = ? AND company_id = ?', [req.params.id, req.user.company_id])
  res.json({ success: true })
})

// ============ ORDER DETAILS ============

router.get('/orders/:id/comments', authMiddleware, (req, res) => {
  const comments = all(
    'SELECT c.*, u.name as user_name, u.avatar as user_avatar FROM comments c JOIN users u ON u.id = c.user_id WHERE c.order_id = ? ORDER BY c.created_at',
    [req.params.id]
  )
  res.json(comments)
})

router.post('/orders/:id/comments', authMiddleware, (req, res) => {
  const { text, timestamp_mark } = req.body
  const result = run(
    'INSERT INTO comments (order_id, user_id, text, timestamp_mark) VALUES (?, ?, ?, ?)',
    [req.params.id, req.user.id, text, timestamp_mark || null]
  )
  const comment = get(
    'SELECT c.*, u.name as user_name FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?',
    [result.lastInsertRowid]
  )
  res.json(comment)
})

router.get('/orders/:id/checklist', authMiddleware, (req, res) => {
  res.json(all('SELECT * FROM order_checklist WHERE order_id = ?', [req.params.id]))
})

router.post('/orders/:id/checklist', authMiddleware, (req, res) => {
  const { text } = req.body
  const result = run('INSERT INTO order_checklist (order_id, text) VALUES (?, ?)', [req.params.id, text])
  res.json(get('SELECT * FROM order_checklist WHERE id = ?', [result.lastInsertRowid]))
})

router.put('/checklist/:id', authMiddleware, (req, res) => {
  const { done } = req.body
  run('UPDATE order_checklist SET done = ? WHERE id = ?', [done ? 1 : 0, req.params.id])
  res.json({ success: true })
})

router.get('/orders/:id/versions', authMiddleware, (req, res) => {
  const versions = all(
    'SELECT v.*, u.name as user_name FROM versions v JOIN users u ON u.id = v.user_id WHERE v.order_id = ? ORDER BY v.version_number DESC',
    [req.params.id]
  )
  res.json(versions)
})

router.post('/orders/:id/versions', authMiddleware, (req, res) => {
  const { file_url, notes } = req.body
  const maxVer = get('SELECT MAX(version_number) as max FROM versions WHERE order_id = ?', [req.params.id])
  const result = run(
    'INSERT INTO versions (order_id, user_id, file_url, notes, version_number) VALUES (?, ?, ?, ?, ?)',
    [req.params.id, req.user.id, file_url, notes || null, (maxVer?.max || 0) + 1]
  )
  const version = get('SELECT v.*, u.name as user_name FROM versions v JOIN users u ON u.id = v.user_id WHERE v.id = ?', [result.lastInsertRowid])
  res.json(version)
})

// ============ TEAM (Editors) ============

router.get('/team', authMiddleware, (req, res) => {
  const cid = req.user.company_id

  // Direct company editors/supervisors
  const members = all(
    `SELECT u.id, u.name, u.email, u.role, u.phone, u.specialty, u.default_rate, u.avatar, u.active, u.created_at,
     COUNT(o.id) as total_orders,
     SUM(CASE WHEN kc.name = 'Finalizado' THEN 1 ELSE 0 END) as completed_orders,
     'direct' as membership_type
     FROM users u
     LEFT JOIN orders o ON o.editor_id = u.id
     LEFT JOIN kanban_columns kc ON kc.id = o.column_id
     WHERE u.company_id = ? AND u.role IN ('editor','supervisor') AND u.active = 1
     GROUP BY u.id ORDER BY u.name`,
    [cid]
  )

  // Editors from team_memberships (multi-team)
  const teamEditors = all(
    `SELECT u.id, u.name, u.email, u.role, u.phone, u.specialty, u.default_rate, u.avatar, u.active, u.created_at,
     COUNT(o.id) as total_orders,
     SUM(CASE WHEN kc.name = 'Finalizado' THEN 1 ELSE 0 END) as completed_orders,
     'membership' as membership_type
     FROM team_memberships tm
     JOIN users u ON u.id = tm.user_id
     LEFT JOIN orders o ON o.editor_id = u.id AND o.company_id = ?
     LEFT JOIN kanban_columns kc ON kc.id = o.column_id
     WHERE tm.company_id = ? AND tm.status = 'active' AND u.active = 1
     GROUP BY u.id ORDER BY u.name`,
    [cid, cid]
  )

  // Merge without duplicates
  for (const te of teamEditors) {
    if (!members.find(m => m.id === te.id)) {
      members.push(te)
    }
  }

  // Add company gestor(s) to the list so they can be assigned as editor
  const gestors = all(
    `SELECT u.id, u.name, u.email, u.role, u.phone, u.specialty, u.default_rate, u.avatar, u.active, u.created_at, 0 as total_orders, 0 as completed_orders, 'direct' as membership_type
     FROM users u WHERE u.company_id = ? AND u.role = 'gestor' AND u.active = 1`,
    [cid]
  )
  for (const g of gestors) {
    if (!members.find(m => m.id === g.id)) {
      members.unshift(g)
    }
  }
  res.json(members)
})

router.post('/team', authMiddleware, requireRole('gestor'), (req, res) => {
  const { name, email, password, phone, pix_key, bank_info, specialty, default_rate, role } = req.body
  if (!name || !email || !password) return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' })

  const existing = get('SELECT id FROM users WHERE email = ?', [email])
  if (existing) return res.status(400).json({ error: 'Email já cadastrado' })

  const hash = bcrypt.hashSync(password, 10)
  const result = run(
    'INSERT INTO users (company_id, name, email, password, role, phone, pix_key, bank_info, specialty, default_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [req.user.company_id, name, email, hash, role || 'editor', phone || null, pix_key || null, bank_info || null, specialty || null, default_rate || 0]
  )

  run('INSERT INTO activity_log (company_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.company_id, req.user.id, 'created', 'editor', result.lastInsertRowid, `Editor "${name}" cadastrado`]
  )

  const user = get('SELECT id, name, email, role, phone, specialty, default_rate, avatar, active FROM users WHERE id = ?', [result.lastInsertRowid])
  res.json(user)
})

router.put('/team/:id', authMiddleware, requireRole('gestor'), (req, res) => {
  const { name, email, phone, pix_key, bank_info, specialty, default_rate } = req.body
  run(
    'UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email), phone = ?, pix_key = ?, bank_info = ?, specialty = ?, default_rate = ? WHERE id = ? AND company_id = ?',
    [name, email, phone, pix_key, bank_info, specialty, default_rate || 0, req.params.id, req.user.company_id]
  )
  const user = get('SELECT id, name, email, role, phone, specialty, default_rate, avatar, active FROM users WHERE id = ?', [req.params.id])
  res.json(user)
})

router.delete('/team/:id', authMiddleware, requireRole('gestor'), (req, res) => {
  const uid = req.params.id
  const cid = req.user.company_id

  // Check if this is a direct company member
  const directMember = get('SELECT id FROM users WHERE id = ? AND company_id = ?', [uid, cid])

  if (directMember) {
    // Direct member: deactivate
    run('UPDATE users SET active = 0 WHERE id = ? AND company_id = ?', [uid, cid])
  } else {
    // Multi-team membership: remove the membership link
    run('DELETE FROM team_memberships WHERE user_id = ? AND company_id = ?', [uid, cid])
    // Also remove any pending invites
    run("DELETE FROM team_invites WHERE editor_id = ? AND company_id = ?", [uid, cid])
  }

  res.json({ success: true })
})

// ============ TEAM INVITES (multi-team) ============

// Gestor invites an editor by email to join their company
router.post('/team/invite', authMiddleware, requireRole('gestor'), (req, res) => {
  const { email } = req.body
  if (!email) return res.status(400).json({ error: 'Email é obrigatório' })

  const companyId = req.user.company_id
  const company = get('SELECT name FROM companies WHERE id = ?', [companyId])

  // Check if there's already a pending invite for this email + company
  const existingInvite = get(
    "SELECT * FROM team_invites WHERE company_id = ? AND editor_email = ? AND status = 'pending'",
    [companyId, email]
  )
  if (existingInvite) return res.status(400).json({ error: 'Já existe um convite pendente para este email' })

  // Look up the editor user
  const editor = get("SELECT id, name, email, role, company_id FROM users WHERE email = ? AND role = 'editor'", [email])

  if (editor) {
    // Check if editor is already a member
    const existingMembership = get(
      "SELECT * FROM team_memberships WHERE user_id = ? AND company_id = ? AND status = 'active'",
      [editor.id, companyId]
    )
    if (existingMembership) return res.status(400).json({ error: 'Este editor já faz parte da sua equipe' })

    // Create invite linked to editor
    const result = run(
      'INSERT INTO team_invites (company_id, editor_id, editor_email, invited_by, status) VALUES (?, ?, ?, ?, ?)',
      [companyId, editor.id, email, req.user.id, 'pending']
    )

    // Create notification for the editor (in their personal company context)
    run('INSERT INTO notifications (company_id, user_id, type, title, message, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [editor.company_id, editor.id, 'team_invite', 'Convite de equipe',
       `${company?.name || 'Uma empresa'} convidou você para a equipe`, result.lastInsertRowid, 'team_invite']
    )

    res.json({ success: true, status: 'invited', editor_name: editor.name, message: `Convite enviado para ${editor.name}` })
  } else {
    // Editor not registered yet — create pending invite by email
    run(
      'INSERT INTO team_invites (company_id, editor_id, editor_email, invited_by, status) VALUES (?, ?, ?, ?, ?)',
      [companyId, null, email, req.user.id, 'pending']
    )

    res.json({ success: true, status: 'pending_registration', message: `Convite criado. ${email} receberá o convite ao criar uma conta de editor.` })
  }
})

// Get pending invites for the gestor's company
router.get('/team/invites', authMiddleware, requireRole('gestor'), (req, res) => {
  const invites = all(
    `SELECT ti.*, u.name as editor_name, inv.name as invited_by_name
     FROM team_invites ti
     LEFT JOIN users u ON u.id = ti.editor_id
     LEFT JOIN users inv ON inv.id = ti.invited_by
     WHERE ti.company_id = ?
     ORDER BY ti.created_at DESC`,
    [req.user.company_id]
  )
  res.json(invites)
})

// Editor accepts a team invite
router.post('/team/invite/:id/accept', authMiddleware, (req, res) => {
  const invite = get('SELECT * FROM team_invites WHERE id = ? AND editor_id = ? AND status = ?',
    [req.params.id, req.user.id, 'pending'])
  if (!invite) return res.status(404).json({ error: 'Convite não encontrado' })

  const editor = get('SELECT name FROM users WHERE id = ?', [req.user.id])

  // Update invite status
  run('UPDATE team_invites SET status = ? WHERE id = ?', ['accepted', invite.id])

  // Create team membership
  const existing = get('SELECT * FROM team_memberships WHERE user_id = ? AND company_id = ?',
    [req.user.id, invite.company_id])
  if (!existing) {
    run('INSERT INTO team_memberships (user_id, company_id, role, status) VALUES (?, ?, ?, ?)',
      [req.user.id, invite.company_id, 'editor', 'active'])
  } else {
    run('UPDATE team_memberships SET status = ? WHERE id = ?', ['active', existing.id])
  }

  // Notify the gestor who invited
  const company = get('SELECT name FROM companies WHERE id = ?', [invite.company_id])
  run('INSERT INTO notifications (company_id, user_id, type, title, message, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [invite.company_id, invite.invited_by, 'team_invite_accepted', 'Convite aceito',
     `${editor?.name || 'Um editor'} aceitou o convite e agora faz parte da equipe`, invite.id, 'team_invite']
  )

  res.json({ success: true, company_name: company?.name })
})

// Editor declines a team invite
router.post('/team/invite/:id/decline', authMiddleware, (req, res) => {
  const invite = get('SELECT * FROM team_invites WHERE id = ? AND editor_id = ? AND status = ?',
    [req.params.id, req.user.id, 'pending'])
  if (!invite) return res.status(404).json({ error: 'Convite não encontrado' })

  const editor = get('SELECT name FROM users WHERE id = ?', [req.user.id])

  run('UPDATE team_invites SET status = ? WHERE id = ?', ['declined', invite.id])

  // Notify the gestor
  run('INSERT INTO notifications (company_id, user_id, type, title, message, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [invite.company_id, invite.invited_by, 'team_invite_declined', 'Convite recusado',
     `${editor?.name || 'Um editor'} recusou o convite para a equipe`, invite.id, 'team_invite']
  )

  res.json({ success: true })
})

// Get pending team invites for the logged-in editor
router.get('/my/team-invites', authMiddleware, (req, res) => {
  const invites = all(
    `SELECT ti.*, c.name as company_name, u.name as invited_by_name
     FROM team_invites ti
     JOIN companies c ON c.id = ti.company_id
     LEFT JOIN users u ON u.id = ti.invited_by
     WHERE ti.editor_id = ? AND ti.status = 'pending'
     ORDER BY ti.created_at DESC`,
    [req.user.id]
  )
  res.json(invites)
})

// ============ FINANCIAL ============

router.get('/financial', authMiddleware, (req, res) => {
  const cid = req.user.company_id
  const params = [cid]
  let query = `SELECT p.*, u.name as editor_name, o.title as order_title, c.name as client_name
     FROM payments p
     JOIN users u ON u.id = p.editor_id
     LEFT JOIN orders o ON o.id = p.order_id
     LEFT JOIN clients c ON c.id = o.client_id
     WHERE p.company_id = ?`

  if (req.user.role === 'editor') {
    query += ' AND p.editor_id = ?'
    params.push(req.user.id)
  }

  query += ' ORDER BY p.created_at DESC'
  const payments = all(query, params)

  const paidParams = req.user.role === 'editor' ? [cid, req.user.id] : [cid]
  const totalPaid = get(
    "SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE company_id = ? AND status = 'paid'" + (req.user.role === 'editor' ? ' AND editor_id = ?' : ''),
    paidParams
  ).total
  const totalPending = get(
    "SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE company_id = ? AND status = 'pending'" + (req.user.role === 'editor' ? ' AND editor_id = ?' : ''),
    paidParams
  ).total

  res.json({ payments, totalPaid, totalPending })
})

router.post('/financial', authMiddleware, requireRole('gestor'), (req, res) => {
  const { editor_id, order_id, amount, notes } = req.body
  if (!editor_id || !amount) return res.status(400).json({ error: 'Editor e valor são obrigatórios' })

  const result = run(
    'INSERT INTO payments (company_id, editor_id, order_id, amount, notes) VALUES (?, ?, ?, ?, ?)',
    [req.user.company_id, editor_id, order_id || null, amount, notes || null]
  )

  run('INSERT INTO notifications (company_id, user_id, type, title, message, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.user.company_id, editor_id, 'payment', 'Novo pagamento', `Pagamento de R$ ${Number(amount).toFixed(2)} registrado`, result.lastInsertRowid, 'payment']
  )

  const payment = get(
    'SELECT p.*, u.name as editor_name FROM payments p JOIN users u ON u.id = p.editor_id WHERE p.id = ?',
    [result.lastInsertRowid]
  )
  res.json(payment)
})

router.put('/financial/:id', authMiddleware, requireRole('gestor'), (req, res) => {
  const { status, proof_url } = req.body
  run(
    "UPDATE payments SET status = COALESCE(?, status), proof_url = COALESCE(?, proof_url), paid_at = CASE WHEN ? = 'paid' THEN CURRENT_TIMESTAMP ELSE paid_at END WHERE id = ? AND company_id = ?",
    [status, proof_url, status, req.params.id, req.user.company_id]
  )
  const payment = get(
    'SELECT p.*, u.name as editor_name FROM payments p JOIN users u ON u.id = p.editor_id WHERE p.id = ?',
    [req.params.id]
  )
  res.json(payment)
})

// ============ FINANCIAL MANAGEMENT ============

// Monthly overview
router.get('/financial/overview', authMiddleware, requireRole('gestor'), (req, res) => {
  const cid = req.user.company_id
  const month = req.query.month // YYYY-MM
  if (!month) return res.status(400).json({ error: 'Parâmetro month obrigatório (YYYY-MM)' })

  const startDate = `${month}-01`
  const endDate = `${month}-31`

  // Per-client summary: orders + standalone entries in this month
  const perClient = all(`
    SELECT c.id as client_id, c.name as client_name,
      COUNT(DISTINCT o.id) as total_orders,
      COALESCE((SELECT SUM(o2.value) FROM orders o2 WHERE o2.client_id = c.id AND o2.company_id = ?
        AND DATE(o2.updated_at) BETWEEN ? AND ?), 0) as total_order_value,
      COALESCE((SELECT SUM(cse.amount) FROM client_standalone_entries cse
        WHERE cse.client_id = c.id AND cse.company_id = ?
        AND cse.entry_date BETWEEN ? AND ?), 0) as total_entry_value,
      COALESCE((SELECT SUM(cii.amount) FROM client_invoice_items cii
        JOIN client_invoices ci ON ci.id = cii.invoice_id
        WHERE ci.client_id = c.id AND ci.company_id = ? AND ci.status = 'paid'), 0)
      + COALESCE((SELECT SUM(cse2.amount) FROM client_standalone_entries cse2
        WHERE cse2.client_id = c.id AND cse2.company_id = ? AND cse2.status = 'paid'), 0) as total_received,
      COALESCE((SELECT SUM(cii.amount) FROM client_invoice_items cii
        JOIN client_invoices ci ON ci.id = cii.invoice_id
        WHERE ci.client_id = c.id AND ci.company_id = ? AND ci.status = 'pending'), 0)
      + COALESCE((SELECT SUM(cse3.amount) FROM client_standalone_entries cse3
        WHERE cse3.client_id = c.id AND cse3.company_id = ? AND cse3.status = 'pending'), 0) as total_pending_invoice
    FROM clients c
    LEFT JOIN orders o ON o.client_id = c.id AND o.company_id = ?
      AND DATE(o.updated_at) BETWEEN ? AND ?
    LEFT JOIN client_standalone_entries cse_check ON cse_check.client_id = c.id AND cse_check.company_id = ?
      AND cse_check.entry_date BETWEEN ? AND ?
    WHERE c.company_id = ? AND c.active = 1
    GROUP BY c.id
    HAVING total_orders > 0 OR total_entry_value > 0
    ORDER BY (total_order_value + total_entry_value) DESC
  `, [cid, startDate, endDate, cid, startDate, endDate, cid, cid, cid, cid, cid, startDate, endDate, cid, startDate, endDate, cid])

  // Per-editor summary (includes both direct editors AND team membership editors)
  const perEditor = all(`
    SELECT u.id as editor_id, u.name as editor_name,
      COUNT(o.id) as total_orders,
      COALESCE(SUM(o.editor_value), 0) as total_value,
      COALESCE((SELECT SUM(epi.amount) FROM editor_payment_items epi
        JOIN editor_payment_batches epb ON epb.id = epi.batch_id
        WHERE epb.editor_id = u.id AND epb.company_id = ? AND epb.status = 'paid'), 0) as total_paid,
      COALESCE((SELECT SUM(epi.amount) FROM editor_payment_items epi
        JOIN editor_payment_batches epb ON epb.id = epi.batch_id
        WHERE epb.editor_id = u.id AND epb.company_id = ? AND epb.status = 'pending'), 0) as total_pending_batch
    FROM users u
    LEFT JOIN orders o ON o.editor_id = u.id AND o.company_id = ?
      AND DATE(o.updated_at) BETWEEN ? AND ?
    WHERE (u.company_id = ? OR u.id IN (SELECT user_id FROM team_memberships WHERE company_id = ? AND status = 'active'))
      AND u.role = 'editor' AND u.active = 1
    GROUP BY u.id
    HAVING total_orders > 0
    ORDER BY total_value DESC
  `, [cid, cid, cid, startDate, endDate, cid, cid])

  // Totals (orders + standalone entries)
  const totals = get(`
    SELECT
      COALESCE(SUM(o.value), 0) as total_billed
    FROM orders o
    WHERE o.company_id = ? AND DATE(o.updated_at) BETWEEN ? AND ?
  `, [cid, startDate, endDate])

  const totalBilledEntries = get(`
    SELECT COALESCE(SUM(cse.amount), 0) as total
    FROM client_standalone_entries cse WHERE cse.company_id = ?
    AND cse.entry_date BETWEEN ? AND ?
  `, [cid, startDate, endDate])

  const totalReceivedInvoices = get(`
    SELECT COALESCE(SUM(ci.total_amount), 0) as total
    FROM client_invoices ci WHERE ci.company_id = ? AND ci.status = 'paid'
    AND DATE(ci.paid_at) BETWEEN ? AND ?
  `, [cid, startDate, endDate])

  const totalReceivedEntries = get(`
    SELECT COALESCE(SUM(cse.amount), 0) as total
    FROM client_standalone_entries cse WHERE cse.company_id = ? AND cse.status = 'paid'
    AND DATE(cse.paid_at) BETWEEN ? AND ?
  `, [cid, startDate, endDate])

  const totalPendingInvoices = get(`
    SELECT COALESCE(SUM(ci.total_amount), 0) as total
    FROM client_invoices ci WHERE ci.company_id = ? AND ci.status = 'pending'
    AND DATE(ci.created_at) BETWEEN ? AND ?
  `, [cid, startDate, endDate])

  const totalPendingEntries = get(`
    SELECT COALESCE(SUM(cse.amount), 0) as total
    FROM client_standalone_entries cse WHERE cse.company_id = ? AND cse.status = 'pending'
    AND cse.entry_date BETWEEN ? AND ?
  `, [cid, startDate, endDate])

  const totalPaidEditors = get(`
    SELECT COALESCE(SUM(epb.total_amount), 0) as total
    FROM editor_payment_batches epb WHERE epb.company_id = ? AND epb.status = 'paid'
    AND DATE(epb.paid_at) BETWEEN ? AND ?
  `, [cid, startDate, endDate])

  const totalPendingEditors = get(`
    SELECT COALESCE(SUM(epb.total_amount), 0) as total
    FROM editor_payment_batches epb WHERE epb.company_id = ? AND epb.status = 'pending'
    AND DATE(epb.created_at) BETWEEN ? AND ?
  `, [cid, startDate, endDate])

  // Merge perClient: add total_value combining orders + entries
  const perClientMerged = perClient.map(c => ({
    ...c,
    total_value: c.total_order_value + c.total_entry_value,
  }))

  res.json({
    month,
    totalBilled: totals.total_billed + totalBilledEntries.total,
    totalReceivedClients: totalReceivedInvoices.total + totalReceivedEntries.total,
    totalPendingClients: totalPendingInvoices.total + totalPendingEntries.total,
    totalPaidEditors: totalPaidEditors.total,
    totalPendingEditors: totalPendingEditors.total,
    perClient: perClientMerged,
    perEditor,
  })
})

// Client spreadsheet (per-client, per-day)
router.get('/financial/client-sheet/:clientId', authMiddleware, requireRole('gestor'), (req, res) => {
  const cid = req.user.company_id
  const clientId = req.params.clientId
  const month = req.query.month
  if (!month) return res.status(400).json({ error: 'Parâmetro month obrigatório' })

  const startDate = `${month}-01`
  const endDate = `${month}-31`

  const client = get('SELECT * FROM clients WHERE id = ? AND company_id = ?', [clientId, cid])
  if (!client) return res.status(404).json({ error: 'Cliente não encontrado' })

  // Orders finalized in this month for this client
  const orders = all(`
    SELECT o.*, u.name as editor_name, kc.name as column_name,
      (SELECT ci.id FROM client_invoice_items cii JOIN client_invoices ci ON ci.id = cii.invoice_id WHERE cii.order_id = o.id LIMIT 1) as invoice_id,
      (SELECT ci.status FROM client_invoice_items cii JOIN client_invoices ci ON ci.id = cii.invoice_id WHERE cii.order_id = o.id LIMIT 1) as invoice_status
    FROM orders o
    LEFT JOIN users u ON u.id = o.editor_id
    LEFT JOIN kanban_columns kc ON kc.id = o.column_id
    WHERE o.client_id = ? AND o.company_id = ?
    AND DATE(o.updated_at) BETWEEN ? AND ?
    ORDER BY o.updated_at ASC
  `, [clientId, cid, startDate, endDate])

  // Daily records (meetings, observations)
  const dailyRecords = all(
    'SELECT * FROM daily_records WHERE company_id = ? AND client_id = ? AND record_date BETWEEN ? AND ?',
    [cid, clientId, startDate, endDate]
  )

  // Uninvoiced finalized orders (no date filter - show all uninvoiced)
  const uninvoiced = all(`
    SELECT o.*, u.name as editor_name FROM orders o
    LEFT JOIN users u ON u.id = o.editor_id
    WHERE o.client_id = ? AND o.company_id = ? AND o.value > 0
    AND o.id NOT IN (SELECT order_id FROM client_invoice_items)
    ORDER BY o.updated_at DESC
  `, [clientId, cid])

  // Client invoices
  const invoices = all(`
    SELECT ci.*, GROUP_CONCAT(o.title, ', ') as order_titles, COUNT(cii.id) as item_count
    FROM client_invoices ci
    LEFT JOIN client_invoice_items cii ON cii.invoice_id = ci.id
    LEFT JOIN orders o ON o.id = cii.order_id
    WHERE ci.client_id = ? AND ci.company_id = ?
    GROUP BY ci.id
    ORDER BY ci.created_at DESC
  `, [clientId, cid])

  // Client standalone entries (all pending / not in invoice)
  const unpaidClientEntries = all(`
    SELECT cse.*, 'standalone' as entry_type
    FROM client_standalone_entries cse
    WHERE cse.client_id = ? AND cse.company_id = ? AND cse.status = 'pending' AND cse.invoice_id IS NULL
    ORDER BY cse.entry_date DESC
  `, [clientId, cid])

  // Client standalone entries for this month (for spreadsheet)
  const monthClientEntries = all(`
    SELECT cse.*, 'standalone' as entry_type
    FROM client_standalone_entries cse
    WHERE cse.client_id = ? AND cse.company_id = ?
    AND cse.entry_date BETWEEN ? AND ?
    ORDER BY cse.entry_date ASC
  `, [clientId, cid, startDate, endDate])

  // All client standalone entries (for history)
  const allClientEntries = all(`
    SELECT cse.*, 'standalone' as entry_type
    FROM client_standalone_entries cse
    WHERE cse.client_id = ? AND cse.company_id = ?
    ORDER BY cse.entry_date DESC
  `, [clientId, cid])

  res.json({ client, orders, dailyRecords, uninvoiced, invoices, unpaidClientEntries, monthClientEntries, allClientEntries })
})

// Editor spreadsheet (per-editor, per-day)
router.get('/financial/editor-sheet/:editorId', authMiddleware, requireRole('gestor'), (req, res) => {
  const cid = req.user.company_id
  const editorId = req.params.editorId
  const month = req.query.month
  if (!month) return res.status(400).json({ error: 'Parâmetro month obrigatório' })

  const startDate = `${month}-01`
  const endDate = `${month}-31`

  // Editor can be a direct member (company_id match) or a team membership member
  let editor = get('SELECT * FROM users WHERE id = ? AND company_id = ?', [editorId, cid])
  if (!editor) {
    // Check team_memberships for shared editors from other companies
    const membership = get('SELECT tm.*, u.name, u.email, u.role, u.phone, u.specialty, u.default_rate, u.avatar FROM team_memberships tm JOIN users u ON u.id = tm.user_id WHERE tm.user_id = ? AND tm.company_id = ? AND tm.status = ?', [editorId, cid, 'active'])
    if (membership) {
      editor = { id: membership.user_id, name: membership.name, email: membership.email, role: membership.role, phone: membership.phone, specialty: membership.specialty, default_rate: membership.default_rate, avatar: membership.avatar, company_id: cid }
    }
  }
  if (!editor) return res.status(404).json({ error: 'Editor não encontrado' })

  // Orders for this editor in this month (use updated_at OR created_at to capture both
  // orders completed this month and orders created this month — prevents orders from
  // "disappearing" when editor_value is edited later changing updated_at)
  const orders = all(`
    SELECT o.*, c.name as client_name, kc.name as column_name,
      (SELECT ci.status FROM client_invoice_items cii JOIN client_invoices ci ON ci.id = cii.invoice_id WHERE cii.order_id = o.id LIMIT 1) as client_paid,
      (SELECT epb.id FROM editor_payment_items epi JOIN editor_payment_batches epb ON epb.id = epi.batch_id WHERE epi.order_id = o.id LIMIT 1) as batch_id,
      (SELECT epb.status FROM editor_payment_items epi JOIN editor_payment_batches epb ON epb.id = epi.batch_id WHERE epi.order_id = o.id LIMIT 1) as batch_status
    FROM orders o
    LEFT JOIN clients c ON c.id = o.client_id
    LEFT JOIN kanban_columns kc ON kc.id = o.column_id
    WHERE o.editor_id = ? AND o.company_id = ?
    AND (DATE(o.updated_at) BETWEEN ? AND ? OR DATE(o.created_at) BETWEEN ? AND ?)
    ORDER BY COALESCE(o.updated_at, o.created_at) ASC
  `, [editorId, cid, startDate, endDate, startDate, endDate])

  // Unpaid orders for this editor (all time - for batch creation)
  // Include orders with editor_value > 0 OR any order assigned to this editor in a
  // finalized column (gestor may have set value but it shows as 0 due to default)
  const unpaid = all(`
    SELECT o.*, c.name as client_name, kc.name as column_name,
      (SELECT ci.status FROM client_invoice_items cii JOIN client_invoices ci ON ci.id = cii.invoice_id WHERE cii.order_id = o.id LIMIT 1) as client_paid
    FROM orders o
    LEFT JOIN clients c ON c.id = o.client_id
    LEFT JOIN kanban_columns kc ON kc.id = o.column_id
    WHERE o.editor_id = ? AND o.company_id = ? AND o.editor_value > 0
    AND o.id NOT IN (SELECT order_id FROM editor_payment_items)
    ORDER BY o.updated_at DESC
  `, [editorId, cid])

  // Editor payment batches
  const batches = all(`
    SELECT epb.*, GROUP_CONCAT(o.title, ', ') as order_titles, COUNT(epi.id) as item_count
    FROM editor_payment_batches epb
    LEFT JOIN editor_payment_items epi ON epi.batch_id = epb.id
    LEFT JOIN orders o ON o.id = epi.order_id
    WHERE epb.editor_id = ? AND epb.company_id = ?
    GROUP BY epb.id
    ORDER BY epb.created_at DESC
  `, [editorId, cid])

  // Standalone entries not yet in a batch (unpaid)
  const unpaidEntries = all(`
    SELECT ese.*, 'standalone' as entry_type
    FROM editor_standalone_entries ese
    WHERE ese.editor_id = ? AND ese.company_id = ? AND ese.batch_id IS NULL
    ORDER BY ese.entry_date DESC
  `, [editorId, cid])

  // All standalone entries for this month (for the spreadsheet)
  const monthEntries = all(`
    SELECT ese.*, 'standalone' as entry_type
    FROM editor_standalone_entries ese
    WHERE ese.editor_id = ? AND ese.company_id = ?
    AND ese.entry_date BETWEEN ? AND ?
    ORDER BY ese.entry_date ASC
  `, [editorId, cid, startDate, endDate])

  res.json({ editor, orders, unpaid, unpaidEntries, monthEntries, batches })
})

// Create client invoice (batch of orders)
router.post('/financial/client-invoices', authMiddleware, requireRole('gestor'), (req, res) => {
  const { client_id, order_ids, notes } = req.body
  if (!client_id || !order_ids || order_ids.length === 0) {
    return res.status(400).json({ error: 'Cliente e pedidos são obrigatórios' })
  }

  // Calculate total
  let totalAmount = 0
  for (const oid of order_ids) {
    const order = get('SELECT value FROM orders WHERE id = ? AND company_id = ?', [oid, req.user.company_id])
    if (order) totalAmount += (order.value || 0)
  }

  const result = run(
    'INSERT INTO client_invoices (company_id, client_id, total_amount, notes) VALUES (?, ?, ?, ?)',
    [req.user.company_id, client_id, totalAmount, notes || null]
  )

  for (const oid of order_ids) {
    const order = get('SELECT value FROM orders WHERE id = ?', [oid])
    run('INSERT INTO client_invoice_items (invoice_id, order_id, amount) VALUES (?, ?, ?)',
      [result.lastInsertRowid, oid, order?.value || 0])
  }

  run('INSERT INTO activity_log (company_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.company_id, req.user.id, 'created', 'client_invoice', result.lastInsertRowid,
      `Nota criada para cliente - R$ ${totalAmount.toFixed(2)} (${order_ids.length} itens)`])

  const invoice = get('SELECT * FROM client_invoices WHERE id = ?', [result.lastInsertRowid])
  const items = all('SELECT cii.*, o.title as order_title FROM client_invoice_items cii JOIN orders o ON o.id = cii.order_id WHERE cii.invoice_id = ?', [result.lastInsertRowid])
  res.json({ ...invoice, items })
})

// Mark client invoice as paid
router.put('/financial/client-invoices/:id/pay', authMiddleware, requireRole('gestor'), (req, res) => {
  const { proof_url } = req.body
  run(
    "UPDATE client_invoices SET status = 'paid', proof_url = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?",
    [proof_url || null, req.params.id, req.user.company_id]
  )

  run('INSERT INTO activity_log (company_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.company_id, req.user.id, 'paid', 'client_invoice', req.params.id, 'Nota marcada como paga'])

  const invoice = get('SELECT * FROM client_invoices WHERE id = ?', [req.params.id])
  res.json(invoice)
})

// Delete client invoice (only pending)
router.delete('/financial/client-invoices/:id', authMiddleware, requireRole('gestor'), (req, res) => {
  const invoice = get("SELECT * FROM client_invoices WHERE id = ? AND company_id = ? AND status = 'pending'", [req.params.id, req.user.company_id])
  if (!invoice) return res.status(404).json({ error: 'Nota não encontrada ou já paga' })
  run('DELETE FROM client_invoice_items WHERE invoice_id = ?', [req.params.id])
  run('DELETE FROM client_invoices WHERE id = ?', [req.params.id])
  res.json({ success: true })
})

// Get invoice items
router.get('/financial/client-invoices/:id/items', authMiddleware, requireRole('gestor'), (req, res) => {
  const items = all(`
    SELECT cii.*, o.title as order_title, o.description, u.name as editor_name, c.name as client_name
    FROM client_invoice_items cii
    JOIN orders o ON o.id = cii.order_id
    LEFT JOIN users u ON u.id = o.editor_id
    LEFT JOIN clients c ON c.id = o.client_id
    WHERE cii.invoice_id = ?
  `, [req.params.id])
  const invoice = get('SELECT ci.*, cl.name as client_name FROM client_invoices ci JOIN clients cl ON cl.id = ci.client_id WHERE ci.id = ?', [req.params.id])
  res.json({ invoice, items })
})

// ============ CLIENT STANDALONE ENTRIES ============

// Create a client standalone entry (gestor)
router.post('/financial/client-entries', authMiddleware, requireRole('gestor'), (req, res) => {
  const { client_id, amount, description, entry_date } = req.body
  if (!client_id || !amount || !description) {
    return res.status(400).json({ error: 'Cliente, valor e descrição são obrigatórios' })
  }

  const parsedAmount = parseFloat(amount)
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Valor deve ser maior que zero' })
  }

  const client = get('SELECT * FROM clients WHERE id = ? AND company_id = ?', [client_id, req.user.company_id])
  if (!client) return res.status(404).json({ error: 'Cliente não encontrado' })

  const result = run(
    'INSERT INTO client_standalone_entries (company_id, client_id, amount, description, entry_date) VALUES (?, ?, ?, ?, ?)',
    [req.user.company_id, client_id, parsedAmount, description, entry_date || new Date().toISOString().substring(0, 10)]
  )

  run('INSERT INTO activity_log (company_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.company_id, req.user.id, 'created', 'client_entry', result.lastInsertRowid,
      `Lançamento avulso para ${client.name} - R$ ${parsedAmount.toFixed(2)}: ${description}`])

  // Notify client user if linked
  if (client.user_id) {
    run('INSERT INTO notifications (company_id, user_id, type, title, message, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.company_id, client.user_id, 'financial', 'Novo lançamento registrado',
        `R$ ${parsedAmount.toFixed(2)} — ${description}`, result.lastInsertRowid, 'client_entry'])
  }

  const entry = get('SELECT * FROM client_standalone_entries WHERE id = ?', [result.lastInsertRowid])
  res.json(entry)
})

// Delete client standalone entry (only if pending and not in invoice)
router.delete('/financial/client-entries/:id', authMiddleware, requireRole('gestor'), (req, res) => {
  const entry = get(
    "SELECT * FROM client_standalone_entries WHERE id = ? AND company_id = ? AND status = 'pending' AND invoice_id IS NULL",
    [req.params.id, req.user.company_id]
  )
  if (!entry) return res.status(404).json({ error: 'Lançamento não encontrado ou já pago/faturado' })
  run('DELETE FROM client_standalone_entries WHERE id = ?', [req.params.id])
  res.json({ success: true })
})

// Pay client standalone entry (gestor attaches proof)
router.put('/financial/client-entries/:id/pay', authMiddleware, requireRole('gestor'), (req, res) => {
  const { proof_url } = req.body
  const entry = get(
    "SELECT * FROM client_standalone_entries WHERE id = ? AND company_id = ?",
    [req.params.id, req.user.company_id]
  )
  if (!entry) return res.status(404).json({ error: 'Lançamento não encontrado' })

  run(
    "UPDATE client_standalone_entries SET status = 'paid', proof_url = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?",
    [proof_url || null, req.params.id]
  )

  // Notify client
  const client = get('SELECT * FROM clients WHERE id = ?', [entry.client_id])
  if (client && client.user_id) {
    run('INSERT INTO notifications (company_id, user_id, type, title, message, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.company_id, client.user_id, 'financial', 'Pagamento confirmado',
        `R$ ${entry.amount.toFixed(2)} — ${entry.description}`, req.params.id, 'client_entry'])
  }

  const updated = get('SELECT * FROM client_standalone_entries WHERE id = ?', [req.params.id])
  res.json(updated)
})

// Client-side: attach proof to their own entry
router.put('/client/entries/:id/pay', authMiddleware, requireRole('cliente'), (req, res) => {
  const { proof_url } = req.body
  const client = get('SELECT id FROM clients WHERE user_id = ? AND company_id = ?', [req.user.id, req.user.company_id])
  if (!client) return res.status(404).json({ error: 'Cliente não vinculado' })

  const entry = get(
    'SELECT * FROM client_standalone_entries WHERE id = ? AND client_id = ? AND company_id = ?',
    [req.params.id, client.id, req.user.company_id]
  )
  if (!entry) return res.status(404).json({ error: 'Lançamento não encontrado' })

  run(
    "UPDATE client_standalone_entries SET status = 'paid', proof_url = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?",
    [proof_url || null, req.params.id]
  )

  const updated = get('SELECT * FROM client_standalone_entries WHERE id = ?', [req.params.id])
  res.json(updated)
})

// Create editor payment batch (supports orders + standalone entries)
router.post('/financial/editor-batches', authMiddleware, requireRole('gestor'), (req, res) => {
  const { editor_id, order_ids, entry_ids, notes } = req.body
  const hasOrders = order_ids && order_ids.length > 0
  const hasEntries = entry_ids && entry_ids.length > 0
  if (!editor_id || (!hasOrders && !hasEntries)) {
    return res.status(400).json({ error: 'Editor e pelo menos um item são obrigatórios' })
  }

  let totalAmount = 0

  // Sum order values
  if (hasOrders) {
    for (const oid of order_ids) {
      const order = get('SELECT editor_value FROM orders WHERE id = ? AND company_id = ?', [oid, req.user.company_id])
      if (order) totalAmount += (order.editor_value || 0)
    }
  }

  // Sum standalone entry values
  if (hasEntries) {
    for (const eid of entry_ids) {
      const entry = get('SELECT amount FROM editor_standalone_entries WHERE id = ? AND company_id = ? AND batch_id IS NULL', [eid, req.user.company_id])
      if (entry) totalAmount += (entry.amount || 0)
    }
  }

  const result = run(
    'INSERT INTO editor_payment_batches (company_id, editor_id, total_amount, notes) VALUES (?, ?, ?, ?)',
    [req.user.company_id, editor_id, totalAmount, notes || null]
  )

  // Link orders to batch
  if (hasOrders) {
    for (const oid of order_ids) {
      const order = get('SELECT editor_value FROM orders WHERE id = ?', [oid])
      run('INSERT INTO editor_payment_items (batch_id, order_id, amount) VALUES (?, ?, ?)',
        [result.lastInsertRowid, oid, order?.editor_value || 0])
    }
    // Also update the old payments table records to 'paid' status
    for (const oid of order_ids) {
      run("UPDATE payments SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE order_id = ? AND editor_id = ? AND status = 'pending'",
        [oid, editor_id])
    }
  }

  // Link standalone entries to batch
  if (hasEntries) {
    for (const eid of entry_ids) {
      run('UPDATE editor_standalone_entries SET batch_id = ? WHERE id = ?', [result.lastInsertRowid, eid])
    }
  }

  const itemCount = (hasOrders ? order_ids.length : 0) + (hasEntries ? entry_ids.length : 0)

  // Notify editor
  const editor = get('SELECT name FROM users WHERE id = ?', [editor_id])
  run('INSERT INTO notifications (company_id, user_id, type, title, message, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.user.company_id, editor_id, 'payment', 'Pagamento registrado',
      `Lote de R$ ${totalAmount.toFixed(2)} (${itemCount} itens) registrado`, result.lastInsertRowid, 'editor_batch'])

  run('INSERT INTO activity_log (company_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.company_id, req.user.id, 'created', 'editor_batch', result.lastInsertRowid,
      `Pagamento para ${editor?.name} - R$ ${totalAmount.toFixed(2)} (${itemCount} itens)`])

  const batch = get('SELECT * FROM editor_payment_batches WHERE id = ?', [result.lastInsertRowid])
  res.json(batch)
})

// Mark editor payment batch as paid (with proof)
router.put('/financial/editor-batches/:id/pay', authMiddleware, requireRole('gestor'), (req, res) => {
  const { proof_url } = req.body
  run(
    "UPDATE editor_payment_batches SET status = 'paid', proof_url = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?",
    [proof_url || null, req.params.id, req.user.company_id]
  )

  run('INSERT INTO activity_log (company_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.company_id, req.user.id, 'paid', 'editor_batch', req.params.id, 'Pagamento de editor confirmado'])

  const batch = get('SELECT * FROM editor_payment_batches WHERE id = ?', [req.params.id])
  res.json(batch)
})

// Delete editor payment batch (only pending)
router.delete('/financial/editor-batches/:id', authMiddleware, requireRole('gestor'), (req, res) => {
  const batch = get("SELECT * FROM editor_payment_batches WHERE id = ? AND company_id = ? AND status = 'pending'", [req.params.id, req.user.company_id])
  if (!batch) return res.status(404).json({ error: 'Lote não encontrado ou já pago' })

  // Restore individual payment records to pending
  const items = all('SELECT * FROM editor_payment_items WHERE batch_id = ?', [req.params.id])
  for (const item of items) {
    run("UPDATE payments SET status = 'pending', paid_at = NULL WHERE order_id = ? AND editor_id = ?",
      [item.order_id, batch.editor_id])
  }

  // Unlink standalone entries from this batch
  run('UPDATE editor_standalone_entries SET batch_id = NULL WHERE batch_id = ?', [req.params.id])

  run('DELETE FROM editor_payment_items WHERE batch_id = ?', [req.params.id])
  run('DELETE FROM editor_payment_batches WHERE id = ?', [req.params.id])
  res.json({ success: true })
})

// Get editor batch items (orders + standalone entries)
router.get('/financial/editor-batches/:id/items', authMiddleware, requireRole('gestor'), (req, res) => {
  const items = all(`
    SELECT epi.*, o.title as order_title, c.name as client_name
    FROM editor_payment_items epi
    JOIN orders o ON o.id = epi.order_id
    LEFT JOIN clients c ON c.id = o.client_id
    WHERE epi.batch_id = ?
  `, [req.params.id])
  const entries = all(`
    SELECT ese.id, ese.amount, ese.description, ese.entry_date, 'standalone' as item_type
    FROM editor_standalone_entries ese
    WHERE ese.batch_id = ?
  `, [req.params.id])
  const batch = get('SELECT epb.*, u.name as editor_name FROM editor_payment_batches epb JOIN users u ON u.id = epb.editor_id WHERE epb.id = ?', [req.params.id])
  res.json({ batch, items, entries })
})

// ============ EDITOR STANDALONE ENTRIES (lançamentos avulsos) ============

// Create a standalone entry for an editor
router.post('/financial/editor-entries', authMiddleware, requireRole('gestor'), (req, res) => {
  const { editor_id, amount, description, entry_date } = req.body
  if (!editor_id || !amount || !description) {
    return res.status(400).json({ error: 'Editor, valor e descrição são obrigatórios' })
  }

  const parsedAmount = parseFloat(amount)
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Valor deve ser maior que zero' })
  }

  const result = run(
    'INSERT INTO editor_standalone_entries (company_id, editor_id, amount, description, entry_date) VALUES (?, ?, ?, ?, ?)',
    [req.user.company_id, editor_id, parsedAmount, description, entry_date || new Date().toISOString().substring(0, 10)]
  )

  const editor = get('SELECT name FROM users WHERE id = ?', [editor_id])
  run('INSERT INTO activity_log (company_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.company_id, req.user.id, 'created', 'editor_entry', result.lastInsertRowid,
      `Lançamento avulso para ${editor?.name} - R$ ${parsedAmount.toFixed(2)}: ${description}`])

  // Notify editor
  run('INSERT INTO notifications (company_id, user_id, type, title, message, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.user.company_id, editor_id, 'payment', 'Lançamento avulso registrado',
      `R$ ${parsedAmount.toFixed(2)} — ${description}`, result.lastInsertRowid, 'editor_entry'])

  const entry = get('SELECT * FROM editor_standalone_entries WHERE id = ?', [result.lastInsertRowid])
  res.json(entry)
})

// Delete a standalone entry (only if not in a batch)
router.delete('/financial/editor-entries/:id', authMiddleware, requireRole('gestor'), (req, res) => {
  const entry = get(
    'SELECT * FROM editor_standalone_entries WHERE id = ? AND company_id = ? AND batch_id IS NULL',
    [req.params.id, req.user.company_id]
  )
  if (!entry) return res.status(404).json({ error: 'Lançamento não encontrado ou já em lote' })

  run('DELETE FROM editor_standalone_entries WHERE id = ?', [req.params.id])
  res.json({ success: true })
})

// Upsert daily record
router.put('/financial/daily-record', authMiddleware, requireRole('gestor'), (req, res) => {
  const { client_id, record_date, meetings, meeting_notes, observations } = req.body
  if (!client_id || !record_date) return res.status(400).json({ error: 'client_id e record_date obrigatórios' })

  const existing = get(
    'SELECT * FROM daily_records WHERE company_id = ? AND client_id = ? AND record_date = ?',
    [req.user.company_id, client_id, record_date]
  )

  if (existing) {
    run('UPDATE daily_records SET meetings = ?, meeting_notes = ?, observations = ?, created_at = created_at WHERE id = ?',
      [meetings ?? existing.meetings, meeting_notes ?? existing.meeting_notes, observations ?? existing.observations, existing.id])
  } else {
    run('INSERT INTO daily_records (company_id, client_id, record_date, meetings, meeting_notes, observations) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.company_id, client_id, record_date, meetings || 0, meeting_notes || null, observations || null])
  }

  res.json({ success: true })
})

// List editors and clients for dropdowns
router.get('/financial/lists', authMiddleware, requireRole('gestor'), (req, res) => {
  const editors = all("SELECT id, name FROM users WHERE company_id = ? AND role = 'editor' AND active = 1", [req.user.company_id])
  const clients = all("SELECT id, name FROM clients WHERE company_id = ? AND active = 1", [req.user.company_id])
  res.json({ editors, clients })
})

// ============ NOTIFICATIONS ============

router.get('/notifications', authMiddleware, (req, res) => {
  // For editors: show notifications from ALL companies (personal + team memberships)
  const notifs = all(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
    [req.user.id]
  )
  const unread = get(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0',
    [req.user.id]
  ).count
  res.json({ notifications: notifs, unread })
})

router.put('/notifications/read-all', authMiddleware, (req, res) => {
  run('UPDATE notifications SET read = 1 WHERE user_id = ?', [req.user.id])
  res.json({ success: true })
})

// ============ SETTINGS ============

router.get('/settings', authMiddleware, (req, res) => {
  const company = get('SELECT * FROM companies WHERE id = ?', [req.user.company_id])
  // Mask secrets in response
  if (company?.smtp_pass) {
    company.smtp_pass = '*'.repeat(Math.max(0, company.smtp_pass.length - 4)) + company.smtp_pass.slice(-4)
  }
  if (company?.govbr_client_secret) {
    company.govbr_client_secret = '*'.repeat(Math.max(0, company.govbr_client_secret.length - 4)) + company.govbr_client_secret.slice(-4)
  }
  res.json(company)
})

router.put('/settings', authMiddleware, requireRole('gestor'), (req, res) => {
  const { name, logo, primary_color, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from } = req.body

  // Handle logo separately: empty string means remove, undefined means don't change
  if (logo !== undefined) {
    run('UPDATE companies SET logo = ? WHERE id = ?', [logo || null, req.user.company_id])
  }
  if (name) {
    run('UPDATE companies SET name = ? WHERE id = ?', [name, req.user.company_id])
  }
  if (primary_color) {
    run('UPDATE companies SET primary_color = ? WHERE id = ?', [primary_color, req.user.company_id])
  }

  // SMTP settings
  if (smtp_host !== undefined) run('UPDATE companies SET smtp_host = ? WHERE id = ?', [smtp_host || null, req.user.company_id])
  if (smtp_port !== undefined) run('UPDATE companies SET smtp_port = ? WHERE id = ?', [parseInt(smtp_port) || 587, req.user.company_id])
  if (smtp_user !== undefined) run('UPDATE companies SET smtp_user = ? WHERE id = ?', [smtp_user || null, req.user.company_id])
  if (smtp_pass !== undefined) {
    // Don't overwrite with masked values
    if (smtp_pass && !/^\*+/.test(smtp_pass)) {
      run('UPDATE companies SET smtp_pass = ? WHERE id = ?', [smtp_pass, req.user.company_id])
    }
  }
  if (smtp_from !== undefined) run('UPDATE companies SET smtp_from = ? WHERE id = ?', [smtp_from || null, req.user.company_id])

  // Gov.br settings
  const { govbr_client_id, govbr_client_secret, govbr_env } = req.body
  if (govbr_client_id !== undefined) run('UPDATE companies SET govbr_client_id = ? WHERE id = ?', [govbr_client_id || null, req.user.company_id])
  if (govbr_client_secret !== undefined) {
    if (govbr_client_secret && !/^\*+/.test(govbr_client_secret)) {
      run('UPDATE companies SET govbr_client_secret = ? WHERE id = ?', [govbr_client_secret, req.user.company_id])
    }
  }
  if (govbr_env !== undefined) run('UPDATE companies SET govbr_env = ? WHERE id = ?', [govbr_env === 'production' ? 'production' : 'staging', req.user.company_id])

  const company = get('SELECT * FROM companies WHERE id = ?', [req.user.company_id])
  // Mask secrets in response
  if (company?.smtp_pass) {
    company.smtp_pass = '*'.repeat(Math.max(0, company.smtp_pass.length - 4)) + company.smtp_pass.slice(-4)
  }
  if (company?.govbr_client_secret) {
    company.govbr_client_secret = '*'.repeat(Math.max(0, company.govbr_client_secret.length - 4)) + company.govbr_client_secret.slice(-4)
  }
  res.json(company)
})

// Test email sending
router.post('/settings/test-email', authMiddleware, requireRole('gestor'), async (req, res) => {
  try {
    const { sendTestEmail } = await import('./email.js')
    const user = get('SELECT email FROM users WHERE id = ?', [req.user.id])
    await sendTestEmail(user.email, req.user.company_id)
    res.json({ success: true, sent_to: user.email })
  } catch (err) {
    console.error('Test email error:', err)
    res.status(500).json({ error: err.message || 'Erro ao enviar email de teste' })
  }
})

// ============ EDITOR DELIVER ============

router.post('/editor/orders/:id/deliver', authMiddleware, requireRole('editor'), (req, res) => {
  const { delivery_link } = req.body
  const uid = req.user.id
  const order = get('SELECT * FROM orders WHERE id = ? AND editor_id = ?', [req.params.id, uid])
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' })

  // Find "Editado" column for this client
  const editadoCol = get(
    "SELECT id FROM kanban_columns WHERE client_id = ? AND name = 'Editado'",
    [order.client_id]
  )

  // Save the delivery link in drive_links (append if exists)
  const newLinks = order.drive_links
    ? order.drive_links + '\n' + (delivery_link || '')
    : (delivery_link || '')

  run(
    'UPDATE orders SET drive_links = ?, column_id = COALESCE(?, column_id), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [newLinks, editadoCol?.id, req.params.id]
  )

  // Notify gestor(s)
  const gestors = all(
    "SELECT id FROM users WHERE company_id = ? AND role = 'gestor' AND active = 1",
    [order.company_id]
  )
  for (const g of gestors) {
    run('INSERT INTO notifications (company_id, user_id, type, title, message, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [order.company_id, g.id, 'delivery', 'Entrega realizada', `Editor entregou "${order.title}"`, order.id, 'order']
    )
  }

  run('INSERT INTO activity_log (company_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
    [order.company_id, uid, 'delivered', 'order', req.params.id, `Editor entregou "${order.title}"`]
  )

  res.json({ success: true })
})

// ============ EDITOR REPORT ============

router.get('/editor/report', authMiddleware, requireRole('gestor'), (req, res) => {
  const cid = req.user.company_id

  // Get all editors linked to this company (direct + membership)
  const directEditors = all(
    "SELECT u.id, u.name, u.avatar FROM users u WHERE u.company_id = ? AND u.role = 'editor' AND u.active = 1",
    [cid]
  )
  const memberEditors = all(
    `SELECT u.id, u.name, u.avatar FROM team_memberships tm
     JOIN users u ON u.id = tm.user_id
     WHERE tm.company_id = ? AND u.active = 1`,
    [cid]
  )
  const editorMap = new Map()
  for (const e of [...directEditors, ...memberEditors]) {
    editorMap.set(e.id, e)
  }

  const editors = Array.from(editorMap.values()).map(editor => {
    const total = get(
      'SELECT COUNT(*) as count FROM orders WHERE editor_id = ? AND company_id = ?',
      [editor.id, cid]
    ).count

    const completed = get(
      `SELECT COUNT(*) as count FROM orders o
       JOIN kanban_columns kc ON kc.id = o.column_id
       WHERE o.editor_id = ? AND o.company_id = ? AND kc.name = 'Finalizado'`,
      [editor.id, cid]
    ).count

    const onTime = get(
      `SELECT COUNT(*) as count FROM orders o
       JOIN kanban_columns kc ON kc.id = o.column_id
       WHERE o.editor_id = ? AND o.company_id = ? AND kc.name = 'Finalizado'
         AND (o.due_date IS NULL OR o.updated_at <= o.due_date || ' 23:59:59')`,
      [editor.id, cid]
    ).count

    const late = get(
      `SELECT COUNT(*) as count FROM orders o
       JOIN kanban_columns kc ON kc.id = o.column_id
       WHERE o.editor_id = ? AND o.company_id = ? AND kc.name = 'Finalizado'
         AND o.due_date IS NOT NULL AND o.updated_at > o.due_date || ' 23:59:59'`,
      [editor.id, cid]
    ).count

    const inProgress = get(
      `SELECT COUNT(*) as count FROM orders o
       JOIN kanban_columns kc ON kc.id = o.column_id
       WHERE o.editor_id = ? AND o.company_id = ? AND kc.name NOT IN ('Finalizado', 'Não iniciado')`,
      [editor.id, cid]
    ).count

    const overdue = get(
      `SELECT COUNT(*) as count FROM orders o
       JOIN kanban_columns kc ON kc.id = o.column_id
       WHERE o.editor_id = ? AND o.company_id = ? AND kc.name != 'Finalizado'
         AND o.due_date < date('now') AND o.due_date IS NOT NULL`,
      [editor.id, cid]
    ).count

    const totalValue = get(
      'SELECT COALESCE(SUM(editor_value), 0) as total FROM orders WHERE editor_id = ? AND company_id = ?',
      [editor.id, cid]
    ).total

    return {
      ...editor,
      total, completed, onTime, late, inProgress, overdue, totalValue,
    }
  })

  res.json({ editors })
})

// ============ EDITOR FINANCIAL (for editor role) ============

router.get('/editor/financial', authMiddleware, requireRole('editor'), (req, res) => {
  const uid = req.user.id

  // Get all companies this editor belongs to
  const companyIds = all(
    "SELECT company_id FROM team_memberships WHERE user_id = ? AND status = 'active'",
    [uid]
  ).map(r => r.company_id)
  companyIds.push(req.user.company_id)
  const cidList = [...new Set(companyIds)]

  // Get all payment batches for this editor
  const batches = all(
    `SELECT epb.*, c.name as company_name FROM editor_payment_batches epb
     JOIN companies c ON c.id = epb.company_id
     WHERE epb.editor_id = ? ORDER BY epb.created_at DESC`,
    [uid]
  )

  // Get batch items for each (orders + standalone entries)
  for (const batch of batches) {
    batch.items = all(
      `SELECT epi.*, o.title as order_title FROM editor_payment_items epi
       JOIN orders o ON o.id = epi.order_id WHERE epi.batch_id = ?`,
      [batch.id]
    )
    batch.entries = all(
      `SELECT ese.id, ese.amount, ese.description, ese.entry_date, 'standalone' as item_type
       FROM editor_standalone_entries ese WHERE ese.batch_id = ?`,
      [batch.id]
    )
  }

  // Get orders with their values for this editor (across all companies)
  const placeholder = cidList.map(() => '?').join(',')
  const ordersSummary = all(
    `SELECT o.id, o.title, o.editor_value, o.due_date, o.created_at, o.updated_at,
       c.name as client_name, kc.name as column_name, comp.name as company_name
     FROM orders o
     JOIN clients c ON c.id = o.client_id
     JOIN kanban_columns kc ON kc.id = o.column_id
     JOIN companies comp ON comp.id = o.company_id
     WHERE o.editor_id = ? AND o.company_id IN (${placeholder})
     ORDER BY o.created_at DESC LIMIT 100`,
    [uid, ...cidList]
  )

  // Get standalone entries for this editor
  const standaloneEntries = all(
    `SELECT ese.*, comp.name as company_name,
       CASE WHEN ese.batch_id IS NOT NULL THEN 'in_batch' ELSE 'pending' END as entry_status
     FROM editor_standalone_entries ese
     JOIN companies comp ON comp.id = ese.company_id
     WHERE ese.editor_id = ? AND ese.company_id IN (${placeholder})
     ORDER BY ese.entry_date DESC`,
    [uid, ...cidList]
  )

  const totalEarned = batches.filter(b => b.status === 'paid').reduce((s, b) => s + b.total_amount, 0)
  const totalPending = batches.filter(b => b.status === 'pending').reduce((s, b) => s + b.total_amount, 0)
  const totalAssigned = ordersSummary.reduce((s, o) => s + (o.editor_value || 0), 0)
  const totalEntries = standaloneEntries.reduce((s, e) => s + (e.amount || 0), 0)

  res.json({
    stats: { totalEarned, totalPending, totalAssigned, totalEntries, batchCount: batches.length },
    batches,
    orders: ordersSummary,
    standaloneEntries,
  })
})

// ============ EDITOR INDIVIDUAL REPORT ============

router.get('/editor/my-report', authMiddleware, requireRole('editor'), (req, res) => {
  const uid = req.user.id

  const companyIds = all(
    "SELECT company_id FROM team_memberships WHERE user_id = ? AND status = 'active'",
    [uid]
  ).map(r => r.company_id)
  companyIds.push(req.user.company_id)
  const cidList = [...new Set(companyIds)]
  const placeholder = cidList.map(() => '?').join(',')

  const total = get(
    `SELECT COUNT(*) as count FROM orders WHERE editor_id = ? AND company_id IN (${placeholder})`,
    [uid, ...cidList]
  ).count

  const completed = get(
    `SELECT COUNT(*) as count FROM orders o JOIN kanban_columns kc ON kc.id = o.column_id
     WHERE o.editor_id = ? AND o.company_id IN (${placeholder}) AND kc.name = 'Finalizado'`,
    [uid, ...cidList]
  ).count

  const onTime = get(
    `SELECT COUNT(*) as count FROM orders o JOIN kanban_columns kc ON kc.id = o.column_id
     WHERE o.editor_id = ? AND o.company_id IN (${placeholder}) AND kc.name = 'Finalizado'
       AND (o.due_date IS NULL OR o.updated_at <= o.due_date || ' 23:59:59')`,
    [uid, ...cidList]
  ).count

  const late = get(
    `SELECT COUNT(*) as count FROM orders o JOIN kanban_columns kc ON kc.id = o.column_id
     WHERE o.editor_id = ? AND o.company_id IN (${placeholder}) AND kc.name = 'Finalizado'
       AND o.due_date IS NOT NULL AND o.updated_at > o.due_date || ' 23:59:59'`,
    [uid, ...cidList]
  ).count

  const inProgress = get(
    `SELECT COUNT(*) as count FROM orders o JOIN kanban_columns kc ON kc.id = o.column_id
     WHERE o.editor_id = ? AND o.company_id IN (${placeholder}) AND kc.name NOT IN ('Finalizado', 'Não iniciado')`,
    [uid, ...cidList]
  ).count

  const overdue = get(
    `SELECT COUNT(*) as count FROM orders o JOIN kanban_columns kc ON kc.id = o.column_id
     WHERE o.editor_id = ? AND o.company_id IN (${placeholder}) AND kc.name != 'Finalizado'
       AND o.due_date < date('now') AND o.due_date IS NOT NULL`,
    [uid, ...cidList]
  ).count

  const totalValue = get(
    `SELECT COALESCE(SUM(editor_value), 0) as total FROM orders WHERE editor_id = ? AND company_id IN (${placeholder})`,
    [uid, ...cidList]
  ).total

  // Monthly breakdown (last 6 months)
  const months = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const mCompleted = get(
      `SELECT COUNT(*) as count FROM orders o JOIN kanban_columns kc ON kc.id = o.column_id
       WHERE o.editor_id = ? AND o.company_id IN (${placeholder}) AND kc.name = 'Finalizado'
         AND o.updated_at LIKE ? || '%'`,
      [uid, ...cidList, m]
    ).count
    const mValue = get(
      `SELECT COALESCE(SUM(editor_value), 0) as total FROM orders o JOIN kanban_columns kc ON kc.id = o.column_id
       WHERE o.editor_id = ? AND o.company_id IN (${placeholder}) AND kc.name = 'Finalizado'
         AND o.updated_at LIKE ? || '%'`,
      [uid, ...cidList, m]
    ).total
    months.push({ month: m, completed: mCompleted, value: mValue })
  }

  const onTimeRate = completed > 0 ? Math.round((onTime / completed) * 100) : 0

  res.json({
    total, completed, onTime, late, inProgress, overdue, totalValue, onTimeRate,
    months,
  })
})

// ============ CLIENT ORDER REQUESTS (portal de solicitação) ============

router.post('/client/orders', authMiddleware, requireRole('cliente'), (req, res) => {
  const { title, description, briefing, video_type, duration, format, references_json, drive_links, priority } = req.body
  if (!title) return res.status(400).json({ error: 'Titulo obrigatorio' })

  const client = get('SELECT id, company_id FROM clients WHERE user_id = ? AND company_id = ?', [req.user.id, req.user.company_id])
  if (!client) return res.status(403).json({ error: 'Cliente nao vinculado' })

  const cid = client.company_id

  // Check contract limits
  const contract = get(
    "SELECT * FROM contracts WHERE client_id = ? AND company_id = ? AND status = 'active'",
    [client.id, cid]
  )
  if (contract && contract.monthly_videos > 0) {
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`
    const monthOrders = get(
      "SELECT COUNT(*) as count FROM orders WHERE client_id = ? AND company_id = ? AND created_at >= ? AND created_at <= ?",
      [client.id, cid, monthStart, monthEnd + ' 23:59:59']
    ).count
    if (monthOrders >= contract.monthly_videos) {
      return res.status(400).json({ error: `Limite mensal de ${contract.monthly_videos} videos atingido` })
    }
  }

  // Put in "Não iniciado" column
  const col = get(
    "SELECT id FROM kanban_columns WHERE client_id = ? AND company_id = ? AND name LIKE '%ão iniciado%' ORDER BY position LIMIT 1",
    [client.id, cid]
  )
  if (!col) return res.status(400).json({ error: 'Coluna nao encontrada. Contate o gestor.' })

  const result = run(
    `INSERT INTO orders (company_id, client_id, column_id, title, description, briefing, video_type, duration, format, references_json, drive_links, priority, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'client')`,
    [cid, client.id, col.id, title, description || null, briefing || null, video_type || null, duration || null, format || null, references_json || '[]', drive_links || null, priority || 'normal']
  )

  // Notify gestor
  const gestor = get("SELECT id FROM users WHERE company_id = ? AND role = 'gestor' LIMIT 1", [cid])
  if (gestor) {
    run(
      "INSERT INTO notifications (company_id, user_id, type, title, message, reference_id, reference_type) VALUES (?, ?, 'client_request', ?, ?, ?, 'order')",
      [cid, gestor.id, 'Nova solicitação de cliente', `${client.id ? get('SELECT name FROM clients WHERE id = ?', [client.id])?.name : 'Cliente'} solicitou: ${title}`, result.lastInsertRowid]
    )
  }

  res.json({ id: result.lastInsertRowid, message: 'Solicitação enviada' })
})

// Client gets their contract info
router.get('/client/contract', authMiddleware, requireRole('cliente'), (req, res) => {
  const client = get('SELECT id FROM clients WHERE user_id = ? AND company_id = ?', [req.user.id, req.user.company_id])
  if (!client) return res.status(404).json({ error: 'Cliente nao vinculado' })

  const contract = get(
    "SELECT * FROM contracts WHERE client_id = ? AND company_id = ? AND status = 'active'",
    [client.id, req.user.company_id]
  )
  if (!contract) return res.json({ contract: null, usage: null })

  const clauses = all(
    'SELECT * FROM contract_clauses WHERE contract_id = ? ORDER BY position',
    [contract.id]
  )

  // Monthly usage
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`
  const used = get(
    "SELECT COUNT(*) as count FROM orders WHERE client_id = ? AND company_id = ? AND created_at >= ? AND created_at <= ?",
    [client.id, req.user.company_id, monthStart, monthEnd + ' 23:59:59']
  ).count

  res.json({ contract: { ...contract, clauses }, usage: { used, limit: contract.monthly_videos } })
})

// Client sign contract directly from portal
router.post('/client/contract/send-otp', authMiddleware, requireRole('cliente'), async (req, res) => {
  const client = get('SELECT id FROM clients WHERE user_id = ? AND company_id = ?', [req.user.id, req.user.company_id])
  if (!client) return res.status(404).json({ error: 'Cliente nao vinculado' })

  const contract = get(
    "SELECT * FROM contracts WHERE client_id = ? AND company_id = ? AND status = 'active'",
    [client.id, req.user.company_id]
  )
  if (!contract) return res.status(404).json({ error: 'Nenhum contrato ativo' })
  if (contract.signature_status === 'signed') return res.status(400).json({ error: 'Contrato ja assinado' })

  // Generate document hash if not exists
  if (!contract.document_hash) {
    const clauses = all('SELECT title, content, items_json, position FROM contract_clauses WHERE contract_id = ? ORDER BY position', [contract.id])
    const docContent = JSON.stringify({ contract, clauses })
    const docHash = crypto.createHash('sha256').update(docContent).digest('hex')
    run('UPDATE contracts SET document_hash = ?, signature_status = ? WHERE id = ?', [docHash, 'pending', contract.id])
  }

  // Create or update signature record
  const existingSig = get('SELECT id FROM contract_signatures WHERE contract_id = ? AND signer_role = ?', [contract.id, 'contratante'])
  const user = get('SELECT name, email FROM users WHERE id = ?', [req.user.id])

  const otp = Math.floor(100000 + Math.random() * 900000).toString()

  if (existingSig) {
    run('UPDATE contract_signatures SET otp_code = ?, otp_sent_at = CURRENT_TIMESTAMP, signer_email = ?, signer_name = ? WHERE id = ?',
      [otp, user.email, user.name, existingSig.id])
  } else {
    run(`INSERT INTO contract_signatures (contract_id, signer_role, signer_name, signer_email, otp_code, otp_sent_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [contract.id, 'contratante', user.name, user.email, otp])
  }

  // Send OTP
  try {
    const { sendOTPEmail } = await import('./email.js')
    await sendOTPEmail(user.email, otp, req.user.company_id)
    res.json({ success: true, email_sent_to: user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3') })
  } catch (err) {
    console.error('OTP email error:', err)
    res.status(500).json({ error: 'Erro ao enviar codigo. Tente novamente.' })
  }
})

router.post('/client/contract/sign', authMiddleware, requireRole('cliente'), (req, res) => {
  const { otp, signer_name, signer_cpf, signature_image, geolocation } = req.body

  const client = get('SELECT id FROM clients WHERE user_id = ? AND company_id = ?', [req.user.id, req.user.company_id])
  if (!client) return res.status(404).json({ error: 'Cliente nao vinculado' })

  const contract = get(
    "SELECT * FROM contracts WHERE client_id = ? AND company_id = ? AND status = 'active'",
    [client.id, req.user.company_id]
  )
  if (!contract) return res.status(404).json({ error: 'Nenhum contrato ativo' })
  if (contract.signature_status === 'signed') return res.status(400).json({ error: 'Contrato ja assinado' })

  const signature = get('SELECT * FROM contract_signatures WHERE contract_id = ? AND signer_role = ? ORDER BY id DESC LIMIT 1', [contract.id, 'contratante'])
  if (!signature || !signature.otp_code) return res.status(400).json({ error: 'Solicite o codigo primeiro' })

  // Verify OTP
  if (signature.otp_code !== otp) {
    return res.status(400).json({ error: 'Codigo invalido' })
  }

  // Check expiry (10 min)
  const otpSentAt = new Date(signature.otp_sent_at + 'Z')
  if ((new Date() - otpSentAt) > 10 * 60 * 1000) {
    return res.status(400).json({ error: 'Codigo expirado. Solicite um novo.' })
  }

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown'
  const userAgent = req.headers['user-agent'] || 'unknown'

  run(`UPDATE contract_signatures SET
       signer_name = ?, signer_cpf = ?, ip_address = ?, user_agent = ?,
       signed_at = CURRENT_TIMESTAMP, document_hash = ?, signature_image = ?,
       geolocation = ?, otp_code = NULL
       WHERE id = ?`,
    [signer_name || signature.signer_name, signer_cpf || '', ip, userAgent,
     contract.document_hash, signature_image || null, geolocation || null, signature.id])

  run('UPDATE contracts SET signature_status = ? WHERE id = ?', ['signed', contract.id])

  res.json({ success: true, signed_at: new Date().toISOString() })
})

// ============ CONTRACTS (gestor) ============

router.get('/contracts', authMiddleware, requireRole('gestor'), (req, res) => {
  const contracts = all(
    `SELECT ct.*, c.name as client_name FROM contracts ct
     LEFT JOIN clients c ON c.id = ct.client_id
     WHERE ct.company_id = ? ORDER BY ct.created_at DESC`,
    [req.user.company_id]
  )
  res.json(contracts)
})

router.get('/contracts/:id', authMiddleware, requireRole('gestor'), (req, res) => {
  const contract = get(
    'SELECT * FROM contracts WHERE id = ? AND company_id = ?',
    [req.params.id, req.user.company_id]
  )
  if (!contract) return res.status(404).json({ error: 'Contrato nao encontrado' })

  contract.clauses = all(
    'SELECT * FROM contract_clauses WHERE contract_id = ? ORDER BY position',
    [contract.id]
  )
  res.json(contract)
})

router.post('/contracts', authMiddleware, requireRole('gestor'), (req, res) => {
  const {
    client_id, title, start_date, end_date, monthly_videos, monthly_value, notes, clauses, status,
    contratante_nome, contratante_doc, contratante_endereco,
    contratante_tipo, contratante_cnpj, contratante_cpf,
    contratado_nome, contratado_doc, contratado_endereco,
    contratado_tipo, contratado_cnpj, contratado_cpf,
    payment_value, payment_date, payment_details, city, contract_date,
  } = req.body
  if (!title) return res.status(400).json({ error: 'Titulo obrigatorio' })

  const result = run(
    `INSERT INTO contracts (company_id, client_id, title, status, start_date, end_date, monthly_videos, monthly_value, notes,
     contratante_nome, contratante_doc, contratante_endereco, contratante_tipo, contratante_cnpj, contratante_cpf,
     contratado_nome, contratado_doc, contratado_endereco, contratado_tipo, contratado_cnpj, contratado_cpf,
     payment_value, payment_date, payment_details, city, contract_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.company_id, client_id || null, title, status || 'draft', start_date || null, end_date || null, monthly_videos || 0, monthly_value || 0, notes || null,
     contratante_nome || null, contratante_doc || null, contratante_endereco || null,
     contratante_tipo || 'pf', contratante_cnpj || null, contratante_cpf || null,
     contratado_nome || null, contratado_doc || null, contratado_endereco || null,
     contratado_tipo || 'pf', contratado_cnpj || null, contratado_cpf || null,
     payment_value || 0, payment_date || null, payment_details || null, city || null, contract_date || null]
  )

  // Insert clauses
  if (clauses && Array.isArray(clauses)) {
    for (let i = 0; i < clauses.length; i++) {
      const cl = clauses[i]
      if (cl.title) {
        run(
          'INSERT INTO contract_clauses (contract_id, title, content, position, items_json) VALUES (?, ?, ?, ?, ?)',
          [result.lastInsertRowid, cl.title, cl.content || '', i, JSON.stringify(cl.items || [])]
        )
      }
    }
  }

  res.json({ id: result.lastInsertRowid })
})

router.put('/contracts/:id', authMiddleware, requireRole('gestor'), (req, res) => {
  const {
    title, status, start_date, end_date, monthly_videos, monthly_value, notes, clauses, client_id,
    contratante_nome, contratante_doc, contratante_endereco,
    contratante_tipo, contratante_cnpj, contratante_cpf,
    contratado_nome, contratado_doc, contratado_endereco,
    contratado_tipo, contratado_cnpj, contratado_cpf,
    payment_value, payment_date, payment_details, city, contract_date,
  } = req.body
  const id = req.params.id

  const existing = get('SELECT id FROM contracts WHERE id = ? AND company_id = ?', [id, req.user.company_id])
  if (!existing) return res.status(404).json({ error: 'Contrato nao encontrado' })

  run(
    `UPDATE contracts SET title = ?, status = ?, start_date = ?, end_date = ?, monthly_videos = ?, monthly_value = ?, notes = ?,
     client_id = ?, contratante_nome = ?, contratante_doc = ?, contratante_endereco = ?,
     contratante_tipo = ?, contratante_cnpj = ?, contratante_cpf = ?,
     contratado_nome = ?, contratado_doc = ?, contratado_endereco = ?,
     contratado_tipo = ?, contratado_cnpj = ?, contratado_cpf = ?,
     payment_value = ?, payment_date = ?, payment_details = ?, city = ?, contract_date = ?
     WHERE id = ?`,
    [title, status, start_date || null, end_date || null, monthly_videos || 0, monthly_value || 0, notes || null,
     client_id || null, contratante_nome || null, contratante_doc || null, contratante_endereco || null,
     contratante_tipo || 'pf', contratante_cnpj || null, contratante_cpf || null,
     contratado_nome || null, contratado_doc || null, contratado_endereco || null,
     contratado_tipo || 'pf', contratado_cnpj || null, contratado_cpf || null,
     payment_value || 0, payment_date || null, payment_details || null, city || null, contract_date || null, id]
  )

  // Replace clauses
  if (clauses && Array.isArray(clauses)) {
    run('DELETE FROM contract_clauses WHERE contract_id = ?', [id])
    for (let i = 0; i < clauses.length; i++) {
      const cl = clauses[i]
      if (cl.title) {
        run(
          'INSERT INTO contract_clauses (contract_id, title, content, position, items_json) VALUES (?, ?, ?, ?, ?)',
          [id, cl.title, cl.content || '', i, JSON.stringify(cl.items || [])]
        )
      }
    }
  }

  res.json({ success: true })
})

router.delete('/contracts/:id', authMiddleware, requireRole('gestor'), (req, res) => {
  run('DELETE FROM contracts WHERE id = ? AND company_id = ?', [req.params.id, req.user.company_id])
  res.json({ success: true })
})

// ============ CNPJ LOOKUP (proxy to BrasilAPI) ============
router.get('/lookup/cnpj/:cnpj', authMiddleware, async (req, res) => {
  const cnpj = req.params.cnpj.replace(/\D/g, '')
  if (cnpj.length !== 14) return res.status(400).json({ error: 'CNPJ invalido (deve ter 14 digitos)' })
  try {
    const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`)
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      return res.status(resp.status).json({ error: err.message || 'CNPJ nao encontrado' })
    }
    const data = await resp.json()
    res.json({
      razao_social: data.razao_social,
      nome_fantasia: data.nome_fantasia,
      cnpj: data.cnpj,
      tipo: data.descricao_identificador_matriz_filial,
      porte: data.porte,
      natureza_juridica: data.natureza_juridica,
      situacao: data.descricao_situacao_cadastral,
      logradouro: data.logradouro,
      numero: data.numero,
      complemento: data.complemento,
      bairro: data.bairro,
      municipio: data.municipio,
      uf: data.uf,
      cep: data.cep,
      endereco_completo: [
        data.logradouro,
        data.numero ? `n ${data.numero}` : null,
        data.complemento,
        data.bairro,
        `${data.municipio} - ${data.uf}`,
        data.cep ? `CEP: ${data.cep}` : null,
      ].filter(Boolean).join(', '),
    })
  } catch (err) {
    res.status(500).json({ error: 'Erro ao consultar CNPJ' })
  }
})

// ============ CONTRACT SIGNATURE SYSTEM ============

// Send contract for signature (gestor action)
router.post('/contracts/:id/send-signature', authMiddleware, requireRole('gestor'), async (req, res) => {
  const id = req.params.id
  const { signer_email, signer_name } = req.body
  if (!signer_email) return res.status(400).json({ error: 'Email do assinante obrigatorio' })

  const contract = get('SELECT * FROM contracts WHERE id = ? AND company_id = ?', [id, req.user.company_id])
  if (!contract) return res.status(404).json({ error: 'Contrato nao encontrado' })

  // Generate unique signing token
  const signToken = crypto.randomBytes(32).toString('hex')

  // Generate document hash (SHA-256 of contract content)
  const clauses = all('SELECT title, content, items_json, position FROM contract_clauses WHERE contract_id = ? ORDER BY position', [id])
  const docContent = JSON.stringify({ contract, clauses })
  const docHash = crypto.createHash('sha256').update(docContent).digest('hex')

  // Update contract with signature status
  run('UPDATE contracts SET signature_status = ?, sign_token = ?, document_hash = ? WHERE id = ?',
    ['pending', signToken, docHash, id])

  // Create signature record
  run(`INSERT INTO contract_signatures (contract_id, signer_role, signer_name, signer_email)
       VALUES (?, ?, ?, ?)`,
    [id, 'contratante', signer_name || '', signer_email])

  // Send email with signing link
  try {
    const { sendSignatureEmail } = await import('./email.js')
    const baseUrl = process.env.APP_URL || 'https://reinonexus.com/audiovisual'
    const signUrl = `${baseUrl}/#/assinar/${signToken}`
    await sendSignatureEmail(signer_email, signer_name || 'Cliente', contract.title, signUrl, req.user.company_id)
  } catch (err) {
    console.error('Email error:', err)
    // Don't fail — signature link still works
  }

  res.json({ success: true, sign_token: signToken })
})

// Get contract for signing (PUBLIC — no auth required)
router.get('/contracts/sign/:token', (req, res) => {
  const token = req.params.token
  const contract = get('SELECT * FROM contracts WHERE sign_token = ?', [token])
  if (!contract) return res.status(404).json({ error: 'Contrato nao encontrado ou link invalido' })
  if (contract.signature_status === 'signed') return res.status(400).json({ error: 'Contrato ja assinado', already_signed: true })

  const clauses = all('SELECT title, content, items_json, position FROM contract_clauses WHERE contract_id = ? ORDER BY position', [contract.id])
  const signature = get('SELECT signer_name, signer_email, signed_at FROM contract_signatures WHERE contract_id = ? ORDER BY id DESC LIMIT 1', [contract.id])

  res.json({
    title: contract.title,
    status: contract.signature_status,
    contratante_tipo: contract.contratante_tipo,
    contratante_nome: contract.contratante_nome,
    contratante_cnpj: contract.contratante_cnpj,
    contratante_cpf: contract.contratante_cpf,
    contratante_endereco: contract.contratante_endereco,
    contratado_tipo: contract.contratado_tipo,
    contratado_nome: contract.contratado_nome,
    contratado_cnpj: contract.contratado_cnpj,
    contratado_cpf: contract.contratado_cpf,
    contratado_endereco: contract.contratado_endereco,
    payment_value: contract.payment_value,
    payment_date: contract.payment_date,
    payment_details: contract.payment_details,
    city: contract.city,
    contract_date: contract.contract_date,
    start_date: contract.start_date,
    end_date: contract.end_date,
    monthly_videos: contract.monthly_videos,
    clauses: clauses.map(cl => ({ ...cl, topics: cl.items_json ? JSON.parse(cl.items_json) : [] })),
    signer_email: signature?.signer_email,
    signer_name: signature?.signer_name,
    document_hash: contract.document_hash,
  })
})

// Send OTP for signature verification (PUBLIC)
router.post('/contracts/sign/:token/send-otp', async (req, res) => {
  const token = req.params.token
  const contract = get('SELECT id, signature_status, sign_token FROM contracts WHERE sign_token = ?', [token])
  if (!contract) return res.status(404).json({ error: 'Contrato nao encontrado' })
  if (contract.signature_status === 'signed') return res.status(400).json({ error: 'Contrato ja assinado' })

  const signature = get('SELECT * FROM contract_signatures WHERE contract_id = ? ORDER BY id DESC LIMIT 1', [contract.id])
  if (!signature) return res.status(400).json({ error: 'Nenhuma assinatura pendente' })

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString()
  run('UPDATE contract_signatures SET otp_code = ?, otp_sent_at = CURRENT_TIMESTAMP WHERE id = ?', [otp, signature.id])

  // Send OTP via email
  try {
    const { sendOTPEmail } = await import('./email.js')
    await sendOTPEmail(signature.signer_email, otp, contract.company_id)
    res.json({ success: true, email_sent_to: signature.signer_email.replace(/(.{2})(.*)(@.*)/, '$1***$3') })
  } catch (err) {
    console.error('OTP email error:', err)
    res.status(500).json({ error: 'Erro ao enviar codigo. Tente novamente.' })
  }
})

// Verify OTP and register signature (PUBLIC)
router.post('/contracts/sign/:token/verify', (req, res) => {
  const token = req.params.token
  const { otp, signer_name, signer_cpf, signature_image, geolocation } = req.body

  const contract = get('SELECT id, signature_status, document_hash FROM contracts WHERE sign_token = ?', [token])
  if (!contract) return res.status(404).json({ error: 'Contrato nao encontrado' })
  if (contract.signature_status === 'signed') return res.status(400).json({ error: 'Contrato ja assinado' })

  const signature = get('SELECT * FROM contract_signatures WHERE contract_id = ? ORDER BY id DESC LIMIT 1', [contract.id])
  if (!signature) return res.status(400).json({ error: 'Nenhuma assinatura pendente' })

  // Verify OTP
  if (!signature.otp_code || signature.otp_code !== otp) {
    return res.status(400).json({ error: 'Codigo invalido. Tente novamente.' })
  }

  // Check OTP expiry (10 minutes)
  const otpSentAt = new Date(signature.otp_sent_at + 'Z')
  const now = new Date()
  if ((now - otpSentAt) > 10 * 60 * 1000) {
    return res.status(400).json({ error: 'Codigo expirado. Solicite um novo.' })
  }

  // Get IP and user agent
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown'
  const userAgent = req.headers['user-agent'] || 'unknown'

  // Register signature
  run(`UPDATE contract_signatures SET
       signer_name = ?, signer_cpf = ?, ip_address = ?, user_agent = ?,
       signed_at = CURRENT_TIMESTAMP, document_hash = ?, signature_image = ?,
       geolocation = ?, otp_code = NULL
       WHERE id = ?`,
    [signer_name || signature.signer_name, signer_cpf || '', ip, userAgent,
     contract.document_hash, signature_image || null, geolocation || null, signature.id])

  // Update contract status
  run('UPDATE contracts SET signature_status = ? WHERE id = ?', ['signed', contract.id])

  res.json({ success: true, signed_at: new Date().toISOString() })
})

// Get signature details (gestor)
router.get('/contracts/:id/signatures', authMiddleware, requireRole('gestor'), (req, res) => {
  const id = req.params.id
  const contract = get('SELECT id FROM contracts WHERE id = ? AND company_id = ?', [id, req.user.company_id])
  if (!contract) return res.status(404).json({ error: 'Contrato nao encontrado' })

  const signatures = all('SELECT * FROM contract_signatures WHERE contract_id = ? ORDER BY signed_at DESC', [id])
  res.json(signatures)
})

// ============ GOV.BR DIGITAL SIGNATURE INTEGRATION ============

const GOVBR_URLS = {
  staging: {
    auth: 'https://sso.staging.acesso.gov.br/authorize',
    token: 'https://sso.staging.acesso.gov.br/token',
    userinfo: 'https://sso.staging.acesso.gov.br/userinfo',
    sign: 'https://assinatura-api.staging.iti.br/externo/v2/assinarPKCS7',
  },
  production: {
    auth: 'https://sso.acesso.gov.br/authorize',
    token: 'https://sso.acesso.gov.br/token',
    userinfo: 'https://sso.acesso.gov.br/userinfo',
    sign: 'https://assinador.iti.br/externo/v2/assinarPKCS7',
  },
}

function getGovBRConfig(companyId) {
  const company = get('SELECT govbr_client_id, govbr_client_secret, govbr_env FROM companies WHERE id = ?', [companyId])
  if (!company?.govbr_client_id || !company?.govbr_client_secret) {
    return null
  }
  const env = company.govbr_env === 'production' ? 'production' : 'staging'
  return {
    clientId: company.govbr_client_id,
    clientSecret: company.govbr_client_secret,
    urls: GOVBR_URLS[env],
    env,
  }
}

// Check if Gov.br is configured for a contract (PUBLIC — used by signing page)
router.get('/contracts/sign/:token/govbr-available', (req, res) => {
  const contract = get('SELECT company_id, signature_status FROM contracts WHERE sign_token = ?', [req.params.token])
  if (!contract) return res.status(404).json({ error: 'Contrato nao encontrado' })
  const config = getGovBRConfig(contract.company_id)
  res.json({ available: !!config, signed: contract.signature_status === 'signed' })
})

// Check if Gov.br is configured (authenticated — client portal)
router.get('/client/contract/govbr-available', authMiddleware, requireRole('cliente'), (req, res) => {
  const config = getGovBRConfig(req.user.company_id)
  res.json({ available: !!config })
})

// Start Gov.br OAuth flow (PUBLIC — for external signing link)
router.get('/govbr/authorize/:signToken', (req, res) => {
  const signToken = req.params.signToken
  const contract = get('SELECT id, company_id, signature_status FROM contracts WHERE sign_token = ?', [signToken])
  if (!contract) return res.status(404).json({ error: 'Contrato nao encontrado' })
  if (contract.signature_status === 'signed') return res.status(400).json({ error: 'Contrato ja assinado' })

  const config = getGovBRConfig(contract.company_id)
  if (!config) return res.status(400).json({ error: 'Gov.br nao configurado para esta empresa' })

  // Generate unique state for CSRF protection
  const state = crypto.randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 min

  run(`INSERT INTO govbr_oauth_states (state, company_id, contract_id, sign_token, signer_type, expires_at)
       VALUES (?, ?, ?, ?, 'public', ?)`,
    [state, contract.company_id, contract.id, signToken, expiresAt])

  const appUrl = process.env.APP_URL || 'https://reinonexus.com/audiovisual'
  const redirectUri = `${appUrl.replace(/\/$/, '')}/api/govbr/callback`

  const authUrl = `${config.urls.auth}?` + new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    scope: 'openid email profile govbr_confiabilidades',
    redirect_uri: redirectUri,
    nonce: crypto.randomBytes(16).toString('hex'),
    state,
  }).toString()

  res.redirect(authUrl)
})

// Start Gov.br OAuth flow (authenticated — client portal)
router.get('/govbr/authorize-client', authMiddleware, requireRole('cliente'), (req, res) => {
  const config = getGovBRConfig(req.user.company_id)
  if (!config) return res.status(400).json({ error: 'Gov.br nao configurado' })

  // Find the client's contract
  const client = get('SELECT id FROM clients WHERE user_id = ? AND company_id = ?', [req.user.id, req.user.company_id])
  if (!client) return res.status(404).json({ error: 'Cliente nao encontrado' })

  const contract = get(`SELECT c.id, c.signature_status, c.sign_token FROM contracts c
    WHERE c.company_id = ? AND c.client_id = ? AND c.signature_status != 'signed'
    ORDER BY c.id DESC LIMIT 1`, [req.user.company_id, client.id])
  if (!contract) return res.status(404).json({ error: 'Nenhum contrato pendente' })

  const state = crypto.randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  run(`INSERT INTO govbr_oauth_states (state, company_id, contract_id, sign_token, signer_type, user_id, expires_at)
       VALUES (?, ?, ?, ?, 'client', ?, ?)`,
    [state, req.user.company_id, contract.id, contract.sign_token, req.user.id, expiresAt])

  const appUrl = process.env.APP_URL || 'https://reinonexus.com/audiovisual'
  const redirectUri = `${appUrl.replace(/\/$/, '')}/api/govbr/callback`

  const authUrl = `${config.urls.auth}?` + new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    scope: 'openid email profile govbr_confiabilidades',
    redirect_uri: redirectUri,
    nonce: crypto.randomBytes(16).toString('hex'),
    state,
  }).toString()

  res.redirect(authUrl)
})

// Gov.br OAuth callback — handles token exchange, user info, and signature
router.get('/govbr/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query
  const appUrl = process.env.APP_URL || 'https://reinonexus.com/audiovisual'

  if (oauthError || !code || !state) {
    return res.redirect(`${appUrl}/#/govbr/resultado?status=error&msg=${encodeURIComponent(oauthError || 'Autenticacao cancelada')}`)
  }

  // Validate state
  const oauthState = get('SELECT * FROM govbr_oauth_states WHERE state = ?', [state])
  if (!oauthState) {
    return res.redirect(`${appUrl}/#/govbr/resultado?status=error&msg=${encodeURIComponent('Sessao invalida ou expirada')}`)
  }

  // Check expiry
  if (new Date(oauthState.expires_at) < new Date()) {
    run('DELETE FROM govbr_oauth_states WHERE id = ?', [oauthState.id])
    return res.redirect(`${appUrl}/#/govbr/resultado?status=error&msg=${encodeURIComponent('Sessao expirada. Tente novamente.')}`)
  }

  // Clean up used state
  run('DELETE FROM govbr_oauth_states WHERE id = ?', [oauthState.id])

  const config = getGovBRConfig(oauthState.company_id)
  if (!config) {
    return res.redirect(`${appUrl}/#/govbr/resultado?status=error&msg=${encodeURIComponent('Gov.br nao configurado')}`)
  }

  const redirectUri = `${appUrl.replace(/\/$/, '')}/api/govbr/callback`

  try {
    // 1. Exchange code for access token
    const tokenRes = await fetch(config.urls.token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    })

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      console.error('Gov.br token error:', errText)
      return res.redirect(`${appUrl}/#/govbr/resultado?status=error&msg=${encodeURIComponent('Erro ao autenticar com Gov.br')}`)
    }

    const tokenData = await tokenRes.json()
    const accessToken = tokenData.access_token

    // 2. Get user info (CPF, name, trust level)
    const userInfoRes = await fetch(config.urls.userinfo, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    const userInfo = await userInfoRes.json()

    const cpf = userInfo.sub // CPF is the 'sub' claim in Gov.br
    const name = userInfo.name || userInfo.given_name || ''
    const email = userInfo.email || ''

    // Determine trust level from confiabilidades
    let nivel = 'bronze'
    if (userInfo.govbr_confiabilidades) {
      const confs = Array.isArray(userInfo.govbr_confiabilidades) ? userInfo.govbr_confiabilidades : []
      if (confs.some(c => c.id === 'biovalid' || c.id === 'facial')) nivel = 'ouro'
      else if (confs.some(c => c.id === 'balcao_sef' || c.id === 'balcao_denatran' || c.id === 'internet_banking')) nivel = 'prata'
    }

    // 3. Get contract and generate document hash
    const contract = get('SELECT * FROM contracts WHERE id = ?', [oauthState.contract_id])
    if (!contract) {
      return res.redirect(`${appUrl}/#/govbr/resultado?status=error&msg=${encodeURIComponent('Contrato nao encontrado')}`)
    }
    if (contract.signature_status === 'signed') {
      return res.redirect(`${appUrl}/#/govbr/resultado?status=error&msg=${encodeURIComponent('Contrato ja assinado')}`)
    }

    const clauses = all('SELECT title, content, items_json, position FROM contract_clauses WHERE contract_id = ? ORDER BY position', [oauthState.contract_id])
    const docContent = JSON.stringify({ contract, clauses })
    const docHash = crypto.createHash('sha256').update(docContent).digest('hex')
    const hashBase64 = Buffer.from(docHash, 'hex').toString('base64')

    // 4. Call Gov.br signature API (PKCS7)
    let pkcs7Signature = null
    try {
      const signRes = await fetch(config.urls.sign, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ hashBase64 }),
      })

      if (signRes.ok) {
        const signData = await signRes.json()
        pkcs7Signature = signData.assinaturaBase64 || signData.signature || null
      } else {
        console.error('Gov.br sign API error:', await signRes.text())
        // Continue even if PKCS7 fails — the OAuth authentication itself is already proof
      }
    } catch (signErr) {
      console.error('Gov.br sign API error:', signErr)
      // Continue — OAuth auth is still valid proof
    }

    // 5. Register the signature
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown'
    const userAgent = req.headers['user-agent'] || 'unknown'

    // Check if there's an existing pending signature record
    const existingSig = get('SELECT id FROM contract_signatures WHERE contract_id = ? AND signed_at IS NULL ORDER BY id DESC LIMIT 1', [oauthState.contract_id])

    if (existingSig) {
      run(`UPDATE contract_signatures SET
           signer_name = ?, signer_cpf = ?, signer_email = ?,
           ip_address = ?, user_agent = ?, signed_at = CURRENT_TIMESTAMP,
           document_hash = ?, signature_method = 'govbr',
           govbr_cpf = ?, govbr_name = ?, govbr_nivel = ?,
           pkcs7_signature = ?
           WHERE id = ?`,
        [name, cpf, email, ip, userAgent, docHash, cpf, name, nivel, pkcs7Signature, existingSig.id])
    } else {
      run(`INSERT INTO contract_signatures (contract_id, signer_role, signer_name, signer_cpf, signer_email,
           ip_address, user_agent, signed_at, document_hash, signature_method,
           govbr_cpf, govbr_name, govbr_nivel, pkcs7_signature)
           VALUES (?, 'contratante', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, 'govbr', ?, ?, ?, ?)`,
        [oauthState.contract_id, name, cpf, email, ip, userAgent, docHash, cpf, name, nivel, pkcs7Signature])
    }

    // Update contract status
    run('UPDATE contracts SET signature_status = ?, document_hash = ? WHERE id = ?',
      ['signed', docHash, oauthState.contract_id])

    // Redirect to success page
    const params = new URLSearchParams({
      status: 'success',
      name,
      cpf: cpf ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '',
      nivel,
      hash: docHash,
      title: contract.title || '',
      type: oauthState.signer_type,
      signToken: oauthState.sign_token || '',
    })
    res.redirect(`${appUrl}/#/govbr/resultado?${params.toString()}`)

  } catch (err) {
    console.error('Gov.br callback error:', err)
    res.redirect(`${appUrl}/#/govbr/resultado?status=error&msg=${encodeURIComponent('Erro interno ao processar assinatura')}`)
  }
})

// Clean up expired OAuth states (runs on each request, lightweight)
setInterval(() => {
  try { run("DELETE FROM govbr_oauth_states WHERE expires_at < datetime('now')") } catch {}
}, 5 * 60 * 1000)

// ============ COMMENTS (accessible by editor and client too) ============

router.get('/orders/:id/comments', authMiddleware, (req, res) => {
  const orderId = req.params.id
  const uid = req.user.id
  const role = req.user.role
  const cid = req.user.company_id

  // Verify access
  if (role === 'cliente') {
    const client = get('SELECT id FROM clients WHERE user_id = ? AND company_id = ?', [uid, cid])
    const order = get('SELECT id FROM orders WHERE id = ? AND client_id = ?', [orderId, client?.id])
    if (!order) return res.status(403).json({ error: 'Acesso negado' })
  } else if (role === 'editor') {
    const order = get('SELECT id FROM orders WHERE id = ? AND editor_id = ?', [orderId, uid])
    if (!order) return res.status(403).json({ error: 'Acesso negado' })
  } else if (role !== 'gestor' && role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' })
  }

  const comments = all(
    `SELECT c.*, u.name as user_name, u.avatar as user_avatar, u.role as user_role
     FROM comments c JOIN users u ON u.id = c.user_id
     WHERE c.order_id = ? ORDER BY c.created_at ASC`,
    [orderId]
  )
  res.json(comments)
})

router.post('/orders/:id/comments', authMiddleware, (req, res) => {
  const orderId = req.params.id
  const uid = req.user.id
  const role = req.user.role
  const cid = req.user.company_id
  const { text, timestamp_mark } = req.body
  if (!text) return res.status(400).json({ error: 'Texto obrigatorio' })

  // Verify access
  let order
  if (role === 'cliente') {
    const client = get('SELECT id FROM clients WHERE user_id = ? AND company_id = ?', [uid, cid])
    order = get('SELECT * FROM orders WHERE id = ? AND client_id = ?', [orderId, client?.id])
  } else if (role === 'editor') {
    order = get('SELECT * FROM orders WHERE id = ? AND editor_id = ?', [orderId, uid])
  } else {
    order = get('SELECT * FROM orders WHERE id = ? AND company_id = ?', [orderId, cid])
  }
  if (!order) return res.status(403).json({ error: 'Acesso negado' })

  const result = run(
    'INSERT INTO comments (order_id, user_id, text, timestamp_mark) VALUES (?, ?, ?, ?)',
    [orderId, uid, text, timestamp_mark || null]
  )

  const user = get('SELECT name, avatar, role FROM users WHERE id = ?', [uid])
  res.json({
    id: result.lastInsertRowid,
    order_id: Number(orderId),
    user_id: uid,
    text,
    timestamp_mark: timestamp_mark || null,
    user_name: user.name,
    user_avatar: user.avatar,
    user_role: user.role,
    created_at: new Date().toISOString(),
  })
})

// ============ ORDER TEMPLATES ============

router.get('/templates', authMiddleware, requireRole('gestor'), (req, res) => {
  const templates = all(
    'SELECT * FROM order_templates WHERE company_id = ? ORDER BY created_at DESC',
    [req.user.company_id]
  )
  res.json(templates)
})

router.post('/templates', authMiddleware, requireRole('gestor'), (req, res) => {
  const { name, description, briefing, priority, drive_links } = req.body
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' })
  const result = run(
    'INSERT INTO order_templates (company_id, name, description, briefing, priority, drive_links) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.company_id, name, description || null, briefing || null, priority || 'normal', drive_links || null]
  )
  res.json({ id: result.lastInsertRowid, name, description, briefing, priority, drive_links })
})

router.delete('/templates/:id', authMiddleware, requireRole('gestor'), (req, res) => {
  run('DELETE FROM order_templates WHERE id = ? AND company_id = ?', [req.params.id, req.user.company_id])
  res.json({ success: true })
})

// ============ CALENDAR EVENTS ============

router.get('/calendar', authMiddleware, (req, res) => {
  const cid = req.user.company_id
  const { month } = req.query // format: YYYY-MM

  let where = 'o.company_id = ? AND o.due_date IS NOT NULL'
  const params = [cid]
  if (month) {
    where += " AND o.due_date LIKE ? || '%'"
    params.push(month)
  }

  const orders = all(
    `SELECT o.id, o.title, o.due_date, o.priority, o.approved,
       kc.name as column_name, kc.color as column_color,
       c.name as client_name, u.name as editor_name
     FROM orders o
     LEFT JOIN kanban_columns kc ON kc.id = o.column_id
     LEFT JOIN clients c ON c.id = o.client_id
     LEFT JOIN users u ON u.id = o.editor_id
     WHERE ${where}
     ORDER BY o.due_date`,
    params
  )

  res.json({ orders })
})

// ============ ACTIVITY LOG ============

router.get('/activity', authMiddleware, (req, res) => {
  const logs = all(
    'SELECT al.*, u.name as user_name FROM activity_log al LEFT JOIN users u ON u.id = al.user_id WHERE al.company_id = ? ORDER BY al.created_at DESC LIMIT 50',
    [req.user.company_id]
  )
  res.json(logs)
})

// ============ ADMIN PANEL ============

// Admin dashboard — overview of all companies
router.get('/admin/dashboard', authMiddleware, requireRole('admin'), (req, res) => {
  const totalCompanies = get("SELECT COUNT(*) as count FROM companies").count
  const totalUsers = get("SELECT COUNT(*) as count FROM users WHERE active = 1").count
  const totalGestors = get("SELECT COUNT(*) as count FROM users WHERE role = 'gestor' AND active = 1").count
  const totalOrders = get("SELECT COUNT(*) as count FROM orders").count

  const activeSubs = get("SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active'").count
  const pendingSubs = get("SELECT COUNT(*) as count FROM subscriptions WHERE status = 'pending'").count
  const trialSubs = get("SELECT COUNT(*) as count FROM subscriptions WHERE status = 'trial'").count
  const cancelledSubs = get("SELECT COUNT(*) as count FROM subscriptions WHERE status IN ('cancelled','suspended')").count

  const mrr = get("SELECT COALESCE(SUM(p.price), 0) as total FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.status = 'active'").total
  const pendingPixPayments = get("SELECT COUNT(*) as count FROM subscription_payments WHERE payment_method = 'pix' AND status = 'pending'").count

  const recentPayments = all(
    `SELECT sp.*, c.name as company_name FROM subscription_payments sp
     JOIN companies c ON c.id = sp.company_id
     ORDER BY sp.created_at DESC LIMIT 20`
  )

  // Recent signups
  const recentCompanies = all(
    `SELECT c.id, c.name, c.logo, c.created_at,
       (SELECT COUNT(*) FROM orders WHERE company_id = c.id) as order_count,
       (SELECT COUNT(*) FROM users WHERE company_id = c.id AND role = 'editor') as editor_count,
       (SELECT COUNT(*) FROM clients WHERE company_id = c.id AND active = 1) as client_count,
       s.status as sub_status, s.trial_ends_at, s.current_period_end,
       p.name as plan_name, p.price as plan_price
     FROM companies c
     LEFT JOIN subscriptions s ON s.company_id = c.id
     LEFT JOIN plans p ON p.id = s.plan_id
     ORDER BY c.created_at DESC LIMIT 50`
  )

  res.json({
    stats: { totalCompanies, totalUsers, totalGestors, totalOrders, activeSubs, pendingSubs, trialSubs, cancelledSubs, mrr, pendingPixPayments },
    recentPayments,
    companies: recentCompanies,
  })
})

// List all companies with details
router.get('/admin/companies', authMiddleware, requireRole('admin'), (req, res) => {
  const companies = all(
    `SELECT c.*,
       (SELECT COUNT(*) FROM orders WHERE company_id = c.id) as order_count,
       (SELECT COUNT(*) FROM users WHERE company_id = c.id AND role = 'editor' AND active = 1) as editor_count,
       (SELECT COUNT(*) FROM users WHERE company_id = c.id AND role = 'gestor' AND active = 1) as gestor_count,
       (SELECT COUNT(*) FROM clients WHERE company_id = c.id AND active = 1) as client_count,
       s.id as sub_id, s.status as sub_status, s.plan_id, s.trial_ends_at, s.current_period_start, s.current_period_end,
       p.name as plan_name, p.price as plan_price,
       (SELECT u.name FROM users u WHERE u.company_id = c.id AND u.role = 'gestor' LIMIT 1) as gestor_name,
       (SELECT u.email FROM users u WHERE u.company_id = c.id AND u.role = 'gestor' LIMIT 1) as gestor_email
     FROM companies c
     LEFT JOIN subscriptions s ON s.company_id = c.id
     LEFT JOIN plans p ON p.id = s.plan_id
     ORDER BY c.created_at DESC`
  )
  res.json(companies)
})

// Update subscription status (manual control)
router.put('/admin/subscriptions/:companyId', authMiddleware, requireRole('admin'), (req, res) => {
  const { status, plan_id, current_period_end } = req.body
  const companyId = req.params.companyId

  const existing = get('SELECT id FROM subscriptions WHERE company_id = ?', [companyId])

  if (existing) {
    const updates = []
    const params = []
    if (status) { updates.push('status = ?'); params.push(status) }
    if (plan_id) { updates.push('plan_id = ?'); params.push(plan_id) }
    if (current_period_end) { updates.push('current_period_end = ?'); params.push(current_period_end) }
    if (status === 'active' && !current_period_end) {
      // Set period to 30 days from now
      const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      updates.push('current_period_start = ?', 'current_period_end = ?')
      params.push(new Date().toISOString(), end)
    }
    updates.push('updated_at = CURRENT_TIMESTAMP')
    params.push(companyId)
    run(`UPDATE subscriptions SET ${updates.join(', ')} WHERE company_id = ?`, params)
  } else {
    const defaultPlan = get('SELECT id FROM plans WHERE active = 1 ORDER BY price LIMIT 1')
    const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    run(
      'INSERT INTO subscriptions (company_id, plan_id, status, current_period_start, current_period_end) VALUES (?, ?, ?, ?, ?)',
      [companyId, plan_id || defaultPlan?.id, status || 'active', new Date().toISOString(), end]
    )
  }

  const sub = get(
    'SELECT s.*, p.name as plan_name FROM subscriptions s LEFT JOIN plans p ON p.id = s.plan_id WHERE s.company_id = ?',
    [companyId]
  )
  res.json(sub)
})

// Record a manual payment
router.post('/admin/payments', authMiddleware, requireRole('admin'), (req, res) => {
  const { company_id, amount, payment_method, notes } = req.body
  const sub = get('SELECT id FROM subscriptions WHERE company_id = ?', [company_id])
  if (!sub) return res.status(404).json({ error: 'Assinatura não encontrada' })

  run(
    'INSERT INTO subscription_payments (subscription_id, company_id, amount, status, payment_method, paid_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
    [sub.id, company_id, amount, 'approved', payment_method || 'manual']
  )

  // Activate subscription and extend period by 30 days
  const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  run(
    'UPDATE subscriptions SET status = ?, current_period_start = ?, current_period_end = ?, updated_at = CURRENT_TIMESTAMP WHERE company_id = ?',
    ['active', new Date().toISOString(), end, company_id]
  )

  res.json({ success: true })
})

// Delete a payment record (admin only — for removing test payments)
router.delete('/admin/payments/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const paymentId = parseInt(req.params.id)
  const payment = get('SELECT * FROM subscription_payments WHERE id = ?', [paymentId])
  if (!payment) return res.status(404).json({ error: 'Pagamento nao encontrado' })
  run('DELETE FROM subscription_payments WHERE id = ?', [paymentId])
  res.json({ success: true })
})

// Manage plans
router.get('/admin/plans', authMiddleware, requireRole('admin'), (req, res) => {
  const plans = all('SELECT * FROM plans ORDER BY position, price')
  for (const p of plans) {
    try { p.benefits = JSON.parse(p.benefits || '[]') } catch { p.benefits = [] }
  }
  res.json(plans)
})

router.post('/admin/plans', authMiddleware, requireRole('admin'), (req, res) => {
  const { name, price, description, type, benefits, active, visible, featured, discount_3m, discount_6m, discount_12m } = req.body
  if (!name) return res.status(400).json({ error: 'Nome do plano e obrigatorio' })

  const maxPos = get('SELECT MAX(position) as mp FROM plans')?.mp || 0
  const result = run(
    `INSERT INTO plans (name, price, description, type, benefits, active, visible, featured, discount_3m, discount_6m, discount_12m, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      price || 0,
      description || '',
      type || 'Mensal (1 mes)',
      JSON.stringify(benefits || []),
      active !== undefined ? (active ? 1 : 0) : 1,
      visible !== undefined ? (visible ? 1 : 0) : 1,
      featured ? 1 : 0,
      discount_3m || 0,
      discount_6m || 0,
      discount_12m || 0,
      maxPos + 1,
    ]
  )
  const plan = get('SELECT * FROM plans WHERE id = ?', [result.lastInsertRowid])
  try { plan.benefits = JSON.parse(plan.benefits || '[]') } catch { plan.benefits = [] }
  res.json(plan)
})

router.put('/admin/plans/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const body = req.body
  const sets = []
  const params = []

  const fields = {
    name: body.name,
    price: body.price,
    description: body.description,
    type: body.type,
    benefits: body.benefits !== undefined ? JSON.stringify(body.benefits) : undefined,
    active: body.active !== undefined ? (body.active ? 1 : 0) : undefined,
    visible: body.visible !== undefined ? (body.visible ? 1 : 0) : undefined,
    featured: body.featured !== undefined ? (body.featured ? 1 : 0) : undefined,
    discount_3m: body.discount_3m,
    discount_6m: body.discount_6m,
    discount_12m: body.discount_12m,
    position: body.position,
  }

  for (const [col, val] of Object.entries(fields)) {
    if (val !== undefined && val !== null) {
      sets.push(`${col} = ?`)
      params.push(val)
    }
  }

  if (sets.length > 0) {
    params.push(parseInt(req.params.id))
    run(`UPDATE plans SET ${sets.join(', ')} WHERE id = ?`, params)
  }

  // If this plan is set as featured, un-feature all others
  if (body.featured) {
    run('UPDATE plans SET featured = 0 WHERE id != ?', [parseInt(req.params.id)])
  }

  const plan = get('SELECT * FROM plans WHERE id = ?', [parseInt(req.params.id)])
  try { plan.benefits = JSON.parse(plan.benefits || '[]') } catch { plan.benefits = [] }
  res.json(plan)
})

router.delete('/admin/plans/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const planId = parseInt(req.params.id)

  // Check if any active subscription uses this plan
  const activeSubs = get('SELECT COUNT(*) as count FROM subscriptions WHERE plan_id = ? AND status IN (\'trial\',\'active\')', [planId])
  if (activeSubs?.count > 0) {
    return res.status(400).json({ error: `Nao e possivel excluir: ${activeSubs.count} assinatura(s) ativa(s) usam este plano` })
  }

  run('DELETE FROM plans WHERE id = ?', [planId])
  res.json({ success: true })
})

// ============ PLATFORM SETTINGS (admin) ============

// Get platform settings (admin only — returns masked secrets)
router.get('/admin/settings', authMiddleware, requireRole('admin'), (req, res) => {
  const rows = all('SELECT key, value, updated_at FROM platform_settings')
  const settings = {}
  for (const row of rows) {
    // Mask sensitive tokens — only show last 8 chars
    if (row.key.includes('token') || row.key.includes('secret')) {
      settings[row.key] = {
        value: row.value ? ('*'.repeat(Math.max(0, row.value.length - 8)) + row.value.slice(-8)) : '',
        hasValue: !!row.value,
        updated_at: row.updated_at,
      }
    } else {
      settings[row.key] = { value: row.value || '', hasValue: !!row.value, updated_at: row.updated_at }
    }
  }
  res.json(settings)
})

// Update platform settings (admin only)
router.put('/admin/settings', authMiddleware, requireRole('admin'), (req, res) => {
  const { settings } = req.body
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'Formato inválido' })
  }

  for (const [key, value] of Object.entries(settings)) {
    // Skip masked values (don't overwrite with asterisks)
    if (typeof value === 'string' && /^\*+/.test(value)) continue

    const existing = get('SELECT key FROM platform_settings WHERE key = ?', [key])
    if (existing) {
      run('UPDATE platform_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?', [value, key])
    } else {
      run('INSERT INTO platform_settings (key, value) VALUES (?, ?)', [key, value])
    }
  }

  // Reset MP client cache so it picks up new token
  mpClient = null
  mpTokenCache = null

  res.json({ success: true })
})

// Delete company and ALL its data (cascading delete)
router.delete('/admin/companies/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const companyId = parseInt(req.params.id)

  // Prevent deleting the admin's own company
  if (companyId === req.user.company_id) {
    return res.status(400).json({ error: 'Você não pode excluir sua própria empresa' })
  }

  const company = get('SELECT * FROM companies WHERE id = ?', [companyId])
  if (!company) return res.status(404).json({ error: 'Empresa não encontrada' })

  // Get all order IDs for this company (needed for child tables)
  const orderIds = all('SELECT id FROM orders WHERE company_id = ?', [companyId]).map(o => o.id)
  const clientIds = all('SELECT id FROM clients WHERE company_id = ?', [companyId]).map(c => c.id)
  const invoiceIds = all('SELECT id FROM client_invoices WHERE company_id = ?', [companyId]).map(i => i.id)
  const batchIds = all('SELECT id FROM editor_payment_batches WHERE company_id = ?', [companyId]).map(b => b.id)

  // 1. Delete order child tables
  if (orderIds.length > 0) {
    const placeholders = orderIds.map(() => '?').join(',')
    run(`DELETE FROM order_checklist WHERE order_id IN (${placeholders})`, orderIds)
    run(`DELETE FROM comments WHERE order_id IN (${placeholders})`, orderIds)
    run(`DELETE FROM versions WHERE order_id IN (${placeholders})`, orderIds)
  }

  // 2. Delete invoice/batch items
  if (invoiceIds.length > 0) {
    const ph = invoiceIds.map(() => '?').join(',')
    run(`DELETE FROM client_invoice_items WHERE invoice_id IN (${ph})`, invoiceIds)
  }
  if (batchIds.length > 0) {
    const ph = batchIds.map(() => '?').join(',')
    run(`DELETE FROM editor_payment_items WHERE batch_id IN (${ph})`, batchIds)
  }

  // 3. Delete all company-level data
  run('DELETE FROM orders WHERE company_id = ?', [companyId])
  run('DELETE FROM kanban_columns WHERE company_id = ?', [companyId])
  run('DELETE FROM invites WHERE company_id = ?', [companyId])
  run('DELETE FROM client_invoices WHERE company_id = ?', [companyId])
  run('DELETE FROM editor_payment_batches WHERE company_id = ?', [companyId])
  run('DELETE FROM payments WHERE company_id = ?', [companyId])
  run('DELETE FROM files WHERE company_id = ?', [companyId])
  run('DELETE FROM notifications WHERE company_id = ?', [companyId])
  run('DELETE FROM activity_log WHERE company_id = ?', [companyId])
  run('DELETE FROM daily_records WHERE company_id = ?', [companyId])
  run('DELETE FROM team_memberships WHERE company_id = ?', [companyId])
  run('DELETE FROM team_invites WHERE company_id = ?', [companyId])
  run('DELETE FROM order_templates WHERE company_id = ?', [companyId])
  run('DELETE FROM subscription_payments WHERE company_id = ?', [companyId])
  run('DELETE FROM subscriptions WHERE company_id = ?', [companyId])
  run('DELETE FROM clients WHERE company_id = ?', [companyId])
  run('DELETE FROM users WHERE company_id = ?', [companyId])
  run('DELETE FROM companies WHERE id = ?', [companyId])

  res.json({ success: true, message: `Empresa "${company.name}" e todos os dados foram excluídos` })
})

// Get subscription status (for current user's company)
router.get('/subscription', authMiddleware, (req, res) => {
  const sub = get(
    'SELECT s.*, p.name as plan_name, p.price as plan_price, p.max_editors, p.max_clients, p.max_orders_month FROM subscriptions s LEFT JOIN plans p ON p.id = s.plan_id WHERE s.company_id = ?',
    [req.user.company_id]
  )
  res.json(sub || { status: 'none' })
})

// ============ MERCADO PAGO PAYMENT ============

// Helper: get discount config from platform_settings
function getPaymentDiscounts() {
  const row = get("SELECT value FROM platform_settings WHERE key = 'payment_discounts'")
  try { return row?.value ? JSON.parse(row.value) : {} } catch { return {} }
}

// Get payment config (public for authenticated users)
router.get('/payment/config', authMiddleware, (req, res) => {
  const sub = get(
    'SELECT s.*, p.name as plan_name, p.price as plan_price, p.discount_3m, p.discount_6m, p.discount_12m FROM subscriptions s LEFT JOIN plans p ON p.id = s.plan_id WHERE s.company_id = ?',
    [req.user.company_id]
  )
  const basePrice = sub?.plan_price || 97.90

  // Use per-plan discount config (falls back to global settings for legacy)
  const planDiscount3 = sub?.discount_3m || 0
  const planDiscount6 = sub?.discount_6m || 0
  const planDiscount12 = sub?.discount_12m || 0

  // Build pricing tiers
  const tiers = [1, 3, 6, 12].map(months => {
    let discountPct = 0
    if (months === 3) discountPct = planDiscount3
    else if (months === 6) discountPct = planDiscount6
    else if (months === 12) discountPct = planDiscount12
    const pricePerMonth = basePrice * (1 - discountPct / 100)
    const total = Math.round(pricePerMonth * months * 100) / 100
    const savings = Math.round((basePrice * months - total) * 100) / 100
    return { months, discountPct, pricePerMonth: Math.round(pricePerMonth * 100) / 100, total, savings }
  })

  const mpOk = !!getMPClient()

  res.json({
    subscription: sub || { status: 'none' },
    basePrice,
    tiers,
    mpConfigured: mpOk,
    pixConfigured: mpOk, // PIX is available when MP is configured
  })
})

// Create checkout preference for subscription payment
router.post('/payment/create-preference', authMiddleware, async (req, res) => {
  try {
    const client = getMPClient()
    if (!client) return res.status(500).json({ error: 'Mercado Pago não configurado. Entre em contato com o suporte.' })

    const { months = 1 } = req.body
    const validMonths = [1, 3, 6, 12]
    if (!validMonths.includes(months)) {
      return res.status(400).json({ error: 'Período inválido' })
    }

    const user = get('SELECT * FROM users WHERE id = ?', [req.user.id])
    const company = get('SELECT * FROM companies WHERE id = ?', [req.user.company_id])
    const sub = get(
      'SELECT s.*, p.name as plan_name, p.price as plan_price, p.discount_3m, p.discount_6m, p.discount_12m FROM subscriptions s LEFT JOIN plans p ON p.id = s.plan_id WHERE s.company_id = ?',
      [req.user.company_id]
    )

    if (!sub) return res.status(400).json({ error: 'Nenhuma assinatura encontrada' })

    // Calculate price with per-plan discount
    const basePrice = sub.plan_price || 97.90
    let discountPct = 0
    if (months === 3) discountPct = sub.discount_3m || 0
    else if (months === 6) discountPct = sub.discount_6m || 0
    else if (months === 12) discountPct = sub.discount_12m || 0
    const pricePerMonth = basePrice * (1 - discountPct / 100)
    const totalPrice = Math.round(pricePerMonth * months * 100) / 100

    const basePath = process.env.BASE_PATH || '/audiovisual'
    const appUrlRow = get("SELECT value FROM platform_settings WHERE key = 'app_url'")
    const rawAppUrl = appUrlRow?.value || process.env.APP_URL || 'https://reinonexusideal.com.br'
    // If app_url already ends with basePath, don't duplicate it
    const baseUrl = rawAppUrl.endsWith(basePath) ? rawAppUrl : rawAppUrl + basePath

    const periodLabel = months === 1 ? 'Mensal' : `${months} meses`

    const preference = new Preference(client)
    const result = await preference.create({
      body: {
        items: [
          {
            id: `nexus-sub-${sub.plan_id}-${months}m`,
            title: `Nexus Audiovisual - ${sub.plan_name || 'Profissional'} (${periodLabel})`,
            description: `${company.name} — ${months} ${months === 1 ? 'mes' : 'meses'} de assinatura`,
            quantity: 1,
            unit_price: totalPrice,
            currency_id: 'BRL',
          }
        ],
        payer: {
          email: user.email,
          name: user.name,
        },
        external_reference: JSON.stringify({
          company_id: req.user.company_id,
          subscription_id: sub.id,
          user_id: req.user.id,
          months,
          discount_pct: discountPct,
        }),
        back_urls: {
          success: `${baseUrl}/dashboard/settings?payment=success`,
          failure: `${baseUrl}/dashboard/settings?payment=failure`,
          pending: `${baseUrl}/dashboard/settings?payment=pending`,
        },
        auto_return: 'approved',
        notification_url: `${baseUrl}/api/payment/webhook`,
      }
    })

    res.json({
      id: result.id,
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point,
    })
  } catch (err) {
    console.error('MP create preference error:', err)
    res.status(500).json({ error: 'Erro ao criar pagamento: ' + (err.message || 'erro desconhecido') })
  }
})

// Mercado Pago webhook (IPN notification)
router.post('/payment/webhook', async (req, res) => {
  try {
    console.log('[MP-WEBHOOK] Received:', JSON.stringify(req.body))

    const { type, data, action } = req.body

    // Handle both IPN and webhook v2 formats
    const paymentId = data?.id || req.body.id
    const isPayment = type === 'payment' || action === 'payment.created' || action === 'payment.updated'

    if (isPayment && paymentId) {
      // Use REST API directly instead of SDK (SDK Payment API requires production homologation)
      const tokenRow = get("SELECT value FROM platform_settings WHERE key = 'mp_access_token'")
      const accessToken = tokenRow?.value || process.env.MP_ACCESS_TOKEN || ''
      if (!accessToken) {
        console.log('[MP-WEBHOOK] No access token configured, skipping')
        return res.sendStatus(200)
      }

      console.log(`[MP-WEBHOOK] Fetching payment ${paymentId}...`)
      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })

      if (!mpRes.ok) {
        const errText = await mpRes.text()
        console.error(`[MP-WEBHOOK] Failed to fetch payment ${paymentId}: ${mpRes.status} ${errText}`)
        return res.sendStatus(200)
      }

      const paymentData = await mpRes.json()
      console.log(`[MP-WEBHOOK] Payment ${paymentId}: status=${paymentData.status}, amount=${paymentData.transaction_amount}, ref=${paymentData.external_reference}`)

      if (paymentData.status === 'approved') {
        let ref
        try {
          ref = JSON.parse(paymentData.external_reference)
        } catch { ref = {} }

        const companyId = ref.company_id
        const subId = ref.subscription_id
        const months = ref.months || 1

        if (companyId && subId) {
          // Check for duplicate payment
          const existing = get('SELECT id FROM subscription_payments WHERE mp_payment_id = ?', [String(paymentId)])
          if (existing) {
            console.log(`[MP-WEBHOOK] Duplicate webhook for payment ${paymentId}, skipping`)
            return res.sendStatus(200)
          }

          // Record payment
          run(
            'INSERT INTO subscription_payments (subscription_id, company_id, amount, status, payment_method, mp_payment_id, paid_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
            [subId, companyId, paymentData.transaction_amount, 'approved', paymentData.payment_method_id || 'mercadopago', String(paymentId)]
          )

          // Stack months: extend from current_period_end if active, or from now
          const currentSub = get('SELECT * FROM subscriptions WHERE id = ?', [subId])
          let startFrom = new Date()
          if (currentSub && currentSub.status === 'active' && currentSub.current_period_end) {
            const existingEnd = new Date(currentSub.current_period_end)
            if (existingEnd > startFrom) startFrom = existingEnd
          }

          const newEnd = new Date(startFrom.getTime() + months * 30 * 24 * 60 * 60 * 1000).toISOString()
          const periodStart = currentSub?.status === 'active' ? currentSub.current_period_start : new Date().toISOString()

          run(
            'UPDATE subscriptions SET status = ?, current_period_start = ?, current_period_end = ?, mp_payer_email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['active', periodStart, newEnd, paymentData.payer?.email || '', subId]
          )

          console.log(`[MP-WEBHOOK] Payment approved for company ${companyId}: R$${paymentData.transaction_amount} (+${months} months, until ${newEnd})`)
        } else {
          console.log(`[MP-WEBHOOK] Payment approved but missing ref data: companyId=${companyId}, subId=${subId}`)
        }
      }
    } else {
      console.log(`[MP-WEBHOOK] Ignoring event: type=${type}, action=${action}`)
    }

    res.sendStatus(200)
  } catch (err) {
    console.error('[MP-WEBHOOK] Error:', err)
    res.sendStatus(200)
  }
})

// Check payment status
router.get('/payment/status', authMiddleware, (req, res) => {
  const sub = get(
    'SELECT s.*, p.name as plan_name, p.price as plan_price FROM subscriptions s LEFT JOIN plans p ON p.id = s.plan_id WHERE s.company_id = ?',
    [req.user.company_id]
  )

  const lastPayment = get(
    'SELECT * FROM subscription_payments WHERE company_id = ? ORDER BY created_at DESC LIMIT 1',
    [req.user.company_id]
  )

  const payments = all(
    'SELECT * FROM subscription_payments WHERE company_id = ? ORDER BY created_at DESC LIMIT 10',
    [req.user.company_id]
  )

  const discounts = getPaymentDiscounts()

  res.json({
    subscription: sub || { status: 'none' },
    lastPayment,
    payments,
    discounts,
    mpConfigured: !!getMPClient(),
  })
})

// ============ PIX PAYMENT (via Mercado Pago Checkout Pro) ============

// Create a Preference restricted to PIX only — redirects to MP page with QR code
router.post('/payment/pix', authMiddleware, async (req, res) => {
  try {
    const client = getMPClient()
    if (!client) return res.status(500).json({ error: 'Mercado Pago não configurado.' })

    const { months = 1 } = req.body
    const validMonths = [1, 3, 6, 12]
    if (!validMonths.includes(months)) {
      return res.status(400).json({ error: 'Período inválido' })
    }

    const sub = get(
      'SELECT s.*, p.name as plan_name, p.price as plan_price, p.discount_3m, p.discount_6m, p.discount_12m FROM subscriptions s LEFT JOIN plans p ON p.id = s.plan_id WHERE s.company_id = ?',
      [req.user.company_id]
    )
    if (!sub) return res.status(400).json({ error: 'Nenhuma assinatura encontrada' })

    const user = get('SELECT * FROM users WHERE id = ?', [req.user.id])
    const company = get('SELECT * FROM companies WHERE id = ?', [req.user.company_id])

    // Calculate price with per-plan discount
    const basePrice = sub.plan_price || 97.90
    let discountPct = 0
    if (months === 3) discountPct = sub.discount_3m || 0
    else if (months === 6) discountPct = sub.discount_6m || 0
    else if (months === 12) discountPct = sub.discount_12m || 0
    const pricePerMonth = basePrice * (1 - discountPct / 100)
    const totalPrice = Math.round(pricePerMonth * months * 100) / 100

    const basePath = process.env.BASE_PATH || '/audiovisual'
    const appUrlRow = get("SELECT value FROM platform_settings WHERE key = 'app_url'")
    const rawAppUrl = appUrlRow?.value || process.env.APP_URL || 'https://reinonexusideal.com.br'
    // If app_url already ends with basePath, don't duplicate it
    const baseUrl = rawAppUrl.endsWith(basePath) ? rawAppUrl : rawAppUrl + basePath

    const periodLabel = months === 1 ? 'Mensal' : `${months} meses`

    const preference = new Preference(client)
    const result = await preference.create({
      body: {
        items: [
          {
            id: `nexus-pix-${sub.plan_id}-${months}m`,
            title: `Nexus Audiovisual - ${sub.plan_name || 'Profissional'} (${periodLabel})`,
            description: `${company.name} — ${months} ${months === 1 ? 'mes' : 'meses'} de assinatura`,
            quantity: 1,
            unit_price: totalPrice,
            currency_id: 'BRL',
          }
        ],
        payer: {
          email: user.email,
          name: user.name,
        },
        payment_methods: {
          excluded_payment_types: [
            { id: 'credit_card' },
            { id: 'debit_card' },
            { id: 'ticket' },
            { id: 'prepaid_card' },
            { id: 'digital_currency' },
            { id: 'digital_wallet' },
          ],
        },
        external_reference: JSON.stringify({
          company_id: req.user.company_id,
          subscription_id: sub.id,
          user_id: req.user.id,
          months,
          discount_pct: discountPct,
        }),
        back_urls: {
          success: `${baseUrl}/dashboard/settings?payment=success`,
          failure: `${baseUrl}/dashboard/settings?payment=failure`,
          pending: `${baseUrl}/dashboard/settings?payment=pending`,
        },
        auto_return: 'approved',
        notification_url: `${baseUrl}/api/payment/webhook`,
      }
    })

    console.log(`[PIX-MP] Preference created for ${company?.name}: R$${totalPrice} (${months} months) — ID: ${result.id}`)

    res.json({
      id: result.id,
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point,
    })
  } catch (err) {
    console.error('PIX preference error:', err)
    res.status(500).json({ error: 'Erro ao gerar PIX: ' + (err.message || 'erro desconhecido') })
  }
})

// ============ CONTRACT VALIDATION ============

// Upload and validate a signed PDF
router.post('/contracts/validate', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo PDF obrigatório' })

    const contractId = req.body.contract_id || null
    const report = await validateContract(req.file.buffer)

    // Save validation to history
    const result = run(
      'INSERT INTO contract_validations (company_id, user_id, filename, file_size, status, report, signature_count, confidence, contract_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.company_id, req.user.id, req.file.originalname, req.file.size,
        report.status, JSON.stringify(report), report.signatureCount, report.confidence, contractId]
    )

    // If linked to a contract and validation passed, update contract's validation status
    if (contractId && (report.status === 'valid' || report.status === 'partially_valid')) {
      run('UPDATE contracts SET validation_status = ?, validation_date = ?, validated_filename = ? WHERE id = ? AND company_id = ?',
        [report.status, new Date().toISOString(), req.file.originalname, contractId, req.user.company_id])
    }

    run('INSERT INTO activity_log (company_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.company_id, req.user.id, 'validated', 'contract', contractId || result.lastInsertRowid,
        `Validação de contrato: ${req.file.originalname} — ${report.status} (${report.confidence}%)`])

    res.json({ id: Number(result.lastInsertRowid), ...report })
  } catch (err) {
    console.error('Contract validation error:', err)
    res.status(500).json({ error: 'Erro na validação: ' + err.message })
  }
})

// Get validation history
router.get('/contracts/validations', authMiddleware, (req, res) => {
  const validations = all(
    `SELECT cv.id, cv.filename, cv.file_size, cv.status, cv.signature_count, cv.confidence, cv.created_at,
       u.name as validated_by
     FROM contract_validations cv
     JOIN users u ON u.id = cv.user_id
     WHERE cv.company_id = ?
     ORDER BY cv.created_at DESC
     LIMIT 50`,
    [req.user.company_id]
  )
  res.json(validations)
})

// Get single validation report
router.get('/contracts/validations/:id', authMiddleware, (req, res) => {
  const v = get(
    'SELECT * FROM contract_validations WHERE id = ? AND company_id = ?',
    [req.params.id, req.user.company_id]
  )
  if (!v) return res.status(404).json({ error: 'Validação não encontrada' })
  v.report = JSON.parse(v.report || '{}')
  res.json(v)
})

export default router
