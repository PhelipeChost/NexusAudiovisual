// src/pages/Settings.jsx — configuracoes da agencia
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api'
import theme from '../styles/theme'
import resizeImage from '../utils/resizeImage'
import {
  Icon, Avatar, LogoMark, Spinner, Field,
  inputStyle, btnPrimary, btnSoft, panelStyle,
} from '../components/ui'

const ALL_TABS = [
  { id: 'workspace', label: 'Workspace', roles: ['gestor'] },
  { id: 'subscription', label: 'Plano & Pagamento', roles: ['gestor'] },
  { id: 'columns', label: 'Etapas do kanban', roles: ['gestor'] },
  { id: 'account', label: 'Sua conta', roles: ['gestor', 'editor', 'cliente'] },
]

export default function Settings() {
  const { user } = useAuth()
  const visibleTabs = ALL_TABS.filter(t => t.roles.includes(user?.role))
  // Auto-open subscription tab if payment query param present
  const params = new URLSearchParams(window.location.search)
  const hasPaymentParam = params.has('payment')
  const defaultTab = hasPaymentParam ? 'subscription' : (visibleTabs[0]?.id || 'account')
  const [tab, setTab] = useState(defaultTab)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: visibleTabs.length > 1 ? '220px 1fr' : '1fr', gap: 32, maxWidth: 1100 }}>
      {visibleTabs.length > 1 && (
        <aside>
          <div className="eyebrow" style={{ marginBottom: 12, padding: '0 8px' }}>configuracoes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {visibleTabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: '8px 12px', borderRadius: 6, textAlign: 'left', fontSize: 13,
                color: tab === t.id ? theme.colors.text : theme.colors.textMuted,
                background: tab === t.id ? theme.colors.surfaceHover : 'transparent',
              }}>{t.label}</button>
            ))}
          </div>
        </aside>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {tab === 'workspace' && <WorkspaceSettings />}
        {tab === 'subscription' && <SubscriptionSettings />}
        {tab === 'columns' && <ColumnsSettings />}
        {tab === 'account' && <AccountSettings />}
      </div>
    </div>
  )
}

function WorkspaceSettings() {
  const { user, setUser } = useAuth()
  const [settings, setSettings] = useState(null)
  const [saving, setSaving] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const logoRef = useRef(null)

  useEffect(() => {
    api.settings.get().then(data => {
      setSettings(data)
      setCompanyName(data?.name || '')
    }).catch(console.error)
  }, [])

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setSaving(true)
      const dataUrl = await resizeImage(file, 256, 0.85)
      const result = await api.settings.update({ logo: dataUrl })
      setSettings(result)
      const me = await api.auth.me()
      if (setUser) setUser(me)
    } catch (err) { alert(err.message) } finally { setSaving(false) }
  }

  async function handleSaveName() {
    if (!companyName.trim() || companyName === settings?.name) return
    try {
      setSaving(true)
      const result = await api.settings.update({ name: companyName })
      setSettings(result)
      const me = await api.auth.me()
      if (setUser) setUser(me)
    } catch (err) { alert(err.message) } finally { setSaving(false) }
  }

  return (
    <>
      <div>
        <h2 className="display" style={{ fontSize: 26, color: theme.colors.text, margin: 0 }}>Workspace</h2>
        <p style={{ fontSize: 13, color: theme.colors.textMuted, marginTop: 4 }}>
          Identidade da sua agencia dentro do Nexus.
        </p>
      </div>

      <Section title="Identidade">
        <Row label="Nome da agencia">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="nx-input"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={handleSaveName} style={btnSoft} disabled={saving}>
              Salvar
            </button>
          </div>
        </Row>
        <Row label="Logo" hint="PNG ou JPG, quadrado, max 2MB.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 12,
              background: theme.colors.bg, border: `1px solid ${theme.colors.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}>
              {settings?.logo ? (
                <img src={settings.logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <LogoMark size={40} />
              )}
            </div>
            <input
              ref={logoRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={handleLogoUpload}
              style={{ display: 'none' }}
            />
            <button onClick={() => logoRef.current?.click()} style={btnSoft} disabled={saving}>
              {saving ? 'Enviando...' : 'Trocar logo'}
            </button>
            {settings?.logo && (
              <button
                onClick={async () => {
                  try {
                    setSaving(true)
                    const result = await api.settings.update({ logo: '' })
                    setSettings(result)
                  } catch (err) { alert(err.message) } finally { setSaving(false) }
                }}
                style={{ ...btnSoft, color: theme.colors.danger, borderColor: 'rgba(244,115,131,0.3)' }}
              >
                Remover
              </button>
            )}
          </div>
        </Row>
      </Section>
    </>
  )
}

function SubscriptionSettings() {
  const [config, setConfig] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [paymentMsg, setPaymentMsg] = useState('')
  const [selectedMonths, setSelectedMonths] = useState(1)
  const [payMethod, setPayMethod] = useState('mercadopago') // 'mercadopago' or 'pix'

  useEffect(() => {
    loadAll()
    const params = new URLSearchParams(window.location.search)
    const paymentResult = params.get('payment')
    if (paymentResult) {
      const msgs = {
        success: 'Pagamento aprovado! Sua assinatura foi ativada.',
        failure: 'Pagamento nao concluido. Tente novamente.',
        pending: 'Pagamento pendente. Aguarde a confirmacao.',
      }
      setPaymentMsg(msgs[paymentResult] || '')
      window.history.replaceState(null, '', window.location.pathname)
      if (paymentResult === 'success') setTimeout(() => loadAll(), 2000)
    }
  }, [])

  async function loadAll() {
    try {
      const [c, d] = await Promise.all([api.payment.config(), api.payment.status()])
      setConfig(c)
      setData(d)
      // Auto-select available payment method
      if (!c.mpConfigured && c.pixConfigured) setPayMethod('pix')
      else if (c.mpConfigured && !c.pixConfigured) setPayMethod('mercadopago')
    } catch (err) { console.error(err) } finally { setLoading(false) }
  }

  async function handlePay() {
    setPaying(true)
    setPaymentMsg('')
    try {
      const pref = await api.payment.createPreference(selectedMonths)
      if (pref.init_point) {
        window.location.href = pref.init_point
      } else {
        setPaymentMsg('Erro: link de pagamento nao gerado')
      }
    } catch (err) {
      setPaymentMsg(err.message || 'Erro ao iniciar pagamento')
    } finally { setPaying(false) }
  }

  if (loading) return <Spinner />

  const sub = config?.subscription || data?.subscription || {}
  const isActive = sub.status === 'active'
  const isTrial = sub.status === 'trial'
  const isPending = sub.status === 'pending'
  const isExpired = ['past_due', 'cancelled', 'suspended'].includes(sub.status)
  const tiers = config?.tiers || []
  const selectedTier = tiers.find(t => t.months === selectedMonths) || tiers[0]

  // Days remaining calculation
  let daysRemaining = 0
  let totalDays = 30
  let endDate = null
  if (isActive && sub.current_period_end) {
    endDate = new Date(sub.current_period_end)
    daysRemaining = Math.max(0, Math.ceil((endDate - Date.now()) / 86400000))
    if (sub.current_period_start) {
      totalDays = Math.max(1, Math.ceil((endDate - new Date(sub.current_period_start)) / 86400000))
    }
  } else if (isTrial && sub.trial_ends_at) {
    endDate = new Date(sub.trial_ends_at)
    daysRemaining = Math.max(0, Math.ceil((endDate - Date.now()) / 86400000))
    totalDays = 7
  }
  const progressPct = Math.min(100, Math.max(0, ((totalDays - daysRemaining) / totalDays) * 100))
  const progressColor = daysRemaining > 15 ? theme.colors.mint : daysRemaining > 5 ? theme.colors.warm : theme.colors.danger

  const STATUS_MAP = {
    pending: { label: 'Aguardando Pagamento', color: theme.colors.warm, bg: theme.colors.warmMuted },
    trial: { label: 'Trial', color: theme.colors.warm, bg: theme.colors.warmMuted },
    active: { label: 'Ativo', color: theme.colors.mint, bg: 'rgba(0,210,150,0.12)' },
    past_due: { label: 'Vencido', color: theme.colors.danger, bg: theme.colors.dangerMuted },
    cancelled: { label: 'Cancelado', color: theme.colors.textMuted, bg: theme.colors.bgSecondary },
    suspended: { label: 'Suspenso', color: theme.colors.danger, bg: theme.colors.dangerMuted },
  }
  const st = STATUS_MAP[sub.status] || { label: 'Sem plano', color: theme.colors.textFaint, bg: theme.colors.bgSecondary }

  return (
    <>
      <div>
        <h2 className="display" style={{ fontSize: 26, color: theme.colors.text, margin: 0 }}>Plano & Pagamento</h2>
        <p style={{ fontSize: 13, color: theme.colors.textMuted, marginTop: 4 }}>
          Gerencie sua assinatura do Nexus Audiovisual.
        </p>
      </div>

      {paymentMsg && (
        <div style={{
          padding: '12px 16px', borderRadius: 10,
          background: paymentMsg.includes('aprovado') ? 'rgba(0,210,150,0.12)' : paymentMsg.includes('pendente') ? theme.colors.warmMuted : theme.colors.dangerMuted,
          border: `1px solid ${paymentMsg.includes('aprovado') ? 'rgba(0,210,150,0.3)' : paymentMsg.includes('pendente') ? 'rgba(255,138,107,0.3)' : 'rgba(244,115,131,0.3)'}`,
          color: paymentMsg.includes('aprovado') ? theme.colors.mint : paymentMsg.includes('pendente') ? theme.colors.warm : theme.colors.danger,
          fontSize: 13, fontWeight: 500,
        }}>
          {paymentMsg}
        </div>
      )}

      {/* Status card with progress */}
      <div style={{ ...panelStyle, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Seu plano</div>
            <div className="display" style={{ fontSize: 24, color: theme.colors.text }}>{sub.plan_name || 'Profissional'}</div>
          </div>
          <span style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            background: st.bg, color: st.color, textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            {st.label}
          </span>
        </div>

        {/* Progress bar */}
        {(isActive || isTrial) && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: theme.colors.textSecondary }}>
                {isActive ? 'Pago ate' : 'Trial ate'}{' '}
                <strong style={{ color: theme.colors.text }}>{endDate?.toLocaleDateString('pt-BR')}</strong>
              </span>
              <span className="mono tnum" style={{ fontSize: 22, fontWeight: 700, color: progressColor }}>
                {daysRemaining} <span style={{ fontSize: 12, fontWeight: 400, color: theme.colors.textMuted }}>dias restantes</span>
              </span>
            </div>
            <div style={{
              height: 6, borderRadius: 3, background: theme.colors.bgSecondary,
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 3,
                width: `${progressPct}%`,
                background: progressColor,
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        )}

        {isPending && (
          <div style={{
            padding: '14px 16px', borderRadius: 10, marginBottom: 20,
            background: theme.colors.warmMuted, border: '1px solid rgba(255,138,107,0.3)',
            color: theme.colors.warm, fontSize: 13, fontWeight: 500,
          }}>
            Realize o pagamento abaixo para ativar sua conta e comecar a usar a plataforma.
          </div>
        )}

        {isExpired && (
          <div style={{
            padding: '14px 16px', borderRadius: 10, marginBottom: 20,
            background: theme.colors.dangerMuted, border: '1px solid rgba(244,115,131,0.3)',
            color: theme.colors.danger, fontSize: 13, fontWeight: 500,
          }}>
            Sua assinatura expirou. Renove para continuar usando a plataforma.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ padding: 14, background: theme.colors.bg, borderRadius: 8, border: `1px solid ${theme.colors.border}` }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Valor mensal</div>
            <div className="display tnum" style={{ fontSize: 22, color: theme.colors.primary }}>
              R${(config?.basePrice || 97).toFixed(0)}<span style={{ fontSize: 13, color: theme.colors.textMuted }}>/mes</span>
            </div>
          </div>
          <div style={{ padding: 14, background: theme.colors.bg, borderRadius: 8, border: `1px solid ${theme.colors.border}` }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Metodos de pagamento</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {config?.mpConfigured && (
                <div style={{ fontSize: 13, color: theme.colors.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#009ee3' }}>MP</span>
                  Mercado Pago
                </div>
              )}
              {config?.pixConfigured && (
                <div style={{ fontSize: 13, color: theme.colors.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#32BCAD' }}>PIX</span>
                  PIX
                </div>
              )}
              {!config?.mpConfigured && !config?.pixConfigured && (
                <div style={{ fontSize: 13, color: theme.colors.textMuted }}>Nenhum configurado</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Payment selection */}
      {(config?.mpConfigured || config?.pixConfigured) && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            {isActive ? 'Antecipar pagamento' : isPending ? 'Ative sua conta' : 'Escolha o periodo'}
          </div>
          {isActive && (
            <p style={{ fontSize: 12.5, color: theme.colors.textMuted, marginBottom: 14, marginTop: -4 }}>
              Meses pagos antecipadamente sao adicionados ao seu periodo atual.
            </p>
          )}
          {isPending && (
            <p style={{ fontSize: 12.5, color: theme.colors.textMuted, marginBottom: 14, marginTop: -4 }}>
              Escolha o periodo e realize o pagamento para liberar o acesso completo a plataforma.
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
            {tiers.map(tier => {
              const isSelected = selectedMonths === tier.months
              const isBestValue = tier.months === 12
              return (
                <button
                  key={tier.months}
                  onClick={() => setSelectedMonths(tier.months)}
                  style={{
                    position: 'relative',
                    padding: '18px 14px 14px',
                    borderRadius: 12,
                    border: `2px solid ${isSelected ? theme.colors.primary : theme.colors.border}`,
                    background: isSelected ? theme.colors.primaryMuted : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s',
                    overflow: 'hidden',
                  }}
                >
                  {isBestValue && (
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0,
                      padding: '2px 0', fontSize: 9, fontWeight: 700,
                      background: theme.colors.mint, color: theme.colors.bg,
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                    }}>
                      Melhor valor
                    </div>
                  )}
                  <div className="display" style={{
                    fontSize: 28, color: isSelected ? theme.colors.primary : theme.colors.text,
                    lineHeight: 1, marginBottom: 4, marginTop: isBestValue ? 4 : 0,
                  }}>
                    {tier.months}
                  </div>
                  <div style={{ fontSize: 11, color: theme.colors.textMuted, marginBottom: 8 }}>
                    {tier.months === 1 ? 'mes' : 'meses'}
                  </div>
                  <div className="mono tnum" style={{
                    fontSize: 15, fontWeight: 600,
                    color: isSelected ? theme.colors.text : theme.colors.textSecondary,
                  }}>
                    R${tier.total.toFixed(0)}
                  </div>
                  {tier.discountPct > 0 && (
                    <div style={{
                      marginTop: 6, padding: '2px 8px', borderRadius: 4,
                      background: 'rgba(0,210,150,0.12)',
                      color: theme.colors.mint, fontSize: 10, fontWeight: 600,
                      display: 'inline-block',
                    }}>
                      -{tier.discountPct}%
                    </div>
                  )}
                  {tier.discountPct > 0 && (
                    <div style={{ fontSize: 10, color: theme.colors.textFaint, marginTop: 4 }}>
                      R${tier.pricePerMonth.toFixed(0)}/mes
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Payment method selector */}
          {config?.mpConfigured && config?.pixConfigured && (
            <div style={{ marginBottom: 16 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Metodo de pagamento</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setPayMethod('mercadopago')}
                  style={{
                    flex: 1, padding: '12px 16px', borderRadius: 10,
                    border: `2px solid ${payMethod === 'mercadopago' ? '#009ee3' : theme.colors.border}`,
                    background: payMethod === 'mercadopago' ? 'rgba(0, 158, 227, 0.08)' : 'transparent',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: '#009ee3', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 800, color: '#fff', flexShrink: 0,
                  }}>MP</div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: payMethod === 'mercadopago' ? theme.colors.text : theme.colors.textSecondary }}>Mercado Pago</div>
                    <div style={{ fontSize: 10.5, color: theme.colors.textMuted }}>Cartao, boleto, saldo MP</div>
                  </div>
                </button>
                <button
                  onClick={() => setPayMethod('pix')}
                  style={{
                    flex: 1, padding: '12px 16px', borderRadius: 10,
                    border: `2px solid ${payMethod === 'pix' ? '#32BCAD' : theme.colors.border}`,
                    background: payMethod === 'pix' ? 'rgba(50, 188, 173, 0.08)' : 'transparent',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: '#32BCAD', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 800, color: '#fff', flexShrink: 0,
                  }}>PIX</div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: payMethod === 'pix' ? theme.colors.text : theme.colors.textSecondary }}>PIX</div>
                    <div style={{ fontSize: 10.5, color: theme.colors.textMuted }}>Transferencia instantanea</div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Summary + pay button */}
          {selectedTier && payMethod === 'mercadopago' && config?.mpConfigured && (
            <div style={{
              ...panelStyle, padding: 20,
              border: `1px solid ${theme.colors.primary}33`,
              background: `${theme.colors.primaryMuted}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 14, color: theme.colors.text, fontWeight: 500 }}>
                    {selectedTier.months === 1 ? '1 mes' : `${selectedTier.months} meses`} de Nexus {sub.plan_name || 'Profissional'}
                  </div>
                  {selectedTier.savings > 0 && (
                    <div style={{ fontSize: 12, color: theme.colors.mint, marginTop: 2 }}>
                      Economia de R${selectedTier.savings.toFixed(0)} ({selectedTier.discountPct}% off)
                    </div>
                  )}
                  {isActive && (
                    <div style={{ fontSize: 11.5, color: theme.colors.textMuted, marginTop: 4 }}>
                      Novo vencimento: {new Date(
                        (endDate || new Date()).getTime() + selectedTier.months * 30 * 86400000
                      ).toLocaleDateString('pt-BR')}
                    </div>
                  )}
                </div>
                <div className="display tnum" style={{ fontSize: 28, color: theme.colors.primary }}>
                  R${selectedTier.total.toFixed(0)}
                </div>
              </div>

              <button
                onClick={handlePay}
                disabled={paying}
                style={{
                  ...btnPrimary,
                  justifyContent: 'center', width: '100%',
                  padding: '14px 20px', fontSize: 15,
                  background: '#009ee3',
                  opacity: paying ? 0.6 : 1,
                  cursor: paying ? 'wait' : 'pointer',
                }}
                onMouseOver={e => { if (!paying) e.target.style.background = '#0077b5' }}
                onMouseOut={e => e.target.style.background = '#009ee3'}
              >
                {paying ? 'Redirecionando ao Mercado Pago...' : isActive
                  ? `Antecipar R$${selectedTier.total.toFixed(0)} via Mercado Pago`
                  : isPending
                    ? `Ativar conta — R$${selectedTier.total.toFixed(0)} via Mercado Pago`
                    : `Pagar R$${selectedTier.total.toFixed(0)} via Mercado Pago`}
              </button>
            </div>
          )}

          {/* PIX payment flow (via Mercado Pago Checkout) */}
          {selectedTier && payMethod === 'pix' && config?.pixConfigured && (
            <div style={{ ...panelStyle, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: theme.colors.textSecondary }}>
                  {selectedTier.months === 1 ? '1 mes' : `${selectedTier.months} meses`}
                  {selectedTier.discountPct > 0 && <span style={{ color: theme.colors.mint }}> (-{selectedTier.discountPct}%)</span>}
                </div>
                <div className="display tnum" style={{ fontSize: 24, color: '#32BCAD' }}>
                  R${selectedTier.total.toFixed(2).replace('.', ',')}
                </div>
              </div>
              <button
                onClick={async () => {
                  setPaying(true)
                  setPaymentMsg('')
                  try {
                    const result = await api.payment.createPix(selectedMonths)
                    if (result.init_point) {
                      window.location.href = result.init_point
                    } else {
                      setPaymentMsg('Erro: link de pagamento nao gerado')
                    }
                  } catch (err) {
                    setPaymentMsg(err.message || 'Erro ao gerar pagamento PIX')
                  } finally { setPaying(false) }
                }}
                disabled={paying}
                style={{
                  ...btnPrimary,
                  padding: '14px 28px', fontSize: 14,
                  background: '#32BCAD',
                  opacity: paying ? 0.6 : 1,
                  cursor: paying ? 'wait' : 'pointer',
                }}
                onMouseOver={e => { if (!paying) e.target.style.background = '#2aa89a' }}
                onMouseOut={e => e.target.style.background = '#32BCAD'}
              >
                {paying
                  ? 'Redirecionando...'
                  : isPending
                    ? `Ativar conta — R$${selectedTier.total.toFixed(0)} via PIX`
                    : `Pagar R$${selectedTier.total.toFixed(0)} via PIX`}
              </button>
            </div>
          )}

        </div>
      )}

      {!config?.mpConfigured && !config?.pixConfigured && (
        <div style={{
          ...panelStyle, padding: 20,
          background: theme.colors.warmMuted,
          border: '1px solid rgba(255,138,107,0.3)',
        }}>
          <div style={{ color: theme.colors.warm, fontSize: 13 }}>
            Nenhum metodo de pagamento configurado. Entre em contato com o suporte.
          </div>
        </div>
      )}

      {/* Payment history */}
      {data?.payments?.length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Historico de pagamentos</div>
          <div style={{ ...panelStyle, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: theme.colors.bgSecondary }}>
                  {['Valor', 'Metodo', 'Status', 'Data'].map(h => (
                    <th key={h} className="eyebrow" style={{
                      padding: '10px 14px', textAlign: 'left',
                      borderBottom: `1px solid ${theme.colors.border}`,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.payments.map(p => (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${theme.colors.borderSoft}` }}>
                    <td className="mono tnum" style={{ padding: '10px 14px', fontSize: 13, color: theme.colors.mint, fontWeight: 500 }}>
                      R${parseFloat(p.amount).toFixed(2)}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: theme.colors.textMuted }}>
                      {p.payment_method === 'mercadopago' ? 'Mercado Pago' : p.payment_method === 'pix' ? 'PIX' : p.payment_method || 'manual'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        padding: '2px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                        background: p.status === 'approved' ? 'rgba(0,210,150,0.12)' : p.status === 'pending' ? 'rgba(255,183,77,0.12)' : 'rgba(244,115,131,0.12)',
                        color: p.status === 'approved' ? theme.colors.mint : p.status === 'pending' ? theme.colors.warm : theme.colors.danger,
                        textTransform: 'uppercase',
                      }}>
                        {p.status === 'approved' ? 'pago' : p.status === 'pending' ? 'aguardando' : p.status}
                      </span>
                    </td>
                    <td className="mono tnum" style={{ padding: '10px 14px', fontSize: 12, color: theme.colors.textMuted }}>
                      {p.paid_at ? new Date(p.paid_at).toLocaleDateString('pt-BR') : '---'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

function ColumnsSettings() {
  const [clients, setClients] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [columns, setColumns] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.clients.list().then(setClients).catch(console.error)
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
    api.clients.getColumns(selectedId)
      .then(setColumns)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedId])

  return (
    <>
      <div>
        <h2 className="display" style={{ fontSize: 26, color: theme.colors.text, margin: 0 }}>Etapas do kanban</h2>
        <p style={{ fontSize: 13, color: theme.colors.textMuted, marginTop: 4 }}>
          Personalize o fluxo de producao para cada cliente.
        </p>
      </div>

      <div style={{ ...panelStyle, padding: 24 }}>
        <Field label="Cliente">
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer', maxWidth: 320 }}>
            <option value="">Selecione...</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>

        {loading ? <Spinner /> : columns.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
            {columns.map((col, i) => (
              <div key={col.id} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 14px',
                background: theme.colors.bg,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: 10,
              }}>
                <div className="mono" style={{ fontSize: 11, color: theme.colors.textFaint, width: 22 }}>
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: col.color, boxShadow: `0 0 8px ${col.color}88` }} />
                <span style={{ fontSize: 14, color: theme.colors.text, flex: 1 }}>{col.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function AccountSettings() {
  const { user, logout, setUser } = useAuth()
  const [name, setName] = useState(user?.name || '')
  const [saving, setSaving] = useState(false)
  const avatarRef = useRef(null)

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setSaving(true)
      const dataUrl = await resizeImage(file, 256, 0.85)
      await api.auth.updateProfile({ avatar: dataUrl })
      const me = await api.auth.me()
      if (setUser) setUser(me)
    } catch (err) { alert(err.message) } finally { setSaving(false) }
  }

  async function handleRemoveAvatar() {
    try {
      setSaving(true)
      await api.auth.updateProfile({ avatar: '' })
      const me = await api.auth.me()
      if (setUser) setUser(me)
    } catch (err) { alert(err.message) } finally { setSaving(false) }
  }

  async function handleSaveName() {
    if (!name.trim() || name === user?.name) return
    try {
      setSaving(true)
      await api.auth.updateProfile({ name: name.trim() })
      const me = await api.auth.me()
      if (setUser) setUser(me)
    } catch (err) { alert(err.message) } finally { setSaving(false) }
  }

  return (
    <>
      <div>
        <h2 className="display" style={{ fontSize: 26, color: theme.colors.text, margin: 0 }}>Sua conta</h2>
        <p style={{ fontSize: 13, color: theme.colors.textMuted, marginTop: 4 }}>
          Informacoes pessoais e sessao.
        </p>
      </div>

      <Section title="Perfil">
        <Row label="Foto de perfil" hint="PNG ou JPG, quadrado.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: theme.colors.bg, border: `1px solid ${theme.colors.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', flexShrink: 0,
            }}>
              {user?.avatar ? (
                <img src={user.avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <Avatar name={user?.name} size={56} />
              )}
            </div>
            <input
              ref={avatarRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleAvatarUpload}
              style={{ display: 'none' }}
            />
            <button onClick={() => avatarRef.current?.click()} style={btnSoft} disabled={saving}>
              {saving ? 'Enviando...' : 'Trocar foto'}
            </button>
            {user?.avatar && (
              <button onClick={handleRemoveAvatar} disabled={saving}
                style={{ ...btnSoft, color: theme.colors.danger, borderColor: 'rgba(244,115,131,0.3)' }}>
                Remover
              </button>
            )}
          </div>
        </Row>
        <Row label="Nome">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={handleSaveName} style={btnSoft} disabled={saving || name === user?.name}>
              Salvar
            </button>
          </div>
        </Row>
        <Row label="Email">
          <input className="nx-input" defaultValue={user?.email} readOnly style={{ ...inputStyle, opacity: 0.7 }} />
        </Row>
        <Row label="Papel">
          <span style={{ fontSize: 13, color: theme.colors.text, textTransform: 'capitalize' }}>{user?.role}</span>
        </Row>
      </Section>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={logout} style={{
          ...btnSoft, color: theme.colors.danger,
          borderColor: 'rgba(244, 115, 131, 0.3)',
        }}>
          <Icon name="logout" size={13} stroke />
          Encerrar sessao
        </button>
      </div>
    </>
  )
}

function Section({ title, subtitle, children }) {
  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h3 className="display" style={{ fontSize: 18, color: theme.colors.text, margin: 0 }}>{title}</h3>
        {subtitle && <p style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 2 }}>{subtitle}</p>}
      </div>
      <div style={{ ...panelStyle, padding: '4px 24px', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  )
}

function Row({ label, hint, children }) {
  return (
    <div style={{
      padding: '18px 0',
      borderBottom: `1px solid ${theme.colors.borderSoft}`,
      display: 'grid', gridTemplateColumns: '180px 1fr', gap: 24, alignItems: 'start',
    }}>
      <div>
        <div style={{ fontSize: 13, color: theme.colors.text }}>{label}</div>
        {hint && <div style={{ fontSize: 11.5, color: theme.colors.textMuted, marginTop: 3, lineHeight: 1.4 }}>{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  )
}
