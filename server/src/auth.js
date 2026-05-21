import jwt from 'jsonwebtoken'
import { get } from './db.js'

const JWT_SECRET = process.env.JWT_SECRET || 'nexus-audiovisual-secret-2024'

function generateToken(user) {
  return jwt.sign(
    { id: user.id, company_id: user.company_id, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  )
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header) return res.status(401).json({ error: 'Token não fornecido' })

  const token = header.replace('Bearer ', '')
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch {
    return res.status(401).json({ error: 'Token inválido' })
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Sem permissão' })
    }
    next()
  }
}

// Middleware that checks if the company has an active subscription
// Skips for admin role and public routes
function requireActiveSubscription(req, res, next) {
  // Admin bypasses everything
  if (req.user.role === 'admin') return next()

  // Editors and clients inherit access from their gestor's company
  const companyId = req.user.company_id

  const sub = get(
    'SELECT s.*, p.name as plan_name FROM subscriptions s LEFT JOIN plans p ON p.id = s.plan_id WHERE s.company_id = ?',
    [companyId]
  )

  // No subscription found — check if company was created before SaaS system (legacy)
  if (!sub) {
    // Allow access but attach info so frontend can show banner
    req.subscription = { status: 'none', legacy: true }
    return next()
  }

  const now = new Date().toISOString()

  if (sub.status === 'active') {
    // Check if period has ended
    if (sub.current_period_end && sub.current_period_end < now) {
      req.subscription = { ...sub, status: 'past_due' }
      // Still allow access with warning
      return next()
    }
    req.subscription = sub
    return next()
  }

  if (sub.status === 'trial') {
    if (sub.trial_ends_at && sub.trial_ends_at < now) {
      // Trial expired
      return res.status(402).json({
        error: 'Período de teste expirado',
        code: 'TRIAL_EXPIRED',
        subscription: { status: 'trial_expired' }
      })
    }
    req.subscription = sub
    return next()
  }

  if (sub.status === 'suspended' || sub.status === 'cancelled') {
    return res.status(402).json({
      error: 'Assinatura suspensa',
      code: 'SUBSCRIPTION_SUSPENDED',
      subscription: { status: sub.status }
    })
  }

  // past_due — allow with warning
  req.subscription = sub
  next()
}

export { generateToken, authMiddleware, requireRole, requireActiveSubscription, JWT_SECRET }
