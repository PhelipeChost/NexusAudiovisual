import jwt from 'jsonwebtoken'

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

export { generateToken, authMiddleware, requireRole, JWT_SECRET }
