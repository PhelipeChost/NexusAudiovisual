import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { MercadoPagoConfig, Preference, Payment as MPPayment } from 'mercadopago'
import { run, get, all, createDefaultColumns } from './db.js'
import { generateToken, authMiddleware, requireRole, requireActiveSubscription } from './auth.js'

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
    `SELECT o.*, u.name as editor_name, kc.name as column_name, kc.color as column_color
     FROM orders o
     LEFT JOIN users u ON u.id = o.editor_id
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

  const totalValue = orders.reduce((s, o) => s + (o.value || 0), 0)
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total_amount || 0), 0)
  const totalPending = invoices.filter(i => i.status === 'pending').reduce((s, i) => s + (i.total_amount || 0), 0)

  res.json({ invoices, orders, totalValue, totalPaid, totalPending })
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
  const { title, description, briefing, drive_links, priority, due_date, editor_id, value, editor_value } = req.body
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
    `INSERT INTO orders (company_id, client_id, column_id, editor_id, title, description, briefing, drive_links, priority, due_date, position, value, editor_value)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user.company_id, req.params.clientId, firstCol?.id || null,
      editor_id || null, title, description || null, briefing || null,
      drive_links || null, priority || 'normal', due_date || null, (maxPos?.max || 0) + 1, orderValue, editorValue
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

  // Per-client summary: all finalized orders in this month
  const perClient = all(`
    SELECT c.id as client_id, c.name as client_name,
      COUNT(o.id) as total_orders,
      COALESCE(SUM(o.value), 0) as total_value,
      COALESCE((SELECT SUM(cii.amount) FROM client_invoice_items cii
        JOIN client_invoices ci ON ci.id = cii.invoice_id
        WHERE ci.client_id = c.id AND ci.company_id = ? AND ci.status = 'paid'), 0) as total_received,
      COALESCE((SELECT SUM(cii.amount) FROM client_invoice_items cii
        JOIN client_invoices ci ON ci.id = cii.invoice_id
        WHERE ci.client_id = c.id AND ci.company_id = ? AND ci.status = 'pending'), 0) as total_pending_invoice
    FROM clients c
    LEFT JOIN orders o ON o.client_id = c.id AND o.company_id = ?
      AND DATE(o.updated_at) BETWEEN ? AND ?
    WHERE c.company_id = ? AND c.active = 1
    GROUP BY c.id
    HAVING total_orders > 0
    ORDER BY total_value DESC
  `, [cid, cid, cid, startDate, endDate, cid])

  // Per-editor summary
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
    WHERE u.company_id = ? AND u.role = 'editor' AND u.active = 1
    GROUP BY u.id
    HAVING total_orders > 0
    ORDER BY total_value DESC
  `, [cid, cid, cid, startDate, endDate, cid])

  // Totals
  const totals = get(`
    SELECT
      COALESCE(SUM(o.value), 0) as total_billed
    FROM orders o
    WHERE o.company_id = ? AND DATE(o.updated_at) BETWEEN ? AND ?
  `, [cid, startDate, endDate])

  const totalReceivedClients = get(`
    SELECT COALESCE(SUM(ci.total_amount), 0) as total
    FROM client_invoices ci WHERE ci.company_id = ? AND ci.status = 'paid'
    AND DATE(ci.paid_at) BETWEEN ? AND ?
  `, [cid, startDate, endDate])

  const totalPendingClients = get(`
    SELECT COALESCE(SUM(ci.total_amount), 0) as total
    FROM client_invoices ci WHERE ci.company_id = ? AND ci.status = 'pending'
    AND DATE(ci.created_at) BETWEEN ? AND ?
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

  res.json({
    month,
    totalBilled: totals.total_billed,
    totalReceivedClients: totalReceivedClients.total,
    totalPendingClients: totalPendingClients.total,
    totalPaidEditors: totalPaidEditors.total,
    totalPendingEditors: totalPendingEditors.total,
    perClient,
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

  res.json({ client, orders, dailyRecords, uninvoiced, invoices })
})

// Editor spreadsheet (per-editor, per-day)
router.get('/financial/editor-sheet/:editorId', authMiddleware, requireRole('gestor'), (req, res) => {
  const cid = req.user.company_id
  const editorId = req.params.editorId
  const month = req.query.month
  if (!month) return res.status(400).json({ error: 'Parâmetro month obrigatório' })

  const startDate = `${month}-01`
  const endDate = `${month}-31`

  const editor = get('SELECT * FROM users WHERE id = ? AND company_id = ?', [editorId, cid])
  if (!editor) return res.status(404).json({ error: 'Editor não encontrado' })

  // Orders for this editor in this month
  const orders = all(`
    SELECT o.*, c.name as client_name, kc.name as column_name,
      (SELECT ci.status FROM client_invoice_items cii JOIN client_invoices ci ON ci.id = cii.invoice_id WHERE cii.order_id = o.id LIMIT 1) as client_paid,
      (SELECT epb.id FROM editor_payment_items epi JOIN editor_payment_batches epb ON epb.id = epi.batch_id WHERE epi.order_id = o.id LIMIT 1) as batch_id,
      (SELECT epb.status FROM editor_payment_items epi JOIN editor_payment_batches epb ON epb.id = epi.batch_id WHERE epi.order_id = o.id LIMIT 1) as batch_status
    FROM orders o
    LEFT JOIN clients c ON c.id = o.client_id
    LEFT JOIN kanban_columns kc ON kc.id = o.column_id
    WHERE o.editor_id = ? AND o.company_id = ?
    AND DATE(o.updated_at) BETWEEN ? AND ?
    ORDER BY o.updated_at ASC
  `, [editorId, cid, startDate, endDate])

  // Unpaid orders for this editor (all time - for batch creation)
  const unpaid = all(`
    SELECT o.*, c.name as client_name,
      (SELECT ci.status FROM client_invoice_items cii JOIN client_invoices ci ON ci.id = cii.invoice_id WHERE cii.order_id = o.id LIMIT 1) as client_paid
    FROM orders o
    LEFT JOIN clients c ON c.id = o.client_id
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

  res.json({ editor, orders, unpaid, batches })
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

// Create editor payment batch
router.post('/financial/editor-batches', authMiddleware, requireRole('gestor'), (req, res) => {
  const { editor_id, order_ids, notes } = req.body
  if (!editor_id || !order_ids || order_ids.length === 0) {
    return res.status(400).json({ error: 'Editor e pedidos são obrigatórios' })
  }

  let totalAmount = 0
  for (const oid of order_ids) {
    const order = get('SELECT editor_value FROM orders WHERE id = ? AND company_id = ?', [oid, req.user.company_id])
    if (order) totalAmount += (order.editor_value || 0)
  }

  const result = run(
    'INSERT INTO editor_payment_batches (company_id, editor_id, total_amount, notes) VALUES (?, ?, ?, ?)',
    [req.user.company_id, editor_id, totalAmount, notes || null]
  )

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

  // Notify editor
  const editor = get('SELECT name FROM users WHERE id = ?', [editor_id])
  run('INSERT INTO notifications (company_id, user_id, type, title, message, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.user.company_id, editor_id, 'payment', 'Pagamento registrado',
      `Lote de R$ ${totalAmount.toFixed(2)} (${order_ids.length} trabalhos) registrado`, result.lastInsertRowid, 'editor_batch'])

  run('INSERT INTO activity_log (company_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.company_id, req.user.id, 'created', 'editor_batch', result.lastInsertRowid,
      `Pagamento para ${editor?.name} - R$ ${totalAmount.toFixed(2)} (${order_ids.length} itens)`])

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

  run('DELETE FROM editor_payment_items WHERE batch_id = ?', [req.params.id])
  run('DELETE FROM editor_payment_batches WHERE id = ?', [req.params.id])
  res.json({ success: true })
})

// Get editor batch items
router.get('/financial/editor-batches/:id/items', authMiddleware, requireRole('gestor'), (req, res) => {
  const items = all(`
    SELECT epi.*, o.title as order_title, c.name as client_name
    FROM editor_payment_items epi
    JOIN orders o ON o.id = epi.order_id
    LEFT JOIN clients c ON c.id = o.client_id
    WHERE epi.batch_id = ?
  `, [req.params.id])
  const batch = get('SELECT epb.*, u.name as editor_name FROM editor_payment_batches epb JOIN users u ON u.id = epb.editor_id WHERE epb.id = ?', [req.params.id])
  res.json({ batch, items })
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
  res.json(company)
})

router.put('/settings', authMiddleware, requireRole('gestor'), (req, res) => {
  const { name, logo, primary_color } = req.body

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

  const company = get('SELECT * FROM companies WHERE id = ?', [req.user.company_id])
  res.json(company)
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
    const baseUrl = appUrlRow?.value || process.env.APP_URL || 'https://reinonexusideal.com.br'

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
          success: `${baseUrl}${basePath}/dashboard/settings?payment=success`,
          failure: `${baseUrl}${basePath}/dashboard/settings?payment=failure`,
          pending: `${baseUrl}${basePath}/dashboard/settings?payment=pending`,
        },
        auto_return: 'approved',
        notification_url: `${baseUrl}${basePath}/api/payment/webhook`,
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
    const { type, data } = req.body

    if (type === 'payment') {
      const client = getMPClient()
      if (!client) return res.sendStatus(200)

      const payment = new MPPayment(client)
      const paymentData = await payment.get({ id: data.id })

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
          const existing = get('SELECT id FROM subscription_payments WHERE mp_payment_id = ?', [String(data.id)])
          if (existing) {
            console.log(`[MP] Duplicate webhook for payment ${data.id}, skipping`)
            return res.sendStatus(200)
          }

          // Record payment
          run(
            'INSERT INTO subscription_payments (subscription_id, company_id, amount, status, payment_method, mp_payment_id, paid_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
            [subId, companyId, paymentData.transaction_amount, 'approved', 'mercadopago', String(data.id)]
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

          console.log(`[MP] Payment approved for company ${companyId}: R$${paymentData.transaction_amount} (+${months} months, until ${newEnd})`)
        }
      }
    }

    res.sendStatus(200)
  } catch (err) {
    console.error('MP webhook error:', err)
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
    const baseUrl = appUrlRow?.value || process.env.APP_URL || 'https://reinonexusideal.com.br'

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
          success: `${baseUrl}${basePath}/dashboard/settings?payment=success`,
          failure: `${baseUrl}${basePath}/dashboard/settings?payment=failure`,
          pending: `${baseUrl}${basePath}/dashboard/settings?payment=pending`,
        },
        auto_return: 'approved',
        notification_url: `${baseUrl}${basePath}/api/payment/webhook`,
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

export default router
