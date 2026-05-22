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
  pending: { label: 'Aguardando pagamento', color: theme.colors.warm, bg: theme.colors.warmMuted },
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
          { label: 'Aguardando pgto', value: stats.pendingSubs, color: theme.colors.warm },
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
          { id: 'plans', label: 'Planos' },
          { id: 'payments', label: 'Pagamentos', badge: stats.pendingPixPayments || 0 },
          { id: 'settings', label: 'Configuracoes' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '6px 16px', fontSize: 12.5, borderRadius: 6,
            color: tab === t.id ? theme.colors.text : theme.colors.textMuted,
            background: tab === t.id ? theme.colors.surfaceHover : 'transparent',
            fontWeight: tab === t.id ? 500 : 400, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {t.label}
            {t.badge > 0 && (
              <span style={{
                minWidth: 18, height: 18, borderRadius: 9,
                background: theme.colors.warm, color: theme.colors.bg,
                fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 5px',
              }}>
                {t.badge}
              </span>
            )}
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

      {/* Plans */}
      {tab === 'plans' && <PlansManagementPanel />}

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
                  {['Empresa', 'Valor', 'Metodo', 'Status', 'Data', ''].map(h => (
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
                    <td style={{ padding: '12px 14px', fontSize: 12, color: theme.colors.textMuted }}>
                      {p.payment_method === 'mercadopago' ? 'Mercado Pago' : p.payment_method === 'pix' ? 'PIX' : p.payment_method || 'manual'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        padding: '2px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                        background: p.status === 'approved' ? 'rgba(0,210,150,0.12)' : p.status === 'pending' ? 'rgba(255,183,77,0.12)' : 'rgba(244,115,131,0.12)',
                        color: p.status === 'approved' ? theme.colors.mint : p.status === 'pending' ? theme.colors.warm : theme.colors.danger,
                        fontFamily: theme.fonts.mono, textTransform: 'uppercase',
                      }}>
                        {p.status === 'approved' ? 'pago' : p.status === 'pending' ? 'aguardando' : p.status}
                      </span>
                    </td>
                    <td className="mono tnum" style={{ padding: '12px 14px', fontSize: 12, color: theme.colors.textMuted }}>
                      {p.paid_at ? new Date(p.paid_at).toLocaleDateString('pt-BR') : '---'}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      {p.status === 'pending' && (
                        <button
                          onClick={async () => {
                            if (!confirm(`Aprovar pagamento PIX de R$${parseFloat(p.amount).toFixed(2)} de ${p.company_name}?`)) return
                            try {
                              await api.admin.approvePayment(p.id)
                              loadData()
                            } catch (err) { alert(err.message) }
                          }}
                          style={{
                            background: 'rgba(0,210,150,0.12)', border: `1px solid rgba(0,210,150,0.3)`,
                            cursor: 'pointer',
                            color: theme.colors.mint, fontSize: 11, fontWeight: 600,
                            padding: '4px 10px',
                            borderRadius: 4,
                          }}
                          title="Aprovar pagamento"
                        >
                          Aprovar
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          if (!confirm('Excluir este registro de pagamento?')) return
                          try {
                            await api.admin.deletePayment(p.id)
                            loadData()
                          } catch (err) { alert(err.message) }
                        }}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: theme.colors.textFaint, fontSize: 11, padding: '4px 8px',
                          borderRadius: 4,
                        }}
                        title="Excluir pagamento"
                        onMouseOver={e => e.target.style.color = theme.colors.danger}
                        onMouseOut={e => e.target.style.color = theme.colors.textFaint}
                      >
                        <Icon name="trash" size={13} />
                      </button>
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
  const [plans, setPlans] = useState([])
  const [selectedPlanId, setSelectedPlanId] = useState(company.plan_id || '')

  useEffect(() => {
    api.admin.plans().then(setPlans).catch(console.error)
  }, [])

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

      {/* Change plan */}
      <div className="eyebrow">Plano</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <select
          value={selectedPlanId}
          onChange={e => setSelectedPlanId(parseInt(e.target.value))}
          style={{ ...inputStyle, flex: 1, fontSize: 13 }}
        >
          <option value="">Selecionar plano...</option>
          {plans.map(p => (
            <option key={p.id} value={p.id}>{p.name} — R${p.price.toFixed(2)}/mes</option>
          ))}
        </select>
        <button
          onClick={() => { if (selectedPlanId) onUpdateSub(company.id, { plan_id: selectedPlanId }) }}
          disabled={loading || !selectedPlanId || selectedPlanId === company.plan_id}
          style={{ ...btnPrimary, opacity: (loading || !selectedPlanId || selectedPlanId === company.plan_id) ? 0.4 : 1 }}
        >
          Alterar
        </button>
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
        {(company.sub_status === 'suspended' || company.sub_status === 'cancelled' || company.sub_status === 'pending') && (
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

function PlansManagementPanel() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null) // plan id being saved

  useEffect(() => { loadPlans() }, [])

  async function loadPlans() {
    try {
      const data = await api.admin.plans()
      setPlans(data)
    } catch (err) { console.error(err) } finally { setLoading(false) }
  }

  async function savePlan(plan) {
    setSaving(plan.id)
    try {
      await api.admin.updatePlan(plan.id, plan)
      loadPlans()
    } catch (err) { alert(err.message) } finally { setSaving(null) }
  }

  async function createPlan() {
    try {
      await api.admin.createPlan({
        name: 'Novo Plano',
        price: 0,
        type: 'Mensal (1 mes)',
        benefits: [],
        active: true,
        visible: true,
      })
      loadPlans()
    } catch (err) { alert(err.message) }
  }

  async function deletePlan(id) {
    if (!confirm('Tem certeza que deseja excluir este plano?')) return
    try {
      await api.admin.deletePlan(id)
      loadPlans()
    } catch (err) { alert(err.message) }
  }

  async function toggleFeatured(plan) {
    setSaving(plan.id)
    try {
      await api.admin.updatePlan(plan.id, { featured: !plan.featured })
      loadPlans()
    } catch (err) { alert(err.message) } finally { setSaving(null) }
  }

  function updateLocalPlan(id, updates) {
    setPlans(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p))
  }

  if (loading) return <div style={{ padding: 20, color: theme.colors.textMuted }}>Carregando...</div>

  const visibleCount = plans.filter(p => p.active && p.visible && p.price > 0).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: theme.colors.text }}>Planos Disponiveis</div>
          <div style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: theme.colors.warm }}>&#128161;</span>
            Planos desativados ou com preco R$0 ficam ocultos na home. Quando todos sao desativados, a secao de planos e removida completamente.
          </div>
        </div>
        <div style={{ fontSize: 12, color: theme.colors.textMuted }}>
          {visibleCount} visiveis na home
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(plans.length, 4)}, 1fr)`, gap: 14 }}>
        {plans.map(plan => (
          <PlanCard
            key={plan.id}
            plan={plan}
            saving={saving === plan.id}
            onSave={savePlan}
            onDelete={() => deletePlan(plan.id)}
            onToggleFeatured={() => toggleFeatured(plan)}
            onLocalUpdate={(updates) => updateLocalPlan(plan.id, updates)}
          />
        ))}
      </div>

      <button
        onClick={createPlan}
        style={{
          ...btnSoft,
          justifyContent: 'center', width: '100%', padding: '14px 20px',
          border: `2px dashed ${theme.colors.border}`, borderRadius: 12,
          fontSize: 14, fontWeight: 500, color: theme.colors.textMuted,
        }}
      >
        + Adicionar Plano
      </button>
    </div>
  )
}

function PlanCard({ plan, saving, onSave, onDelete, onToggleFeatured, onLocalUpdate }) {
  const [newBenefit, setNewBenefit] = useState('')

  const isVisible = plan.active && plan.visible && plan.price > 0

  function addBenefit() {
    if (!newBenefit.trim()) return
    const benefits = [...(plan.benefits || []), { text: newBenefit.trim(), included: true }]
    onLocalUpdate({ benefits })
    setNewBenefit('')
  }

  function removeBenefit(idx) {
    const benefits = (plan.benefits || []).filter((_, i) => i !== idx)
    onLocalUpdate({ benefits })
  }

  function toggleBenefitIncluded(idx) {
    const benefits = (plan.benefits || []).map((b, i) => i === idx ? { ...b, included: !b.included } : b)
    onLocalUpdate({ benefits })
  }

  return (
    <div style={{
      ...panelStyle,
      padding: 0,
      display: 'flex', flexDirection: 'column',
      border: plan.featured ? `2px solid ${theme.colors.warm}` : `1px solid ${theme.colors.border}`,
      position: 'relative',
    }}>
      {/* Top bar: visible indicator + active toggle + delete */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 14px',
        borderBottom: `1px solid ${theme.colors.border}`,
        background: theme.colors.bgSecondary,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
          color: isVisible ? theme.colors.mint : theme.colors.textFaint,
        }}>
          &#8226; {isVisible ? 'VISIVEL' : 'OCULTO'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10.5, color: theme.colors.textMuted }}>Ativo</span>
          <button
            onClick={() => onLocalUpdate({ active: !plan.active })}
            style={{
              width: 36, height: 20, borderRadius: 10, cursor: 'pointer', border: 'none',
              background: plan.active ? theme.colors.mint : theme.colors.bgSecondary,
              position: 'relative', transition: 'background 0.2s',
            }}
          >
            <div style={{
              width: 16, height: 16, borderRadius: 8, background: '#fff',
              position: 'absolute', top: 2, transition: 'left 0.2s',
              left: plan.active ? 18 : 2,
            }} />
          </button>
          <button
            onClick={onDelete}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: theme.colors.danger, fontSize: 16, padding: '2px 4px',
              lineHeight: 1,
            }}
            title="Excluir plano"
          >
            &#10005;
          </button>
        </div>
      </div>

      <div style={{ padding: '14px 14px 20px', display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
        {/* Featured button */}
        <button
          onClick={onToggleFeatured}
          style={{
            padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
            border: plan.featured ? `2px solid ${theme.colors.warm}` : `1px solid ${theme.colors.border}`,
            background: plan.featured ? theme.colors.warmMuted : 'transparent',
            color: plan.featured ? theme.colors.warm : theme.colors.textMuted,
            fontSize: 12, fontWeight: 600, textAlign: 'center',
            transition: 'all 0.15s',
          }}
        >
          {plan.featured ? '★ Mais escolhido' : '★ Marcar como mais escolhido'}
        </button>

        {/* Name + Type */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label className="eyebrow" style={{ display: 'block', marginBottom: 4, fontSize: 9.5 }}>Nome do Plano</label>
            <input
              value={plan.name}
              onChange={e => onLocalUpdate({ name: e.target.value })}
              style={{ ...inputStyle, width: '100%', fontSize: 12, fontWeight: 600, padding: '8px 10px' }}
            />
          </div>
          <div>
            <label className="eyebrow" style={{ display: 'block', marginBottom: 4, fontSize: 9.5 }}>Tipo</label>
            <input
              value={plan.type || 'Mensal (1 mes)'}
              onChange={e => onLocalUpdate({ type: e.target.value })}
              style={{ ...inputStyle, width: '100%', fontSize: 12, padding: '8px 10px' }}
            />
          </div>
        </div>

        {/* Price */}
        <div>
          <label className="eyebrow" style={{ display: 'block', marginBottom: 4, fontSize: 9.5 }}>Valor (R$ por mes)</label>
          <input
            type="number" step="0.01" min="0"
            value={plan.price}
            onChange={e => onLocalUpdate({ price: parseFloat(e.target.value) || 0 })}
            style={{ ...inputStyle, width: '100%', fontSize: 18, fontWeight: 700, padding: '8px 10px', color: theme.colors.primary }}
          />
        </div>

        {/* Advance payment discounts */}
        <div>
          <label className="eyebrow" style={{ display: 'block', marginBottom: 8, fontSize: 9.5 }}>
            Desconto por antecipacao
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { key: 'discount_3m', label: '3 meses', months: 3 },
              { key: 'discount_6m', label: '6 meses', months: 6 },
              { key: 'discount_12m', label: '12 meses', months: 12 },
            ].map(tier => {
              const discountPct = plan[tier.key] || 0
              const pricePerMonth = plan.price * (1 - discountPct / 100)
              const total = Math.round(pricePerMonth * tier.months * 100) / 100
              return (
                <div key={tier.key} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px', borderRadius: 8,
                  background: theme.colors.bg, border: `1px solid ${theme.colors.border}`,
                }}>
                  <span style={{ fontSize: 11, color: theme.colors.textMuted, width: 55, flexShrink: 0 }}>{tier.label}</span>
                  <input
                    type="number" min="0" max="50" step="1"
                    value={discountPct}
                    onChange={e => onLocalUpdate({ [tier.key]: Math.max(0, Math.min(50, parseFloat(e.target.value) || 0)) })}
                    style={{ ...inputStyle, width: 48, textAlign: 'center', fontSize: 13, fontWeight: 600, padding: '4px 6px' }}
                  />
                  <span style={{ fontSize: 12, color: theme.colors.textMuted, fontWeight: 600 }}>%</span>
                  {discountPct > 0 && plan.price > 0 && (
                    <span style={{ fontSize: 10, color: theme.colors.mint, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                      R${total.toFixed(2)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Benefits */}
        <div>
          <label className="eyebrow" style={{ display: 'block', marginBottom: 8, fontSize: 9.5 }}>Beneficios</label>

          {/* Inline input to add benefit */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              value={newBenefit}
              onChange={e => setNewBenefit(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBenefit() } }}
              placeholder="Digite o beneficio..."
              style={{ ...inputStyle, flex: 1, fontSize: 12, padding: '6px 10px' }}
            />
            <button
              onClick={addBenefit}
              disabled={!newBenefit.trim()}
              style={{
                ...btnSoft, padding: '6px 12px', fontSize: 11,
                opacity: newBenefit.trim() ? 1 : 0.4,
                cursor: newBenefit.trim() ? 'pointer' : 'default',
              }}
            >
              +
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {(plan.benefits || []).map((b, idx) => (
              <div key={idx} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px', borderRadius: 6,
                fontSize: 12, color: theme.colors.textSecondary,
              }}
                className="row-hover"
              >
                <button
                  onClick={() => toggleBenefitIncluded(idx)}
                  style={{
                    width: 18, height: 18, borderRadius: 4, border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                    background: b.included ? 'rgba(0,210,150,0.15)' : 'rgba(244,115,131,0.15)',
                    color: b.included ? theme.colors.mint : theme.colors.danger,
                  }}
                >
                  {b.included ? '✓' : '✕'}
                </button>
                <span style={{
                  flex: 1, fontSize: 12,
                  color: b.included ? theme.colors.textSecondary : theme.colors.textFaint,
                  textDecoration: b.included ? 'none' : 'none',
                }}>
                  {b.text}
                </span>
                <button
                  onClick={() => removeBenefit(idx)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: theme.colors.textFaint, fontSize: 13, padding: '2px',
                    lineHeight: 1, opacity: 0.5,
                  }}
                >
                  &#10005;
                </button>
              </div>
            ))}
            {(!plan.benefits || plan.benefits.length === 0) && (
              <div style={{ fontSize: 11, color: theme.colors.textFaint, textAlign: 'center', padding: 10 }}>
                Nenhum beneficio adicionado
              </div>
            )}
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={() => onSave(plan)}
          disabled={saving}
          style={{
            ...btnPrimary,
            justifyContent: 'center', width: '100%',
            marginTop: 'auto', padding: '10px 16px',
            opacity: saving ? 0.6 : 1,
          }}
        >
          <Icon name="check" size={13} />
          {saving ? 'Salvando...' : 'Salvar plano'}
        </button>
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
  const [pixKey, setPixKey] = useState('')
  const [pixHolder, setPixHolder] = useState('')
  const [pixType, setPixType] = useState('cpf')
  useEffect(() => { loadSettings() }, [])

  async function loadSettings() {
    try {
      const data = await api.admin.getSettings()
      setSettings(data)
      setMpToken(data.mp_access_token?.hasValue ? data.mp_access_token.value : '')
      setAppUrl(data.app_url?.value || 'https://reinonexusideal.com.br')
      setPixKey(data.pix_key?.value || '')
      setPixHolder(data.pix_holder?.value || '')
      setPixType(data.pix_type?.value || 'cpf')
    } catch (err) { console.error(err) } finally { setLoading(false) }
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      const updates = {}
      if (mpToken && !/^\*+/.test(mpToken)) {
        updates.mp_access_token = mpToken
      }
      if (appUrl) updates.app_url = appUrl
      updates.pix_key = pixKey
      updates.pix_holder = pixHolder
      updates.pix_type = pixType

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

        {/* Divider */}
        <div style={{ height: 1, background: theme.colors.border, margin: '20px 0' }} />

        {/* PIX Settings */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: '#32BCAD', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 800, color: '#fff',
          }}>PIX</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: theme.colors.text }}>PIX</div>
            <div style={{ fontSize: 12, color: theme.colors.textMuted }}>Pagamento direto via PIX com aprovacao manual</div>
          </div>
          {pixKey && (
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
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
            <div>
              <label className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>Tipo de chave</label>
              <select
                value={pixType}
                onChange={e => setPixType(e.target.value)}
                style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}
              >
                <option value="cpf">CPF</option>
                <option value="cnpj">CNPJ</option>
                <option value="email">Email</option>
                <option value="telefone">Telefone</option>
                <option value="aleatoria">Aleatoria</option>
              </select>
            </div>
            <div>
              <label className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>Chave PIX</label>
              <input
                type="text"
                value={pixKey}
                onChange={e => setPixKey(e.target.value)}
                placeholder={pixType === 'cpf' ? '000.000.000-00' : pixType === 'email' ? 'email@exemplo.com' : pixType === 'telefone' ? '+5511999999999' : 'Chave PIX'}
                style={{ ...inputStyle, width: '100%', fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>
          </div>
          <div>
            <label className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>Nome do titular</label>
            <input
              type="text"
              value={pixHolder}
              onChange={e => setPixHolder(e.target.value)}
              placeholder="Nome completo do titular da conta"
              style={{ ...inputStyle, width: '100%', fontSize: 12 }}
            />
            <div style={{ fontSize: 11, color: theme.colors.textFaint, marginTop: 6 }}>
              Nome que aparecera para o gestor na hora de realizar o PIX.
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

      {/* Info: discounts moved to plans */}
      <div style={{ ...panelStyle, padding: 16, background: theme.colors.bgSecondary }}>
        <div style={{ fontSize: 12, color: theme.colors.textMuted, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>&#128161;</span>
          <span>Os descontos por antecipacao agora sao configurados individualmente em cada plano na aba <strong style={{ color: theme.colors.primary }}>"Planos"</strong>.</span>
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
          {(appUrl || 'https://reinonexusideal.com.br').replace(/\/audiovisual\/?$/, '')}/audiovisual/api/payment/webhook
        </div>
        <div style={{ fontSize: 11, color: theme.colors.textFaint, marginTop: 8 }}>
          No Mercado Pago: Suas integracoes → Notificacoes IPN → URL de notificacao
        </div>
      </div>
    </div>
  )
}
