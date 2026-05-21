// src/pages/AdminDashboard.jsx — painel do super admin
import { useState, useEffect } from 'react'
import api from '../api'
import theme from '../styles/theme'
import Modal from '../components/Modal'
import {
  Icon, Avatar, Spinner, Badge,
  panelStyle, fmtBRL, btnPrimary, btnSoft, btnDanger, inputStyle, Field,
} from '../components/ui'

const SUB_STATUS = {
  trial: { label: 'Trial', color: theme.colors.warm, bg: theme.colors.warmMuted },
  active: { label: 'Ativo', color: theme.colors.mint, bg: 'rgba(0,210,150,0.12)' },
  past_due: { label: 'Vencido', color: theme.colors.danger, bg: theme.colors.dangerMuted },
  cancelled: { label: 'Cancelado', color: theme.colors.textMuted, bg: theme.colors.bgSecondary },
  suspended: { label: 'Suspenso', color: theme.colors.danger, bg: theme.colors.dangerMuted },
}

export default function AdminDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [companies, setCompanies] = useState([])
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const [d, c] = await Promise.all([
        api.admin.dashboard(),
        api.admin.companies(),
      ])
      setData(d)
      setCompanies(c)
    } catch (err) { console.error(err) } finally { setLoading(false) }
  }

  async function updateSub(companyId, updates) {
    setActionLoading(true)
    try {
      await api.admin.updateSubscription(companyId, updates)
      loadData()
      setSelectedCompany(null)
    } catch (err) { alert(err.message) } finally { setActionLoading(false) }
  }

  async function recordPayment(companyId, amount) {
    setActionLoading(true)
    try {
      await api.admin.recordPayment({ company_id: companyId, amount, payment_method: 'manual' })
      loadData()
      setSelectedCompany(null)
    } catch (err) { alert(err.message) } finally { setActionLoading(false) }
  }

  async function deleteCompany(companyId, companyName) {
    setActionLoading(true)
    try {
      await api.admin.deleteCompany(companyId)
      setSelectedCompany(null)
      loadData()
    } catch (err) { alert(err.message) } finally { setActionLoading(false) }
  }

  if (loading) return <Spinner />
  const stats = data?.stats || {}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>admin</div>
        <h2 className="display" style={{ fontSize: 36, color: theme.colors.text, margin: 0 }}>
          Painel de controle
        </h2>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {[
          { label: 'Empresas', value: stats.totalCompanies, color: theme.colors.primary },
          { label: 'Assinaturas ativas', value: stats.activeSubs, color: theme.colors.mint },
          { label: 'Em trial', value: stats.trialSubs, color: theme.colors.warm },
          { label: 'MRR', value: fmtBRL(stats.mrr), color: theme.colors.mint, isCurrency: true },
        ].map((m, i) => (
          <div key={i} style={{ ...panelStyle, padding: 20 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>{m.label}</div>
            <div className="display tnum" style={{ fontSize: m.isCurrency ? 26 : 36, lineHeight: 1, color: m.color }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Secondary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {[
          { label: 'Total usuarios', value: stats.totalUsers },
          { label: 'Gestores', value: stats.totalGestors },
          { label: 'Pedidos totais', value: stats.totalOrders },
          { label: 'Cancelados', value: stats.cancelledSubs, color: theme.colors.danger },
        ].map((m, i) => (
          <div key={i} style={{ ...panelStyle, padding: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{m.label}</div>
            <div className="display tnum" style={{ fontSize: 24, lineHeight: 1, color: m.color || theme.colors.text }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: 2, background: theme.colors.bgSecondary, border: `1px solid ${theme.colors.border}`, borderRadius: 8, width: 'fit-content' }}>
        {[
          { id: 'overview', label: 'Empresas' },
          { id: 'payments', label: 'Pagamentos' },
          { id: 'settings', label: 'Configuracoes' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '6px 16px', fontSize: 12.5, borderRadius: 6,
            color: tab === t.id ? theme.colors.text : theme.colors.textMuted,
            background: tab === t.id ? theme.colors.surfaceHover : 'transparent',
            fontWeight: tab === t.id ? 500 : 400, cursor: 'pointer',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Companies table */}
      {tab === 'overview' && (
        <div style={{ ...panelStyle, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: theme.colors.bgSecondary }}>
                {['Empresa', 'Gestor', 'Status', 'Pedidos', 'Editores', 'Clientes', 'Plano', 'Acoes'].map(h => (
                  <th key={h} className="eyebrow" style={{
                    padding: '12px 14px', textAlign: 'left',
                    borderBottom: `1px solid ${theme.colors.border}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {companies.map(c => {
                const st = SUB_STATUS[c.sub_status] || { label: 'Sem assinatura', color: theme.colors.textFaint, bg: theme.colors.bgSecondary }
                const trialDays = c.trial_ends_at ? Math.max(0, Math.ceil((new Date(c.trial_ends_at) - Date.now()) / 86400000)) : null
                return (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${theme.colors.borderSoft}` }}
                    className="row-hover">
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={c.name} size={28} src={c.logo || undefined} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: theme.colors.text }}>{c.name}</div>
                          <div style={{ fontSize: 10.5, color: theme.colors.textFaint }}>
                            {new Date(c.created_at).toLocaleDateString('pt-BR')}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 12.5, color: theme.colors.textMuted }}>
                      {c.gestor_name || '---'}
                      {c.gestor_email && <div style={{ fontSize: 10.5, color: theme.colors.textFaint }}>{c.gestor_email}</div>}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                        background: st.bg, color: st.color,
                        fontFamily: theme.fonts.mono, textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>
                        {st.label}
                      </span>
                      {c.sub_status === 'trial' && trialDays !== null && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: theme.colors.textFaint }}>{trialDays}d</span>
                      )}
                    </td>
                    <td className="mono tnum" style={{ padding: '12px 14px', fontSize: 13 }}>{c.order_count}</td>
                    <td className="mono tnum" style={{ padding: '12px 14px', fontSize: 13 }}>{c.editor_count}</td>
                    <td className="mono tnum" style={{ padding: '12px 14px', fontSize: 13 }}>{c.client_count}</td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: theme.colors.textMuted }}>{c.plan_name || '---'}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <button
                        onClick={() => setSelectedCompany(c)}
                        style={{ ...btnSoft, padding: '5px 10px', fontSize: 11 }}
                      >
                        Gerenciar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Payments */}
      {tab === 'payments' && (
        <div style={{ ...panelStyle, overflow: 'hidden' }}>
          {data?.recentPayments?.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: theme.colors.textMuted, fontSize: 13 }}>
              Nenhum pagamento registrado ainda.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: theme.colors.bgSecondary }}>
                  {['Empresa', 'Valor', 'Metodo', 'Status', 'Data'].map(h => (
                    <th key={h} className="eyebrow" style={{
                      padding: '12px 14px', textAlign: 'left',
                      borderBottom: `1px solid ${theme.colors.border}`,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.recentPayments || []).map(p => (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${theme.colors.borderSoft}` }}>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: theme.colors.text }}>{p.company_name}</td>
                    <td className="mono tnum" style={{ padding: '12px 14px', fontSize: 13, color: theme.colors.mint, fontWeight: 500 }}>
                      {fmtBRL(p.amount)}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: theme.colors.textMuted }}>{p.payment_method}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        padding: '2px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                        background: p.status === 'approved' ? 'rgba(0,210,150,0.12)' : 'rgba(255,183,77,0.12)',
                        color: p.status === 'approved' ? theme.colors.mint : theme.colors.warm,
                        fontFamily: theme.fonts.mono, textTransform: 'uppercase',
                      }}>
                        {p.status === 'approved' ? 'pago' : p.status}
                      </span>
                    </td>
                    <td className="mono tnum" style={{ padding: '12px 14px', fontSize: 12, color: theme.colors.textMuted }}>
                      {p.paid_at ? new Date(p.paid_at).toLocaleDateString('pt-BR') : '---'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Platform settings */}
      {tab === 'settings' && <PlatformSettingsPanel />}

      {/* Company management modal */}
      <Modal open={!!selectedCompany} onClose={() => setSelectedCompany(null)} title={`Gerenciar: ${selectedCompany?.name}`} width={520}>
        {selectedCompany && (
          <CompanyManagePanel
            company={selectedCompany}
            onUpdateSub={updateSub}
            onRecordPayment={recordPayment}
            onDeleteCompany={deleteCompany}
            loading={actionLoading}
          />
        )}
      </Modal>
    </div>
  )
}

function CompanyManagePanel({ company, onUpdateSub, onRecordPayment, onDeleteCompany, loading }) {
  const st = SUB_STATUS[company.sub_status] || { label: 'Sem assinatura', color: theme.colors.textFaint }
  const [paymentAmount, setPaymentAmount] = useState(company.plan_price || '')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ padding: 14, background: theme.colors.bg, borderRadius: 8, border: `1px solid ${theme.colors.border}` }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Gestor</div>
          <div style={{ fontSize: 13, color: theme.colors.text }}>{company.gestor_name || '---'}</div>
          <div style={{ fontSize: 11, color: theme.colors.textFaint }}>{company.gestor_email}</div>
        </div>
        <div style={{ padding: 14, background: theme.colors.bg, borderRadius: 8, border: `1px solid ${theme.colors.border}` }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Status</div>
          <span style={{ color: st.color, fontSize: 14, fontWeight: 600 }}>{st.label}</span>
          {company.sub_status === 'trial' && company.trial_ends_at && (
            <div style={{ fontSize: 11, color: theme.colors.textFaint, marginTop: 2 }}>
              Expira em {new Date(company.trial_ends_at).toLocaleDateString('pt-BR')}
            </div>
          )}
          {company.current_period_end && (
            <div style={{ fontSize: 11, color: theme.colors.textFaint, marginTop: 2 }}>
              Periodo ate {new Date(company.current_period_end).toLocaleDateString('pt-BR')}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <div style={{ textAlign: 'center', padding: 12, background: theme.colors.bg, borderRadius: 8, border: `1px solid ${theme.colors.border}` }}>
          <div className="display tnum" style={{ fontSize: 22, color: theme.colors.text }}>{company.order_count}</div>
          <div className="eyebrow" style={{ marginTop: 4 }}>pedidos</div>
        </div>
        <div style={{ textAlign: 'center', padding: 12, background: theme.colors.bg, borderRadius: 8, border: `1px solid ${theme.colors.border}` }}>
          <div className="display tnum" style={{ fontSize: 22, color: theme.colors.text }}>{company.editor_count}</div>
          <div className="eyebrow" style={{ marginTop: 4 }}>editores</div>
        </div>
        <div style={{ textAlign: 'center', padding: 12, background: theme.colors.bg, borderRadius: 8, border: `1px solid ${theme.colors.border}` }}>
          <div className="display tnum" style={{ fontSize: 22, color: theme.colors.text }}>{company.client_count}</div>
          <div className="eyebrow" style={{ marginTop: 4 }}>clientes</div>
        </div>
      </div>

      {/* Actions */}
      <div className="eyebrow">Acoes rapidas</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {company.sub_status !== 'active' && (
          <button
            onClick={() => onUpdateSub(company.id, { status: 'active' })}
            disabled={loading}
            style={{ ...btnPrimary, justifyContent: 'center', width: '100%', opacity: loading ? 0.5 : 1 }}
          >
            <Icon name="check" size={14} />
            Ativar assinatura (30 dias)
          </button>
        )}
        {company.sub_status === 'active' && (
          <button
            onClick={() => onUpdateSub(company.id, { status: 'suspended' })}
            disabled={loading}
            style={{ ...btnDanger, justifyContent: 'center', width: '100%', opacity: loading ? 0.5 : 1 }}
          >
            Suspender conta
          </button>
        )}
        {(company.sub_status === 'suspended' || company.sub_status === 'cancelled') && (
          <button
            onClick={() => onUpdateSub(company.id, { status: 'active' })}
            disabled={loading}
            style={{ ...btnPrimary, justifyContent: 'center', width: '100%', background: theme.colors.mint, opacity: loading ? 0.5 : 1 }}
          >
            Reativar conta
          </button>
        )}
      </div>

      {/* Record payment */}
      <div className="eyebrow">Registrar pagamento</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="number" step="0.01" min="0"
          value={paymentAmount}
          onChange={e => setPaymentAmount(e.target.value)}
          placeholder="Valor R$"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          onClick={() => {
            if (!paymentAmount || paymentAmount <= 0) return
            onRecordPayment(company.id, parseFloat(paymentAmount))
          }}
          disabled={loading || !paymentAmount}
          style={{ ...btnPrimary, opacity: loading ? 0.5 : 1 }}
        >
          <Icon name="check" size={13} />
          Registrar
        </button>
      </div>
      <div style={{ fontSize: 11, color: theme.colors.textFaint, marginTop: -12 }}>
        Ao registrar o pagamento, a assinatura e ativada por mais 30 dias automaticamente.
      </div>

      {/* Delete zone */}
      <div style={{
        marginTop: 12, paddingTop: 20,
        borderTop: `1px solid ${theme.colors.border}`,
      }}>
        <div className="eyebrow" style={{ marginBottom: 10, color: theme.colors.danger }}>Zona de perigo</div>
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            style={{
              ...btnDanger,
              justifyContent: 'center', width: '100%',
              background: 'transparent',
              border: `1px solid ${theme.colors.danger}`,
              color: theme.colors.danger,
            }}
          >
            <Icon name="trash" size={13} />
            Excluir empresa permanentemente
          </button>
        ) : (
          <div style={{
            padding: 16, borderRadius: 10,
            background: theme.colors.dangerMuted,
            border: `1px solid rgba(244, 115, 131, 0.3)`,
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ fontSize: 13, color: theme.colors.danger, fontWeight: 600 }}>
              Tem certeza absoluta?
            </div>
            <div style={{ fontSize: 12, color: theme.colors.textSecondary, lineHeight: 1.5 }}>
              Esta acao vai excluir <strong>permanentemente</strong> a empresa <strong>{company.name}</strong> e todos os seus dados:
              usuarios, clientes, pedidos, comentarios, financeiro, arquivos, assinatura e historico.
              <br /><br />
              Digite <strong style={{ color: theme.colors.danger }}>{company.name}</strong> para confirmar:
            </div>
            <input
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder={`Digite "${company.name}" para confirmar`}
              style={{
                ...inputStyle,
                borderColor: 'rgba(244, 115, 131, 0.4)',
                fontSize: 13,
              }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText('') }}
                style={{ ...btnSoft, flex: 1, justifyContent: 'center' }}
              >
                Cancelar
              </button>
              <button
                onClick={() => onDeleteCompany(company.id, company.name)}
                disabled={loading || deleteConfirmText !== company.name}
                style={{
                  ...btnDanger,
                  flex: 1, justifyContent: 'center',
                  opacity: (loading || deleteConfirmText !== company.name) ? 0.4 : 1,
                  cursor: (loading || deleteConfirmText !== company.name) ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Excluindo...' : 'Excluir definitivamente'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PlatformSettingsPanel() {
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [mpToken, setMpToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [appUrl, setAppUrl] = useState('')

  useEffect(() => { loadSettings() }, [])

  async function loadSettings() {
    try {
      const data = await api.admin.getSettings()
      setSettings(data)
      setMpToken(data.mp_access_token?.hasValue ? data.mp_access_token.value : '')
      setAppUrl(data.app_url?.value || 'https://reinonexusideal.com.br')
    } catch (err) { console.error(err) } finally { setLoading(false) }
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      const updates = {}
      // Only send token if it's not the masked version
      if (mpToken && !/^\*+/.test(mpToken)) {
        updates.mp_access_token = mpToken
      }
      if (appUrl) updates.app_url = appUrl

      await api.admin.updateSettings(updates)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      loadSettings()
    } catch (err) { alert(err.message) } finally { setSaving(false) }
  }

  if (loading) return <div style={{ padding: 20, color: theme.colors.textMuted }}>Carregando...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 700 }}>
      <div style={{ ...panelStyle, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: '#009ee3', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, color: '#fff',
          }}>MP</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: theme.colors.text }}>Mercado Pago</div>
            <div style={{ fontSize: 12, color: theme.colors.textMuted }}>Integracão para cobranças de assinatura</div>
          </div>
          {settings.mp_access_token?.hasValue && (
            <span style={{
              marginLeft: 'auto',
              padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600,
              background: 'rgba(0,210,150,0.12)', color: theme.colors.mint,
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              Configurado
            </span>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>Access Token (Producão)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type={showToken ? 'text' : 'password'}
                  value={mpToken}
                  onChange={e => setMpToken(e.target.value)}
                  placeholder="APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  style={{ ...inputStyle, width: '100%', paddingRight: 40, fontFamily: 'monospace', fontSize: 12 }}
                />
                <button
                  onClick={() => setShowToken(!showToken)}
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: theme.colors.textMuted, fontSize: 11, padding: '4px 6px',
                  }}
                >
                  {showToken ? 'ocultar' : 'ver'}
                </button>
              </div>
            </div>
            <div style={{ fontSize: 11, color: theme.colors.textFaint, marginTop: 6, lineHeight: 1.4 }}>
              Token de producão do Mercado Pago (APP_USR-...). Encontre em:{' '}
              <span style={{ color: theme.colors.primary }}>mercadopago.com.br/developers → Suas integracoes → Credenciais de producão</span>
            </div>
          </div>

          <div>
            <label className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>URL da Plataforma</label>
            <input
              type="text"
              value={appUrl}
              onChange={e => setAppUrl(e.target.value)}
              placeholder="https://reinonexusideal.com.br"
              style={{ ...inputStyle, width: '100%', fontFamily: 'monospace', fontSize: 12 }}
            />
            <div style={{ fontSize: 11, color: theme.colors.textFaint, marginTop: 6 }}>
              URL base para redirecionamento apos pagamento e webhooks.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              ...btnPrimary,
              opacity: saving ? 0.6 : 1,
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            <Icon name="check" size={13} />
            {saving ? 'Salvando...' : 'Salvar configuracoes'}
          </button>
          {saved && (
            <span style={{ fontSize: 12, color: theme.colors.mint, fontWeight: 500 }}>
              Configuracoes salvas com sucesso!
            </span>
          )}
        </div>
      </div>

      {/* Webhook info */}
      <div style={{ ...panelStyle, padding: 20 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Webhook (IPN)</div>
        <div style={{ fontSize: 13, color: theme.colors.textSecondary, lineHeight: 1.6 }}>
          Configure este URL de notificacao no painel do Mercado Pago para receber confirmacoes de pagamento automaticamente:
        </div>
        <div style={{
          marginTop: 10, padding: '10px 14px', borderRadius: 8,
          background: theme.colors.bg, border: `1px solid ${theme.colors.border}`,
          fontFamily: 'monospace', fontSize: 12, color: theme.colors.primary,
          wordBreak: 'break-all',
        }}>
          {appUrl || 'https://reinonexusideal.com.br'}/audiovisual/api/payment/webhook
        </div>
        <div style={{ fontSize: 11, color: theme.colors.textFaint, marginTop: 8 }}>
          No Mercado Pago: Suas integracoes → Notificacoes IPN → URL de notificacao
        </div>
      </div>
    </div>
  )
}
