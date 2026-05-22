// src/pages/Invite.jsx — aceitar convite (preserva contrato original: parâmetro :token)
import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import theme from '../styles/theme'
import { Icon, LogoMark, Spinner, Field, PasswordInput, inputStyle, btnPrimary } from '../components/ui'

export default function Invite() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { setUser } = useAuth() || {}
  const [invite, setInvite] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ name: '', password: '' })

  useEffect(() => {
    async function load() {
      try {
        const data = await api.invite.get(token)
        setInvite(data)
      } catch (err) {
        setError(err.message || 'Convite inválido ou expirado')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const data = await api.invite.registerClient({
        name: form.name,
        email: invite?.email || form.name,
        password: form.password,
        invite_token: token,
      })
      if (data.token) localStorage.setItem('nexus_token', data.token)
      if (setUser && data?.user) setUser(data.user)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Erro ao aceitar convite')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    )
  }

  if (error && !invite) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h2 className="display" style={{ fontSize: 32, color: theme.colors.text, marginBottom: 12 }}>Convite inválido</h2>
          <p style={{ fontSize: 14, color: theme.colors.textMuted, marginBottom: 24 }}>{error}</p>
          <Link to="/login" style={{ color: theme.colors.primary, fontSize: 13 }}>Voltar para login</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, background: theme.colors.bg }}>
      <div style={{
        maxWidth: 460, width: '100%',
        background: theme.colors.panel,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: 14, padding: 36,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <LogoMark size={36} />
          <span className="display" style={{ fontSize: 22, color: theme.colors.text }}>Nexus</span>
        </div>

        <div className="eyebrow" style={{ marginBottom: 12 }}>você foi convidado</div>
        <h2 className="display" style={{ fontSize: 32, lineHeight: 1.05, color: theme.colors.text, marginBottom: 8 }}>
          {invite?.company_name ? `Entre para ${invite.company_name}` : 'Aceitar convite'}
        </h2>
        <p style={{ fontSize: 13.5, color: theme.colors.textMuted, marginBottom: 28 }}>
          {invite?.role === 'cliente'
            ? 'Acompanhe seus pedidos em tempo real.'
            : invite?.role === 'editor'
              ? 'Gerencie suas entregas de vídeo.'
              : 'Complete seu cadastro para começar.'}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {invite?.email && (
            <Field label="Email">
              <input value={invite.email} readOnly style={{ ...inputStyle, opacity: 0.7, cursor: 'default' }} />
            </Field>
          )}
          <Field label="Seu nome" required>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              required autoFocus placeholder="Como você quer ser chamado" style={inputStyle} />
          </Field>
          <Field label="Crie uma senha" required hint="Mínimo 6 caracteres">
            <PasswordInput value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
              required minLength={6} />
          </Field>

          {error && (
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: theme.colors.dangerMuted, color: theme.colors.danger,
              fontSize: 12.5, border: '1px solid rgba(244, 115, 131, 0.3)',
            }}>{error}</div>
          )}

          <button type="submit" disabled={submitting} style={{
            ...btnPrimary, justifyContent: 'center', padding: '12px 20px', marginTop: 6,
            opacity: submitting ? 0.6 : 1,
          }}>
            {submitting ? 'Criando conta…' : 'Aceitar e entrar'}
            {!submitting && <Icon name="arrowRight" size={13} stroke />}
          </button>
        </form>
      </div>
    </div>
  )
}
