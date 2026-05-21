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
  const [tab, setTab] = useState(visibleTabs[0]?.id || 'account')

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
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [paymentMsg, setPaymentMsg] = useState('')

  useEffect(() => {
    loadStatus()
    // Check URL for payment result
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '')
    if (params.get('payment') === 'success') {
      setPaymentMsg('Pagamento aprovado! Sua assinatura foi ativada.')
      // Clean URL
      window.history.replaceState(null, '', window.location.pathname + window.location.hash.split('?')[0])
      setTimeout(() => loadStatus(), 2000)
    } else if (params.get('payment') === 'failure') {
      setPaymentMsg('Pagamento nao foi concluido. Tente novamente.')
      window.history.replaceState(null, '', window.location.pathname + window.location.hash.split('?')[0])
    } else if (params.get('payment') === 'pending') {
      setPaymentMsg('Pagamento pendente. Aguarde a confirmacao.')
      window.history.replaceState(null, '', window.location.pathname + window.location.hash.split('?')[0])
    }
  }, [])

  async function loadStatus() {
    try {
      const d = await api.payment.status()
      setData(d)
    } catch (err) { console.error(err) } finally { setLoading(false) }
  }

  async function handlePay() {
    setPaying(true)
    setPaymentMsg('')
    try {
      const pref = await api.payment.createPreference()
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

  const sub = data?.subscription || {}
  const isActive = sub.status === 'active'
  const isTrial = sub.status === 'trial'
  const trialDays = isTrial && sub.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(sub.trial_ends_at) - Date.now()) / 86400000))
    : null
  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString('pt-BR') : null

  const STATUS_MAP = {
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
          background: paymentMsg.includes('aprovado') || paymentMsg.includes('ativada')
            ? 'rgba(0,210,150,0.12)' : paymentMsg.includes('pendente')
            ? theme.colors.warmMuted : theme.colors.dangerMuted,
          border: `1px solid ${paymentMsg.includes('aprovado') || paymentMsg.includes('ativada')
            ? 'rgba(0,210,150,0.3)' : paymentMsg.includes('pendente')
            ? 'rgba(255,138,107,0.3)' : 'rgba(244,115,131,0.3)'}`,
          color: paymentMsg.includes('aprovado') || paymentMsg.includes('ativada')
            ? theme.colors.mint : paymentMsg.includes('pendente')
            ? theme.colors.warm : theme.colors.danger,
          fontSize: 13, fontWeight: 500,
        }}>
          {paymentMsg}
        </div>
      )}

      {/* Current plan */}
      <div style={{ ...panelStyle, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Seu plano</div>
            <div className="display" style={{ fontSize: 24, color: theme.colors.text }}>{sub.plan_name || 'Profissional'}</div>
          </div>
          <span style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            background: st.bg, color: st.color,
            fontFamily: theme.fonts?.mono, textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            {st.label}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
          <div style={{ padding: 14, background: theme.colors.bg, borderRadius: 8, border: `1px solid ${theme.colors.border}` }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Valor mensal</div>
            <div className="display tnum" style={{ fontSize: 22, color: theme.colors.primary }}>
              R${(sub.plan_price || 97).toFixed(0)}
            </div>
          </div>
          <div style={{ padding: 14, background: theme.colors.bg, borderRadius: 8, border: `1px solid ${theme.colors.border}` }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              {isTrial ? 'Trial expira em' : 'Proximo vencimento'}
            </div>
            <div className="display tnum" style={{ fontSize: 16, color: theme.colors.text }}>
              {isTrial && trialDays !== null ? `${trialDays} dias` : periodEnd || '---'}
            </div>
          </div>
          <div style={{ padding: 14, background: theme.colors.bg, borderRadius: 8, border: `1px solid ${theme.colors.border}` }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Metodo</div>
            <div style={{ fontSize: 14, color: theme.colors.text, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="financial" size={14} color={theme.colors.primary} />
              Mercado Pago
            </div>
          </div>
        </div>

        {/* Pay button */}
        {!isActive && data?.mpConfigured && (
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
            {paying ? 'Redirecionando...' : `Pagar R$${(sub.plan_price || 97).toFixed(0)} via Mercado Pago`}
          </button>
        )}

        {isActive && (
          <div style={{
            padding: '12px 16px', borderRadius: 10,
            background: 'rgba(0,210,150,0.08)',
            border: '1px solid rgba(0,210,150,0.2)',
            color: theme.colors.mint, fontSize: 13, fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Icon name="check" size={14} />
            Sua assinatura esta ativa ate {periodEnd}.
          </div>
        )}

        {!data?.mpConfigured && !isActive && (
          <div style={{
            padding: '12px 16px', borderRadius: 10,
            background: theme.colors.warmMuted,
            border: '1px solid rgba(255,138,107,0.3)',
            color: theme.colors.warm, fontSize: 13,
          }}>
            Pagamento via Mercado Pago sera ativado em breve. Entre em contato com o suporte.
          </div>
        )}
      </div>

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
                      {p.payment_method === 'mercadopago' ? 'Mercado Pago' : p.payment_method || 'manual'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        padding: '2px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                        background: p.status === 'approved' ? 'rgba(0,210,150,0.12)' : 'rgba(255,183,77,0.12)',
                        color: p.status === 'approved' ? theme.colors.mint : theme.colors.warm,
                        textTransform: 'uppercase',
                      }}>
                        {p.status === 'approved' ? 'pago' : p.status}
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
