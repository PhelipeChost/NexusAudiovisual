// src/pages/Register.jsx — criar conta (gestor ou editor)
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import theme from '../styles/theme'
import { Icon, LogoMark, Field, inputStyle, btnPrimary } from '../components/ui'

export default function Register() {
  const { register } = useAuth()
  const [role, setRole] = useState('gestor')
  const [form, setForm] = useState({ name: '', email: '', password: '', company_name: '', phone: '', specialty: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (role === 'editor') {
        await register({ name: form.name, email: form.email, password: form.password, role: 'editor', phone: form.phone, specialty: form.specialty })
      } else {
        await register({ name: form.name, email: form.email, password: form.password, companyName: form.company_name })
      }
    } catch (err) {
      setError(err.message || 'Erro ao criar conta')
    } finally {
      setLoading(false)
    }
  }

  const roleBtn = (r, label, desc, icon) => (
    <button
      type="button"
      onClick={() => setRole(r)}
      style={{
        flex: 1,
        padding: '16px 18px',
        borderRadius: 10,
        border: `1.5px solid ${role === r ? theme.colors.primary : theme.colors.border}`,
        background: role === r ? theme.colors.primaryMuted : 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Icon name={icon} size={16} color={role === r ? theme.colors.primary : theme.colors.textMuted} />
        <span style={{ fontSize: 14, fontWeight: 600, color: role === r ? theme.colors.text : theme.colors.textSecondary }}>{label}</span>
      </div>
      <div style={{ fontSize: 11.5, color: theme.colors.textMuted, lineHeight: 1.4 }}>{desc}</div>
    </button>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: '100vh' }}>
      <div style={{
        padding: '48px 64px',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        background: role === 'editor'
          ? 'linear-gradient(135deg, var(--bg) 0%, rgba(127, 219, 255, 0.05) 100%)'
          : 'linear-gradient(135deg, var(--bg) 0%, rgba(255, 138, 107, 0.05) 100%)',
        position: 'relative', overflow: 'hidden',
        borderRight: `1px solid ${theme.colors.border}`,
        transition: 'background 0.3s',
      }}>
        <div className="grid-bg" style={{ position: 'absolute', inset: 0, opacity: 0.3, pointerEvents: 'none' }} />

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
          <LogoMark size={36} />
          <span className="display" style={{ fontSize: 22, color: theme.colors.text }}>Nexus</span>
        </div>

        <div style={{ position: 'relative', maxWidth: 540 }}>
          <div className="eyebrow" style={{ marginBottom: 18 }}>comece em 30 segundos</div>
          {role === 'gestor' ? (
            <>
              <h1 className="display" style={{ fontSize: 56, lineHeight: 1, letterSpacing: '-0.02em', marginBottom: 20, color: theme.colors.text }}>
                Sua ag&ecirc;ncia, <span className="display-italic" style={{ color: theme.colors.warm }}>organizada</span>.
              </h1>
              <p style={{ fontSize: 15, color: theme.colors.textSecondary, lineHeight: 1.55, maxWidth: 460 }}>
                Crie seu workspace gratuitamente. Convide editores e clientes quando quiser.
              </p>
            </>
          ) : (
            <>
              <h1 className="display" style={{ fontSize: 56, lineHeight: 1, letterSpacing: '-0.02em', marginBottom: 20, color: theme.colors.text }}>
                Seus projetos, <span className="display-italic" style={{ color: theme.colors.primary }}>centralizados</span>.
              </h1>
              <p style={{ fontSize: 15, color: theme.colors.textSecondary, lineHeight: 1.55, maxWidth: 460 }}>
                Crie sua conta de editor e receba convites de equipes para colaborar em projetos.
              </p>
            </>
          )}
        </div>

        <div style={{ position: 'relative', fontSize: 11.5, color: theme.colors.textFaint }}>
          &copy; {new Date().getFullYear()} Nexus
        </div>
      </div>

      <div style={{ padding: '48px 64px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <form onSubmit={handleSubmit} style={{ maxWidth: 400, width: '100%', margin: '0 auto' }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>criar conta</div>
          <h2 className="display" style={{ fontSize: 38, lineHeight: 1, letterSpacing: '-0.01em', marginBottom: 8, color: theme.colors.text }}>
            {role === 'gestor' ? 'Criar workspace.' : 'Conta de editor.'}
          </h2>
          <p style={{ fontSize: 13.5, color: theme.colors.textMuted, marginBottom: 22 }}>
            {role === 'gestor'
              ? 'Você será o gestor da sua agência no Nexus.'
              : 'Crie sua conta e aguarde convites de equipes.'}
          </p>

          {/* Role toggle */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
            {roleBtn('gestor', 'Gestor', 'Gerencio uma agência ou equipe', 'dashboard')}
            {roleBtn('editor', 'Editor', 'Edito vídeos para agências', 'team')}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {role === 'gestor' && (
              <Field label="Nome da agência" required>
                <input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })}
                  required autoFocus placeholder="Atelier Audiovisual" style={inputStyle} />
              </Field>
            )}
            <Field label="Seu nome" required>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                required placeholder="Marina Cordeiro" style={inputStyle}
                autoFocus={role === 'editor'} />
            </Field>
            <Field label="Email" required>
              <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                type="email" required placeholder="marina@email.com" style={inputStyle} />
            </Field>
            <Field label="Senha" required hint="Mínimo 6 caracteres">
              <input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                type="password" required minLength={6} placeholder="••••••••" style={inputStyle} />
            </Field>

            {role === 'editor' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Telefone">
                  <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                    placeholder="(00) 00000-0000" style={inputStyle} />
                </Field>
                <Field label="Especialidade">
                  <input value={form.specialty} onChange={e => setForm({ ...form, specialty: e.target.value })}
                    placeholder="Ex: Motion, Reels…" style={inputStyle} />
                </Field>
              </div>
            )}

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
              {loading ? 'Criando…' : role === 'gestor' ? 'Criar workspace' : 'Criar conta de editor'}
              {!loading && <Icon name="arrowRight" size={13} stroke />}
            </button>
          </div>

          <div style={{ marginTop: 28, fontSize: 12.5, color: theme.colors.textMuted, textAlign: 'center' }}>
            Já tem conta? <Link to="/login" style={{ color: theme.colors.primary }}>Entrar</Link>
          </div>
        </form>
      </div>
    </div>
  )
}
