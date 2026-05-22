// src/pages/Register.jsx — criar conta (gestor ou editor)
import { useState, useEffect } from 'react'
import { Link, useSearchParams, useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api'
import theme from '../styles/theme'
import { Icon, LogoMark, Field, PasswordInput, inputStyle, btnPrimary, btnSoft, Spinner } from '../components/ui'

export default function Register() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preselectedPlan = searchParams.get('plan')
  const [registered, setRegistered] = useState(false)

  // If already logged in and not just registered, redirect to dashboard
  if (user && !registered) return <Navigate to="/dashboard" />

  const [role, setRole] = useState('gestor')
  const [form, setForm] = useState({ name: '', email: '', password: '', company_name: '', phone: '', specialty: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Plans for gestor registration
  const [plans, setPlans] = useState([])
  const [selectedPlanId, setSelectedPlanId] = useState(null)
  const [loadingPlans, setLoadingPlans] = useState(true)

  useEffect(() => {
    api.public.plans().then(d => {
      const arr = Array.isArray(d) ? d : d.plans || []
      setPlans(arr)
      // Pre-select plan from URL or first available
      if (preselectedPlan) {
        const found = arr.find(p => String(p.id) === preselectedPlan)
        if (found) setSelectedPlanId(found.id)
        else if (arr.length > 0) setSelectedPlanId(arr[0].id)
      } else if (arr.length > 0) {
        // Select featured plan or first
        const featured = arr.find(p => p.featured)
        setSelectedPlanId(featured ? featured.id : arr[0].id)
      }
    }).catch(() => {}).finally(() => setLoadingPlans(false))
  }, [preselectedPlan])

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (role === 'editor') {
        await register({ name: form.name, email: form.email, password: form.password, role: 'editor', phone: form.phone, specialty: form.specialty })
        setRegistered(true)
        navigate('/dashboard', { replace: true })
      } else {
        if (!selectedPlanId && plans.length > 0) {
          setError('Selecione um plano para continuar')
          setLoading(false)
          return
        }
        await register({
          name: form.name,
          email: form.email,
          password: form.password,
          companyName: form.company_name,
          plan_id: selectedPlanId,
        })
        // Redirect gestor to settings to complete payment
        setRegistered(true)
        navigate('/dashboard/settings', { replace: true })
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

  const selectedPlan = plans.find(p => p.id === selectedPlanId)

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
          <div className="eyebrow" style={{ marginBottom: 18 }}>
            {role === 'gestor' ? 'escolha seu plano' : 'comece agora'}
          </div>
          {role === 'gestor' ? (
            <>
              <h1 className="display" style={{ fontSize: 48, lineHeight: 1, letterSpacing: '-0.02em', marginBottom: 20, color: theme.colors.text }}>
                Sua ag&ecirc;ncia, <span className="display-italic" style={{ color: theme.colors.warm }}>organizada</span>.
              </h1>
              <p style={{ fontSize: 15, color: theme.colors.textSecondary, lineHeight: 1.55, maxWidth: 460 }}>
                Cadastre-se, escolha seu plano e comece a gerenciar seus projetos audiovisuais.
              </p>

              {/* Plan selection cards */}
              {loadingPlans ? (
                <div style={{ marginTop: 32 }}><Spinner /></div>
              ) : plans.length > 0 ? (
                <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {plans.map(plan => {
                    const isSelected = selectedPlanId === plan.id
                    const benefits = Array.isArray(plan.benefits) ? plan.benefits : []
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setSelectedPlanId(plan.id)}
                        style={{
                          padding: '16px 20px',
                          borderRadius: 12,
                          border: `2px solid ${isSelected ? theme.colors.primary : theme.colors.border}`,
                          background: isSelected ? theme.colors.primaryMuted : 'transparent',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s',
                          position: 'relative',
                        }}
                      >
                        {plan.featured && (
                          <span style={{
                            position: 'absolute', top: -1, right: 16,
                            padding: '2px 10px', borderRadius: '0 0 6px 6px',
                            background: theme.colors.warm, color: theme.colors.bg,
                            fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                          }}>
                            Popular
                          </span>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{
                              fontSize: 15, fontWeight: 600,
                              color: isSelected ? theme.colors.text : theme.colors.textSecondary,
                              marginBottom: 2,
                            }}>
                              {plan.name}
                            </div>
                            {plan.type && (
                              <div style={{ fontSize: 11, color: theme.colors.textMuted }}>{plan.type}</div>
                            )}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span className="display tnum" style={{
                              fontSize: 22, color: isSelected ? theme.colors.primary : theme.colors.text,
                            }}>
                              R${plan.price % 1 === 0 ? plan.price.toFixed(0) : plan.price.toFixed(2).replace('.', ',')}
                            </span>
                            <span style={{ fontSize: 12, color: theme.colors.textMuted }}>/mes</span>
                          </div>
                        </div>

                        {/* Show benefits when selected */}
                        {isSelected && benefits.length > 0 && (
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${theme.colors.border}` }}>
                            {benefits.slice(0, 4).map((b, i) => (
                              <div key={i} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '3px 0',
                                fontSize: 12,
                                color: b.included ? theme.colors.textSecondary : theme.colors.textFaint,
                              }}>
                                <span style={{
                                  color: b.included ? theme.colors.mint : theme.colors.danger,
                                  fontSize: 11, fontWeight: 700,
                                }}>
                                  {b.included ? '✓' : '✕'}
                                </span>
                                {b.text}
                              </div>
                            ))}
                            {benefits.length > 4 && (
                              <div style={{ fontSize: 11, color: theme.colors.textFaint, marginTop: 4 }}>
                                +{benefits.length - 4} recursos
                              </div>
                            )}
                          </div>
                        )}

                        {/* Discount badges */}
                        {isSelected && (plan.discount_3m > 0 || plan.discount_6m > 0 || plan.discount_12m > 0) && (
                          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                            {plan.discount_3m > 0 && (
                              <span style={{
                                padding: '2px 8px', borderRadius: 4,
                                background: 'rgba(0,210,150,0.1)', color: theme.colors.mint,
                                fontSize: 10, fontWeight: 600,
                              }}>3m: -{plan.discount_3m}%</span>
                            )}
                            {plan.discount_6m > 0 && (
                              <span style={{
                                padding: '2px 8px', borderRadius: 4,
                                background: 'rgba(0,210,150,0.1)', color: theme.colors.mint,
                                fontSize: 10, fontWeight: 600,
                              }}>6m: -{plan.discount_6m}%</span>
                            )}
                            {plan.discount_12m > 0 && (
                              <span style={{
                                padding: '2px 8px', borderRadius: 4,
                                background: 'rgba(0,210,150,0.1)', color: theme.colors.mint,
                                fontSize: 10, fontWeight: 600,
                              }}>12m: -{plan.discount_12m}%</span>
                            )}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <h1 className="display" style={{ fontSize: 48, lineHeight: 1, letterSpacing: '-0.02em', marginBottom: 20, color: theme.colors.text }}>
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
              ? selectedPlan
                ? `Plano ${selectedPlan.name} — R$${selectedPlan.price % 1 === 0 ? selectedPlan.price.toFixed(0) : selectedPlan.price.toFixed(2).replace('.', ',')}/mes`
                : 'Voce sera o gestor da sua agencia no Nexus.'
              : 'Crie sua conta e aguarde convites de equipes.'}
          </p>

          {/* Role toggle */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
            {roleBtn('gestor', 'Gestor', 'Gerencio uma agencia ou equipe', 'dashboard')}
            {roleBtn('editor', 'Editor', 'Edito videos para agencias', 'team')}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {role === 'gestor' && (
              <Field label="Nome da agencia" required>
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
            <Field label="Senha" required hint="Minimo 6 caracteres">
              <PasswordInput value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                required minLength={6} />
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

          {role === 'gestor' && (
            <p style={{ marginTop: 14, fontSize: 11.5, color: theme.colors.textFaint, textAlign: 'center', lineHeight: 1.5 }}>
              Apos o cadastro, realize o pagamento nas configuracoes para ativar o acesso completo.
            </p>
          )}

          <div style={{ marginTop: 28, fontSize: 12.5, color: theme.colors.textMuted, textAlign: 'center' }}>
            Ja tem conta? <Link to="/login" style={{ color: theme.colors.primary }}>Entrar</Link>
          </div>
        </form>
      </div>
    </div>
  )
}
