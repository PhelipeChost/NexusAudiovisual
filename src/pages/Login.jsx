// src/pages/Login.jsx — entrar
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import theme from '../styles/theme'
import { Icon, LogoMark, Field, inputStyle, btnPrimary } from '../components/ui'

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await login(email, password)
    } catch (err) {
      setError(err.message || 'Erro ao entrar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: '100vh' }}>
      {/* Editorial side */}
      <div style={{
        padding: '48px 64px',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        background: 'linear-gradient(135deg, var(--bg) 0%, rgba(127, 219, 255, 0.05) 100%)',
        position: 'relative', overflow: 'hidden',
        borderRight: `1px solid ${theme.colors.border}`,
      }}>
        <div className="grid-bg" style={{ position: 'absolute', inset: 0, opacity: 0.3, pointerEvents: 'none' }} />

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
          <LogoMark size={36} />
          <span className="display" style={{ fontSize: 22, color: theme.colors.text }}>Nexus</span>
        </div>

        <div style={{ position: 'relative', maxWidth: 540 }}>
          <div className="eyebrow" style={{ marginBottom: 18 }}>plataforma audiovisual</div>
          <h1 className="display" style={{ fontSize: 56, lineHeight: 1, letterSpacing: '-0.02em', marginBottom: 20, color: theme.colors.text }}>
            Onde sua agência <span className="display-italic" style={{ color: theme.colors.primary }}>encontra ritmo</span>.
          </h1>
          <p style={{ fontSize: 15, color: theme.colors.textSecondary, lineHeight: 1.55, maxWidth: 460 }}>
            Pipeline de produção, briefings, aprovações e financeiro em um único lugar.
          </p>
        </div>

        <div style={{ position: 'relative', fontSize: 11.5, color: theme.colors.textFaint, display: 'flex', justifyContent: 'space-between' }}>
          <span>© {new Date().getFullYear()} Nexus</span>
          <span className="mono">PT-BR</span>
        </div>
      </div>

      {/* Form side */}
      <div style={{ padding: '48px 64px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <form onSubmit={handleSubmit} style={{ maxWidth: 380, width: '100%', margin: '0 auto' }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>entrar</div>
          <h2 className="display" style={{ fontSize: 38, lineHeight: 1, letterSpacing: '-0.01em', marginBottom: 8, color: theme.colors.text }}>
            Bem-vindo de volta.
          </h2>
          <p style={{ fontSize: 13.5, color: theme.colors.textMuted, marginBottom: 32 }}>
            Acesse seu workspace.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Email">
              <input value={email} onChange={e => setEmail(e.target.value)}
                type="email" required autoFocus placeholder="seu@email.com" style={inputStyle} />
            </Field>
            <Field label="Senha">
              <input value={password} onChange={e => setPassword(e.target.value)}
                type="password" required placeholder="••••••••" style={inputStyle} />
            </Field>

            {error && (
              <div style={{
                padding: '10px 12px', borderRadius: 8,
                background: theme.colors.dangerMuted,
                border: '1px solid rgba(244, 115, 131, 0.3)',
                color: theme.colors.danger, fontSize: 12.5,
              }}>{error}</div>
            )}

            <button type="submit" disabled={loading} style={{
              ...btnPrimary,
              justifyContent: 'center', padding: '12px 20px', marginTop: 6,
              opacity: loading ? 0.6 : 1, cursor: loading ? 'wait' : 'pointer',
            }}>
              {loading ? 'Entrando…' : 'Entrar'}
              {!loading && <Icon name="arrowRight" size={13} stroke />}
            </button>
          </div>

          <div style={{ marginTop: 28, fontSize: 12.5, color: theme.colors.textMuted, textAlign: 'center' }}>
            Ainda não tem conta?{' '}
            <Link to="/register" style={{ color: theme.colors.primary }}>Criar workspace</Link>
          </div>
        </form>
      </div>
    </div>
  )
}
