// src/pages/ClientDashboard.jsx — visao do cliente: kanban read-only + tabela + financeiro + portal de solicitacao
import { useState, useEffect } from 'react'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import theme from '../styles/theme'
import Modal from '../components/Modal'
import VideoPlayer from '../components/VideoPlayer'
import OrderComments from '../components/OrderComments'
import {
  Icon, Avatar, Spinner, Badge, Field,
  inputStyle, btnPrimary, btnGhost, btnSoft,
  panelStyle, PRIORITY, fmtBRL, daysUntil,
} from '../components/ui'

export default function ClientDashboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('map')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [financial, setFinancial] = useState(null)
  const [financialLoading, setFinancialLoading] = useState(false)
  const [expandedInvoice, setExpandedInvoice] = useState(null)
  const [invoiceItems, setInvoiceItems] = useState({})
  const [contract, setContract] = useState(null)
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [requestForm, setRequestForm] = useState({
    title: '', description: '', briefing: '', video_type: '', duration: '', format: '', references: '',
  })
  const [submittingRequest, setSubmittingRequest] = useState(false)
  const [entryProofModal, setEntryProofModal] = useState(null)
  const [entryProofUrl, setEntryProofUrl] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [d, c] = await Promise.all([
          api.clientPortal.getProjects(),
          api.clientPortal.getContract().catch(() => null),
        ])
        setData(d)
        setContract(c)
      } catch (err) { console.error(err) } finally { setLoading(false) }
    }
    load()
  }, [])

  async function loadFinancial() {
    if (financial) return
    setFinancialLoading(true)
    try {
      const d = await api.clientPortal.getFinancial()
      setFinancial(d)
    } catch (err) { console.error(err) } finally { setFinancialLoading(false) }
  }

  async function handlePayClientEntry(entryId) {
    try {
      await api.clientPortal.payEntry(entryId, { proof_url: entryProofUrl || null })
      setEntryProofModal(null); setEntryProofUrl('')
      // Refresh financial data
      const d = await api.clientPortal.getFinancial()
      setFinancial(d)
    } catch (err) { alert(err.message) }
  }

  async function toggleInvoice(invoiceId) {
    if (expandedInvoice === invoiceId) {
      setExpandedInvoice(null)
      return
    }
    setExpandedInvoice(invoiceId)
    if (!invoiceItems[invoiceId]) {
      try {
        const d = await api.clientPortal.getInvoiceItems(invoiceId)
        setInvoiceItems(prev => ({ ...prev, [invoiceId]: d }))
      } catch (err) { console.error(err) }
    }
  }

  async function handleSubmitRequest(e) {
    e.preventDefault()
    if (!requestForm.title.trim()) return
    setSubmittingRequest(true)
    try {
      await api.clientPortal.createOrder({
        title: requestForm.title,
        description: requestForm.description,
        briefing: requestForm.briefing,
        video_type: requestForm.video_type,
        duration: requestForm.duration,
        format: requestForm.format,
        references_json: requestForm.references ? JSON.stringify(requestForm.references.split('\n').filter(Boolean)) : '[]',
      })
      setRequestForm({ title: '', description: '', briefing: '', video_type: '', duration: '', format: '', references: '' })
      setShowRequestForm(false)
      // Reload data
      const d = await api.clientPortal.getProjects()
      setData(d)
      const c = await api.clientPortal.getContract().catch(() => null)
      setContract(c)
    } catch (err) { alert(err.message) } finally { setSubmittingRequest(false) }
  }

  if (loading) return <Spinner />

  const orders = data?.orders || []
  const columns = data?.columns || []
  const stats = data?.stats || {}

  function sortByDueDate(list) {
    return [...list].sort((a, b) => {
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      if (a.due_date && !b.due_date) return -1
      if (!a.due_date && b.due_date) return 1
      return 0
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Hello */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>seus pedidos</div>
        <h2 className="display" style={{ fontSize: 40, lineHeight: 1.05, letterSpacing: '-0.02em', color: theme.colors.text, margin: 0 }}>
          Ola, {user?.name?.split(' ')[0]}.
          {orders.length > 0 && (
            <span className="display-italic" style={{ color: theme.colors.textMuted }}>
              {' '}{orders.length} pedido{orders.length !== 1 ? 's' : ''} em curso.
            </span>
          )}
        </h2>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {[
          { label: 'Total', value: stats.total || 0, color: theme.colors.primary },
          { label: 'Em andamento', value: stats.inProgress || 0, color: theme.colors.warm },
          { label: 'Concluidos', value: stats.completed || 0, color: theme.colors.mint },
          { label: 'Aprovados', value: stats.approved || 0, color: theme.colors.gold },
        ].map((m, i) => (
          <div key={i} style={{ ...panelStyle, padding: 20 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>{m.label}</div>
            <div className="display tnum" style={{ fontSize: 36, lineHeight: 1, color: theme.colors.text }}>{m.value}</div>
            <div style={{ height: 3, marginTop: 14, background: theme.colors.bg, borderRadius: 2 }}>
              <div style={{ height: '100%', width: m.value > 0 ? '50%' : 0, background: m.color, borderRadius: 2, opacity: 0.6 }} />
            </div>
          </div>
        ))}
      </div>

      {orders.length === 0 ? (
        <div style={{ ...panelStyle, textAlign: 'center', padding: 60 }}>
          <h3 className="display" style={{ fontSize: 22, color: theme.colors.text, marginBottom: 8 }}>Nenhum pedido ainda</h3>
          <p style={{ fontSize: 13, color: theme.colors.textMuted }}>Quando sua agencia criar pedidos, eles aparecerao aqui.</p>
        </div>
      ) : (
        <>
          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 4, padding: 2, background: theme.colors.bgSecondary, border: `1px solid ${theme.colors.border}`, borderRadius: 8, width: 'fit-content' }}>
            {[
              { id: 'map', label: 'Mapa' },
              { id: 'table', label: 'Planilha' },
              { id: 'financial', label: 'Financeiro' },
              { id: 'contract', label: 'Contrato' },
              { id: 'request', label: 'Solicitar' },
            ].map(t => (
              <button key={t.id} onClick={() => {
                setTab(t.id)
                if (t.id === 'financial') loadFinancial()
              }} style={{
                padding: '6px 16px', fontSize: 12.5, borderRadius: 6,
                color: tab === t.id ? theme.colors.text : theme.colors.textMuted,
                background: tab === t.id ? theme.colors.surfaceHover : 'transparent',
                fontWeight: tab === t.id ? 500 : 400, cursor: 'pointer',
              }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Kanban map (read-only) */}
          {tab === 'map' && (
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
              {columns.map(column => {
                const colOrders = sortByDueDate(orders.filter(o => o.column_id === column.id))
                return (
                  <div key={column.id} style={{
                    minWidth: 0, width: 0, flexShrink: 0, flex: '1 1 0',
                    background: theme.colors.bgSecondary,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: 12,
                    display: 'flex', flexDirection: 'column',
                  }}>
                    <div style={{
                      padding: '14px 16px 12px',
                      display: 'flex', alignItems: 'center', gap: 10,
                      borderBottom: `1px solid ${theme.colors.borderSoft}`,
                    }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: column.color,
                        boxShadow: `0 0 8px ${column.color}88`,
                      }} />
                      <span style={{ fontSize: 12.5, fontWeight: 500, color: theme.colors.text }}>{column.name}</span>
                      <span className="mono" style={{
                        marginLeft: 'auto', fontSize: 11,
                        color: theme.colors.textFaint,
                        padding: '2px 8px', background: theme.colors.bg,
                        borderRadius: 4,
                      }}>
                        {colOrders.length}
                      </span>
                    </div>

                    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {colOrders.map(order => (
                        <ClientOrderCard key={order.id} order={order} onClick={() => setSelectedOrder(order)} />
                      ))}
                      {colOrders.length === 0 && (
                        <div style={{
                          padding: '20px 14px',
                          border: `1px dashed ${theme.colors.border}`,
                          borderRadius: 8, textAlign: 'center',
                          fontSize: 11.5, color: theme.colors.textFaint,
                        }}>
                          sem pedidos
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Values table */}
          {tab === 'table' && (
            <div style={{ ...panelStyle, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: theme.colors.bgSecondary }}>
                    {['Pedido', 'Status', 'Prazo', 'Valor'].map(h => (
                      <th key={h} className="eyebrow" style={{
                        padding: '12px 16px', textAlign: 'left',
                        borderBottom: `1px solid ${theme.colors.border}`,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => {
                    const d = daysUntil(o.due_date)
                    const overdue = d != null && d < 0 && o.column_name !== 'Finalizado'
                    return (
                      <tr key={o.id}
                        onClick={() => setSelectedOrder(o)}
                        className="row-hover"
                        style={{ borderBottom: `1px solid ${theme.colors.borderSoft}`, cursor: 'pointer' }}
                      >
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {o.priority && o.priority !== 'normal' && (
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY[o.priority]?.color }} />
                            )}
                            <span style={{ fontSize: 13.5, color: theme.colors.text }}>{o.title}</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {o.column_name && (
                            <span style={{
                              padding: '3px 10px', borderRadius: 6,
                              background: (o.column_color || theme.colors.primary) + '22',
                              color: o.column_color || theme.colors.primary,
                              fontSize: 11.5, fontWeight: 500,
                            }}>
                              {o.column_name}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 12 }} className="mono tnum">
                          {o.due_date ? (
                            <span style={{ color: overdue ? theme.colors.danger : theme.colors.text }}>
                              {new Date(o.due_date).toLocaleDateString('pt-BR')}
                              {overdue && <span style={{ marginLeft: 6, color: theme.colors.danger, fontSize: 11 }}>{Math.abs(d)}d</span>}
                            </span>
                          ) : '---'}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 13 }} className="mono tnum">
                          {o.value > 0 ? (
                            <span style={{ color: theme.colors.mint, fontWeight: 500 }}>{fmtBRL(o.value)}</span>
                          ) : <span style={{ color: theme.colors.textFaint }}>---</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${theme.colors.border}` }}>
                    <td colSpan={3} style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: theme.colors.text }}>
                      Total
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 600 }} className="mono tnum">
                      <span style={{ color: theme.colors.mint }}>{fmtBRL(orders.reduce((sum, o) => sum + (o.value || 0), 0))}</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Contract tab — view and sign contract */}
          {tab === 'contract' && (
            <ClientContractTab contract={contract} onSigned={() => {
              api.clientPortal.getContract().then(c => setContract(c)).catch(() => {})
            }} />
          )}

          {/* Request tab — client order portal */}
          {tab === 'request' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Contract info */}
              {contract && (
                <div style={{ ...panelStyle, padding: 20, display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div style={{ flex: 1 }}>
                    <div className="eyebrow" style={{ marginBottom: 6 }}>Seu contrato</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: theme.colors.text }}>{contract.title}</div>
                    <div style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 4 }}>
                      {contract.monthly_videos} videos/mes · {fmtBRL(contract.monthly_value)}/mes
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div className="eyebrow" style={{ marginBottom: 4 }}>Usados este mes</div>
                    <div className="display tnum" style={{ fontSize: 28, color: contract.used >= contract.monthly_videos ? theme.colors.danger : theme.colors.primary }}>
                      {contract.used || 0}<span style={{ fontSize: 14, color: theme.colors.textMuted }}>/{contract.monthly_videos}</span>
                    </div>
                  </div>
                </div>
              )}

              {!showRequestForm ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <button onClick={() => setShowRequestForm(true)} style={{ ...btnPrimary, padding: '14px 28px', fontSize: 14 }}>
                    <Icon name="plus" size={16} />
                    Nova solicitacao de video
                  </button>
                  <div style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 12 }}>
                    Solicite um novo video e nossa equipe iniciara a producao.
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmitRequest} style={{ ...panelStyle, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="eyebrow">Nova solicitacao</div>
                  <Field label="Titulo do video" required>
                    <input value={requestForm.title} onChange={e => setRequestForm(f => ({ ...f, title: e.target.value }))}
                      style={inputStyle} placeholder="Ex: Video institucional Q3" />
                  </Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <Field label="Tipo de video">
                      <select value={requestForm.video_type} onChange={e => setRequestForm(f => ({ ...f, video_type: e.target.value }))}
                        style={{ ...inputStyle, cursor: 'pointer' }}>
                        <option value="">Selecionar</option>
                        <option value="institucional">Institucional</option>
                        <option value="social_media">Social Media</option>
                        <option value="comercial">Comercial</option>
                        <option value="evento">Evento</option>
                        <option value="depoimento">Depoimento</option>
                        <option value="animacao">Animacao</option>
                        <option value="outro">Outro</option>
                      </select>
                    </Field>
                    <Field label="Duracao estimada">
                      <select value={requestForm.duration} onChange={e => setRequestForm(f => ({ ...f, duration: e.target.value }))}
                        style={{ ...inputStyle, cursor: 'pointer' }}>
                        <option value="">Selecionar</option>
                        <option value="15s">Ate 15s</option>
                        <option value="30s">Ate 30s</option>
                        <option value="60s">Ate 1 min</option>
                        <option value="3min">1-3 min</option>
                        <option value="5min">3-5 min</option>
                        <option value="10min+">10+ min</option>
                      </select>
                    </Field>
                    <Field label="Formato">
                      <select value={requestForm.format} onChange={e => setRequestForm(f => ({ ...f, format: e.target.value }))}
                        style={{ ...inputStyle, cursor: 'pointer' }}>
                        <option value="">Selecionar</option>
                        <option value="16:9">Horizontal (16:9)</option>
                        <option value="9:16">Vertical (9:16)</option>
                        <option value="1:1">Quadrado (1:1)</option>
                        <option value="4:5">Feed (4:5)</option>
                        <option value="multiplo">Multiplos formatos</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Descricao / objetivo">
                    <textarea value={requestForm.description} onChange={e => setRequestForm(f => ({ ...f, description: e.target.value }))}
                      rows={3} style={{ ...inputStyle, resize: 'vertical', minHeight: 70 }}
                      placeholder="Descreva o objetivo do video, publico-alvo, tom desejado..." />
                  </Field>
                  <Field label="Briefing detalhado">
                    <textarea value={requestForm.briefing} onChange={e => setRequestForm(f => ({ ...f, briefing: e.target.value }))}
                      rows={4} style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
                      placeholder="Roteiro, elementos obrigatorios, musicas, textos em tela, locucao..." />
                  </Field>
                  <Field label="Links de referencia (um por linha)" hint="YouTube, Instagram, Vimeo, etc.">
                    <textarea value={requestForm.references} onChange={e => setRequestForm(f => ({ ...f, references: e.target.value }))}
                      rows={2} style={{ ...inputStyle, resize: 'vertical', minHeight: 50, fontFamily: theme.fonts.mono, fontSize: 12 }}
                      placeholder="https://youtube.com/watch?v=..." />
                  </Field>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: `1px solid ${theme.colors.border}` }}>
                    <button type="button" onClick={() => setShowRequestForm(false)} style={btnGhost}>Cancelar</button>
                    <button type="submit" disabled={submittingRequest || !requestForm.title.trim()} style={{ ...btnPrimary, opacity: submittingRequest ? 0.6 : 1 }}>
                      {submittingRequest ? 'Enviando...' : 'Enviar solicitacao'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Financial tab */}
          {tab === 'financial' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {financialLoading ? <Spinner /> : financial ? (
                <>
                  {/* Summary cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                    <div style={{ ...panelStyle, padding: 20 }}>
                      <div className="eyebrow" style={{ marginBottom: 10 }}>Total em pedidos</div>
                      <div className="display tnum" style={{ fontSize: 28, color: theme.colors.text }}>{fmtBRL(financial.totalValue)}</div>
                    </div>
                    <div style={{ ...panelStyle, padding: 20 }}>
                      <div className="eyebrow" style={{ marginBottom: 10 }}>Pago</div>
                      <div className="display tnum" style={{ fontSize: 28, color: theme.colors.mint }}>{fmtBRL(financial.totalPaid)}</div>
                    </div>
                    <div style={{ ...panelStyle, padding: 20 }}>
                      <div className="eyebrow" style={{ marginBottom: 10 }}>Pendente</div>
                      <div className="display tnum" style={{ fontSize: 28, color: theme.colors.warm }}>{fmtBRL(financial.totalPending)}</div>
                    </div>
                  </div>

                  {/* Invoices list */}
                  <div>
                    <div className="eyebrow" style={{ marginBottom: 12 }}>Faturas</div>
                    {financial.invoices.length === 0 ? (
                      <div style={{ ...panelStyle, padding: 40, textAlign: 'center', color: theme.colors.textMuted, fontSize: 13 }}>
                        Nenhuma fatura emitida ainda.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {financial.invoices.map(inv => (
                          <div key={inv.id} style={{ ...panelStyle, overflow: 'hidden' }}>
                            <div
                              onClick={() => toggleInvoice(inv.id)}
                              style={{
                                padding: '16px 20px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 16,
                                transition: 'background 0.1s',
                              }}
                              className="row-hover"
                            >
                              <Icon name={expandedInvoice === inv.id ? 'chevronDown' : 'arrowRight'} size={12} stroke color={theme.colors.textMuted} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13.5, fontWeight: 500, color: theme.colors.text }}>
                                  Fatura #{inv.id}
                                  <span style={{ marginLeft: 8, fontSize: 11, color: theme.colors.textMuted }}>
                                    {inv.item_count} pedido{inv.item_count !== 1 ? 's' : ''}
                                  </span>
                                </div>
                                {inv.order_titles && (
                                  <div style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {inv.order_titles}
                                  </div>
                                )}
                              </div>
                              <span style={{
                                padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                background: inv.status === 'paid' ? theme.colors.mintMuted || 'rgba(0,210,150,0.12)' : 'rgba(255,183,77,0.12)',
                                color: inv.status === 'paid' ? theme.colors.mint : theme.colors.warm,
                                fontFamily: theme.fonts.mono, textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                              }}>
                                {inv.status === 'paid' ? 'pago' : 'pendente'}
                              </span>
                              <span className="mono tnum" style={{ fontSize: 14, fontWeight: 600, color: theme.colors.text }}>
                                {fmtBRL(inv.total_amount)}
                              </span>
                            </div>

                            {/* Expanded details */}
                            {expandedInvoice === inv.id && (
                              <div style={{ borderTop: `1px solid ${theme.colors.border}`, padding: '16px 20px', background: theme.colors.bg }}>
                                {inv.notes && (
                                  <div style={{ marginBottom: 14, padding: 12, background: theme.colors.bgSecondary, borderRadius: 8, border: `1px solid ${theme.colors.border}` }}>
                                    <div className="eyebrow" style={{ marginBottom: 6 }}>Observacoes</div>
                                    <div style={{ fontSize: 13, color: theme.colors.textSecondary, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{inv.notes}</div>
                                  </div>
                                )}
                                {inv.status === 'paid' && inv.paid_at && (
                                  <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Icon name="check" size={13} color={theme.colors.mint} />
                                    <span style={{ fontSize: 12, color: theme.colors.mint }}>
                                      Pago em {new Date(inv.paid_at).toLocaleDateString('pt-BR')}
                                    </span>
                                    {inv.proof_url && (
                                      <a href={inv.proof_url} target="_blank" rel="noopener noreferrer"
                                        style={{ fontSize: 11.5, color: theme.colors.primary, marginLeft: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Icon name="link" size={11} stroke />
                                        Ver comprovante
                                      </a>
                                    )}
                                  </div>
                                )}
                                {/* Invoice items */}
                                {invoiceItems[inv.id] ? (
                                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                      <tr>
                                        {['Pedido', 'Valor'].map(h => (
                                          <th key={h} className="eyebrow" style={{ padding: '8px 12px', textAlign: 'left', borderBottom: `1px solid ${theme.colors.border}` }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {invoiceItems[inv.id].items?.map((item, idx) => (
                                        <tr key={idx} style={{ borderBottom: `1px solid ${theme.colors.borderSoft}` }}>
                                          <td style={{ padding: '10px 12px', fontSize: 13, color: theme.colors.text }}>{item.order_title}</td>
                                          <td style={{ padding: '10px 12px', fontSize: 13 }} className="mono tnum">
                                            <span style={{ color: theme.colors.mint }}>{fmtBRL(item.amount)}</span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : (
                                  <div style={{ padding: 12, textAlign: 'center' }}><Spinner /></div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Standalone entries */}
                  {(financial.clientEntries || []).length > 0 && (
                    <div>
                      <div className="eyebrow" style={{ marginBottom: 12 }}>Lançamentos</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {financial.clientEntries.map(e => (
                          <div key={e.id} style={{ ...panelStyle, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 500, color: theme.colors.text }}>{e.description}</div>
                              <div style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 3 }}>
                                {e.entry_date ? new Date(e.entry_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
                              </div>
                            </div>
                            <span style={{
                              padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                              background: e.status === 'paid' ? 'rgba(0,210,150,0.12)' : 'rgba(255,183,77,0.12)',
                              color: e.status === 'paid' ? theme.colors.mint : theme.colors.warm,
                              fontFamily: theme.fonts.mono, textTransform: 'uppercase', letterSpacing: '0.05em',
                            }}>
                              {e.status === 'paid' ? 'pago' : 'pendente'}
                            </span>
                            <span className="mono tnum" style={{ fontSize: 14, fontWeight: 600, color: theme.colors.text }}>
                              {fmtBRL(e.amount)}
                            </span>
                            {e.status === 'paid' && e.proof_url && (
                              <a href={e.proof_url} target="_blank" rel="noreferrer"
                                style={{ fontSize: 11, color: theme.colors.primary, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Icon name="link" size={11} stroke /> Comprovante
                              </a>
                            )}
                            {e.status === 'pending' && (
                              <button onClick={() => { setEntryProofModal(e); setEntryProofUrl('') }}
                                style={{ padding: '5px 12px', background: 'rgba(0,210,150,0.12)', border: 'none', borderRadius: 6, color: theme.colors.mint, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                                Enviar comprovante
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Orders with payment status */}
                  <div>
                    <div className="eyebrow" style={{ marginBottom: 12 }}>Pedidos e pagamentos</div>
                    <div style={{ ...panelStyle, overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: theme.colors.bgSecondary }}>
                            {['Pedido', 'Status', 'Valor', 'Pagamento'].map(h => (
                              <th key={h} className="eyebrow" style={{ padding: '12px 16px', textAlign: 'left', borderBottom: `1px solid ${theme.colors.border}` }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {financial.orders.map(o => (
                            <tr key={o.id} style={{ borderBottom: `1px solid ${theme.colors.borderSoft}` }}>
                              <td style={{ padding: '12px 16px', fontSize: 13, color: theme.colors.text }}>{o.title}</td>
                              <td style={{ padding: '12px 16px' }}>
                                {o.column_name && (
                                  <span style={{
                                    padding: '3px 10px', borderRadius: 6,
                                    background: (o.column_color || theme.colors.primary) + '22',
                                    color: o.column_color || theme.colors.primary,
                                    fontSize: 11.5, fontWeight: 500,
                                  }}>
                                    {o.column_name}
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: 13 }} className="mono tnum">
                                {o.value > 0 ? <span style={{ color: theme.colors.mint }}>{fmtBRL(o.value)}</span> : <span style={{ color: theme.colors.textFaint }}>---</span>}
                              </td>
                              <td style={{ padding: '12px 16px' }}>
                                <span style={{
                                  padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                                  fontFamily: theme.fonts.mono, textTransform: 'uppercase', letterSpacing: '0.05em',
                                  background: o.invoice_status === 'paid' ? 'rgba(0,210,150,0.12)' : o.invoice_id ? 'rgba(255,183,77,0.12)' : theme.colors.bgSecondary,
                                  color: o.invoice_status === 'paid' ? theme.colors.mint : o.invoice_id ? theme.colors.warm : theme.colors.textFaint,
                                }}>
                                  {o.invoice_status === 'paid' ? 'pago' : o.invoice_id ? 'pendente' : 'sem fatura'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </>
      )}

      {/* Entry proof modal */}
      <Modal open={!!entryProofModal} onClose={() => { setEntryProofModal(null); setEntryProofUrl('') }} title="Enviar comprovante" width={460}>
        {entryProofModal && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Lançamento</div>
              <div style={{ fontSize: 14, color: theme.colors.text }}>{entryProofModal.description}</div>
              <div className="display tnum" style={{ fontSize: 24, color: theme.colors.mint, marginTop: 8 }}>
                {fmtBRL(entryProofModal.amount)}
              </div>
            </div>
            <Field label="Link do comprovante">
              <input value={entryProofUrl} onChange={e => setEntryProofUrl(e.target.value)}
                placeholder="Cole o link do comprovante de pagamento…" style={inputStyle} />
            </Field>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button style={btnSoft} onClick={() => setEntryProofModal(null)}>Cancelar</button>
              <button onClick={() => handlePayClientEntry(entryProofModal.id)}
                style={{ ...btnPrimary, background: theme.colors.mint, color: theme.colors.bg }}>
                Confirmar pagamento
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Order detail modal */}
      <Modal open={!!selectedOrder} onClose={() => setSelectedOrder(null)} width={560}>
        {selectedOrder && <ClientOrderDetail order={selectedOrder} onAction={() => {
          setSelectedOrder(null)
          // reload data
          setLoading(true)
          api.clientPortal.getProjects().then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
        }} />}
      </Modal>
    </div>
  )
}

function ClientOrderCard({ order, onClick }) {
  const d = daysUntil(order.due_date)
  const overdue = d != null && d < 0
  const today = d === 0
  const isClientOrder = order.source === 'client'

  return (
    <div
      onClick={onClick}
      style={{
        background: isClientOrder ? 'rgba(217, 183, 112, 0.04)' : theme.colors.panel,
        border: `1px solid ${overdue ? 'rgba(244, 115, 131, 0.35)' : isClientOrder ? 'rgba(217, 183, 112, 0.25)' : theme.colors.border}`,
        borderRadius: 10,
        padding: 12,
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'border-color 0.12s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = overdue ? 'rgba(244, 115, 131, 0.5)' : theme.colors.borderLight}
      onMouseLeave={e => e.currentTarget.style.borderColor = overdue ? 'rgba(244, 115, 131, 0.35)' : isClientOrder ? 'rgba(217, 183, 112, 0.25)' : theme.colors.border}
    >
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 2,
        background: isClientOrder ? theme.colors.gold : (PRIORITY[order.priority]?.color || theme.colors.primary),
        opacity: isClientOrder ? 1 : (['urgent', 'high'].includes(order.priority) ? 1 : 0.4),
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 13, color: theme.colors.text, lineHeight: 1.35, fontWeight: 500 }}>
          {order.title}
        </div>
        {order.priority && !['normal', 'low'].includes(order.priority) && (
          <span style={{
            padding: '2px 6px',
            background: PRIORITY[order.priority].soft,
            color: PRIORITY[order.priority].color,
            fontSize: 9, fontFamily: theme.fonts.mono, fontWeight: 600,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            borderRadius: 3, flexShrink: 0,
          }}>
            {PRIORITY[order.priority].label}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: theme.colors.textMuted }}>
        {order.due_date && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: overdue ? theme.colors.danger : today ? theme.colors.warm : theme.colors.textMuted }}>
            <Icon name="clock" size={11} />
            <span className="mono tnum">
              {overdue ? `${Math.abs(d)}d atraso` : today ? 'hoje' : new Date(order.due_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            </span>
          </div>
        )}
      </div>

      {order.value > 0 && (
        <div style={{
          marginTop: 10, paddingTop: 8,
          borderTop: `1px solid ${theme.colors.borderSoft}`,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        }}>
          <span className="mono tnum" style={{ fontSize: 11, color: theme.colors.mint, fontWeight: 500 }}>
            {fmtBRL(order.value)}
          </span>
        </div>
      )}
    </div>
  )
}

function ClientOrderDetail({ order, onAction }) {
  const d = daysUntil(order.due_date)
  const overdue = d != null && d < 0
  const [showCorrection, setShowCorrection] = useState(false)
  const [correctionText, setCorrectionText] = useState('')
  const [correctionTimestamp, setCorrectionTimestamp] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isEdited = order.column_name === 'Editado'
  const isApproved = order.approved

  async function handleApprove() {
    setSubmitting(true)
    try {
      await api.clientPortal.approve(order.id)
      if (onAction) onAction()
    } catch (err) { alert(err.message) } finally { setSubmitting(false) }
  }

  async function handleRequestChanges() {
    if (!correctionText.trim()) return
    setSubmitting(true)
    try {
      await api.clientPortal.requestChanges(order.id, {
        text: correctionText,
        timestamp_mark: correctionTimestamp || null,
      })
      if (onAction) onAction()
    } catch (err) { alert(err.message) } finally { setSubmitting(false) }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <span className="eyebrow">pedido #{order.id}</span>
          {order.column_name && (
            <>
              <span style={{ color: theme.colors.textFaint }}>.</span>
              <span style={{
                padding: '2px 8px', borderRadius: 4,
                background: (order.column_color || theme.colors.primary) + '22',
                color: order.column_color || theme.colors.primary,
                fontSize: 11, fontFamily: theme.fonts.mono, fontWeight: 500,
              }}>
                {order.column_name}
              </span>
            </>
          )}
          {isApproved && (
            <span style={{
              padding: '2px 8px', borderRadius: 4,
              background: 'rgba(0,210,150,0.12)', color: theme.colors.mint,
              fontSize: 10, fontFamily: theme.fonts.mono, fontWeight: 600,
              letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>
              aprovado
            </span>
          )}
          {order.source === 'client' && (
            <span style={{
              padding: '2px 8px', borderRadius: 4,
              background: theme.colors.goldMuted, color: theme.colors.gold,
              fontSize: 10, fontFamily: theme.fonts.mono, fontWeight: 600,
              letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>
              solicitado
            </span>
          )}
          {order.priority && !['normal', 'low'].includes(order.priority) && (
            <span style={{
              padding: '2px 8px',
              background: PRIORITY[order.priority]?.soft,
              color: PRIORITY[order.priority]?.color,
              fontSize: 9, fontFamily: theme.fonts.mono, fontWeight: 600,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              borderRadius: 3,
            }}>
              {PRIORITY[order.priority]?.label}
            </span>
          )}
        </div>
        <h2 className="display" style={{ fontSize: 28, lineHeight: 1.1, letterSpacing: '-0.015em', color: theme.colors.text, margin: 0 }}>
          {order.title}
        </h2>
      </div>

      {/* Info strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
        padding: '14px 0', marginBottom: 20,
        borderTop: `1px solid ${theme.colors.border}`,
        borderBottom: `1px solid ${theme.colors.border}`,
      }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Prazo</div>
          <div style={{ fontSize: 13.5, color: theme.colors.text }}>
            {order.due_date ? (
              <span style={{ color: overdue ? theme.colors.danger : theme.colors.text }} className="tnum">
                {new Date(order.due_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                {overdue && <span style={{ marginLeft: 6, fontSize: 11, color: theme.colors.danger }}>{Math.abs(d)}d atraso</span>}
              </span>
            ) : '---'}
          </div>
        </div>
        <div style={{ paddingLeft: 18, borderLeft: `1px solid ${theme.colors.border}` }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Valor</div>
          <div className="mono tnum" style={{ fontSize: 16, fontWeight: 600, color: order.value > 0 ? theme.colors.mint : theme.colors.textFaint }}>
            {order.value > 0 ? fmtBRL(order.value) : '---'}
          </div>
        </div>
      </div>

      {/* Description */}
      {order.description && (
        <div style={{ marginBottom: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Descricao</div>
          <div style={{
            padding: 14, background: theme.colors.bg, border: `1px solid ${theme.colors.border}`,
            borderRadius: 8, fontSize: 13.5, color: theme.colors.textSecondary,
            lineHeight: 1.6, whiteSpace: 'pre-wrap',
          }}>
            {order.description}
          </div>
        </div>
      )}

      {/* Briefing */}
      {order.briefing && (
        <div style={{ marginBottom: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Briefing</div>
          <div style={{
            padding: 14, background: theme.colors.bg, border: `1px solid ${theme.colors.border}`,
            borderRadius: 8, fontSize: 13.5, color: theme.colors.textSecondary,
            lineHeight: 1.6, whiteSpace: 'pre-wrap',
          }}>
            {order.briefing}
          </div>
        </div>
      )}

      {/* Video player — delivery link */}
      {order.delivery_link && (
        <div style={{ marginBottom: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Video entregue</div>
          <VideoPlayer url={order.delivery_link} />
        </div>
      )}

      {/* Drive links */}
      {order.drive_links && (
        <div style={{ marginBottom: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Links</div>
          {order.drive_links.split('\n').filter(Boolean).map((link, i) => (
            <a key={i} href={link} target="_blank" rel="noopener noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 12px', background: theme.colors.bg,
              border: `1px solid ${theme.colors.border}`, borderRadius: 8,
              fontSize: 12.5, color: theme.colors.primary, wordBreak: 'break-all',
              marginBottom: 6,
            }}>
              <Icon name="drive" size={13} />
              <span style={{ flex: 1 }}>{link}</span>
              <Icon name="arrowRight" size={11} stroke />
            </a>
          ))}
        </div>
      )}

      {/* Comments thread */}
      <div style={{ marginBottom: 18 }}>
        <OrderComments orderId={order.id} maxHeight={240} />
      </div>

      {/* Approve / Request changes (only show when order is in "Editado" column and not yet approved) */}
      {isEdited && !isApproved && (
        <div style={{
          marginTop: 8, padding: 16,
          background: theme.colors.bgSecondary,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: 10,
        }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Avaliacao do video</div>

          {!showCorrection ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleApprove}
                disabled={submitting}
                style={{
                  flex: 1, padding: '11px 16px', borderRadius: 8,
                  background: theme.colors.mint, color: '#0a0d13',
                  fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                <Icon name="check" size={14} />
                Aprovar video
              </button>
              <button
                onClick={() => setShowCorrection(true)}
                style={{
                  flex: 1, padding: '11px 16px', borderRadius: 8,
                  background: theme.colors.warmMuted, color: theme.colors.warm,
                  fontSize: 13, fontWeight: 600, border: `1px solid rgba(255,183,77,0.3)`, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <Icon name="message" size={14} />
                Pedir correcao
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <textarea
                value={correctionText}
                onChange={e => setCorrectionText(e.target.value)}
                placeholder="Descreva o que precisa ser corrigido..."
                rows={3}
                style={{
                  width: '100%', padding: 12, background: theme.colors.bg,
                  border: `1px solid ${theme.colors.border}`, borderRadius: 8,
                  color: theme.colors.text, fontSize: 13, fontFamily: theme.fonts.ui,
                  resize: 'vertical', outline: 'none',
                }}
              />
              <input
                value={correctionTimestamp}
                onChange={e => setCorrectionTimestamp(e.target.value)}
                placeholder="Timestamp (ex: 01:30) — opcional"
                style={{
                  width: '100%', padding: '8px 12px', background: theme.colors.bg,
                  border: `1px solid ${theme.colors.border}`, borderRadius: 8,
                  color: theme.colors.text, fontSize: 12.5, fontFamily: theme.fonts.mono,
                  outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleRequestChanges}
                  disabled={submitting || !correctionText.trim()}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: 8,
                    background: theme.colors.warm, color: '#0a0d13',
                    fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                    opacity: submitting || !correctionText.trim() ? 0.5 : 1,
                  }}
                >
                  {submitting ? 'Enviando...' : 'Enviar correcao'}
                </button>
                <button
                  onClick={() => { setShowCorrection(false); setCorrectionText(''); setCorrectionTimestamp('') }}
                  style={{
                    padding: '10px 16px', borderRadius: 8,
                    background: theme.colors.bgSecondary, color: theme.colors.textMuted,
                    fontSize: 13, fontWeight: 500, border: `1px solid ${theme.colors.border}`, cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ============================================================
   ClientContractTab — view full contract + typed signature from client portal
   ============================================================ */

const CLIENT_CURSIVE_FONTS = [
  { name: 'Dancing Script', label: 'Cursiva' },
  { name: 'Great Vibes', label: 'Elegante' },
  { name: 'Caveat', label: 'Manuscrita' },
]

function ClientContractTab({ contract, onSigned }) {
  const [step, setStep] = useState('view') // view → sign → otp → done
  const [signerName, setSignerName] = useState('')
  const [signerCPF, setSignerCPF] = useState('')
  const [cpfError, setCpfError] = useState('')
  const [selectedFont, setSelectedFont] = useState(CLIENT_CURSIVE_FONTS[0].name)
  const [otpCode, setOtpCode] = useState('')
  const [otpEmail, setOtpEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [signedAt, setSignedAt] = useState(null)
  const [govbrAvailable, setGovbrAvailable] = useState(false)
  const [signMethod, setSignMethod] = useState('typed')

  // Check Gov.br availability
  useEffect(() => {
    api.clientPortal.govbrAvailable().then(data => {
      if (data.available) setGovbrAvailable(true)
    }).catch(() => {})
  }, [])

  // Load Google Fonts
  useEffect(() => {
    const families = CLIENT_CURSIVE_FONTS.map(f => f.name.replace(/ /g, '+')).join('&family=')
    const linkId = 'contract-cursive-fonts'
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link')
      link.id = linkId
      link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    }
  }, [])

  if (!contract || !contract.contract) {
    return (
      <div style={{ ...panelStyle, textAlign: 'center', padding: 48 }}>
        <div style={{ fontSize: 14, color: theme.colors.textMuted }}>Nenhum contrato ativo vinculado a sua conta.</div>
      </div>
    )
  }

  const c = contract.contract
  const clauses = c.clauses || []
  const isSigned = c.signature_status === 'signed'

  function validateCPF(cpf) {
    cpf = cpf.replace(/\D/g, '')
    if (cpf.length !== 11) return false
    if (/^(\d)\1+$/.test(cpf)) return false
    let sum = 0
    for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i)
    let d1 = 11 - (sum % 11); if (d1 >= 10) d1 = 0
    if (parseInt(cpf[9]) !== d1) return false
    sum = 0
    for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i)
    let d2 = 11 - (sum % 11); if (d2 >= 10) d2 = 0
    return parseInt(cpf[10]) === d2
  }

  function maskCPF(v) {
    v = v.replace(/\D/g, '').slice(0, 11)
    if (v.length > 9) return v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4')
    if (v.length > 6) return v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3')
    if (v.length > 3) return v.replace(/(\d{3})(\d{1,3})/, '$1.$2')
    return v
  }

  function getPartyTypeLabel(tipo) {
    if (tipo === 'pj') return 'pessoa juridica de direito privado'
    if (tipo === 'mei') return 'microempreendedor individual'
    return 'pessoa fisica'
  }

  function formatPartyDoc(prefix) {
    const tipo = c[`${prefix}_tipo`] || 'pf'
    const cnpj = c[`${prefix}_cnpj`]
    const cpf = c[`${prefix}_cpf`]
    const parts = []
    if ((tipo === 'pj' || tipo === 'mei') && cnpj) parts.push(`CNPJ: ${cnpj}`)
    if (cpf) parts.push(`CPF: ${cpf}`)
    return parts.join(', ')
  }

  function getTopics(clause) {
    const items = clause.items_json ? (typeof clause.items_json === 'string' ? JSON.parse(clause.items_json) : clause.items_json) : []
    if (items.length > 0 && typeof items[0] === 'string') return items.map(t => ({ text: t, subtopics: [] }))
    return items.map(t => ({ text: t.text || '', subtopics: t.subtopics || [] }))
  }

  // Generate signature image from typed name
  function generateSignatureImage() {
    const canvas = document.createElement('canvas')
    canvas.width = 500
    canvas.height = 120
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.font = `42px '${selectedFont}', cursive`
    ctx.fillStyle = '#111'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(signerName, canvas.width / 2, canvas.height / 2)
    return canvas.toDataURL('image/png')
  }

  async function handleSendOTP() {
    const raw = signerCPF.replace(/\D/g, '')
    if (raw.length !== 11 || !validateCPF(raw)) { setCpfError('CPF invalido'); return }
    setCpfError('')
    if (!signerName.trim()) { alert('Informe seu nome completo'); return }
    setSubmitting(true)
    try {
      const data = await api.clientPortal.sendContractOTP()
      setOtpEmail(data.email_sent_to || '')
      setStep('otp')
    } catch (err) { alert(err.message) } finally { setSubmitting(false) }
  }

  async function handleVerify() {
    if (otpCode.length !== 6) { alert('Digite o codigo de 6 digitos'); return }
    setSubmitting(true)
    try {
      let geolocation = null
      try {
        const pos = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 }))
        geolocation = `${pos.coords.latitude},${pos.coords.longitude}`
      } catch {}
      const data = await api.clientPortal.signContract({
        otp: otpCode, signer_name: signerName, signer_cpf: signerCPF,
        signature_image: generateSignatureImage(), signature_font: selectedFont, geolocation,
      })
      if (data.error) { alert(data.error) }
      else { setSignedAt(data.signed_at); setStep('done'); onSigned && onSigned() }
    } catch (err) { alert(err.message) } finally { setSubmitting(false) }
  }

  if (step === 'done') return (
    <div style={{ ...panelStyle, textAlign: 'center', padding: 40 }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
      <h3 style={{ color: theme.colors.text, fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>Contrato Assinado!</h3>
      <p style={{ fontSize: 13, color: theme.colors.textMuted }}>
        Sua assinatura foi registrada em {signedAt ? new Date(signedAt).toLocaleString('pt-BR') : 'agora'}.
      </p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Status */}
      {isSigned ? (
        <div style={{ ...panelStyle, padding: 14, background: 'rgba(124,224,184,0.08)', borderColor: theme.colors.mint }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: theme.colors.mint }}>✅ Contrato assinado digitalmente</div>
        </div>
      ) : (
        <div style={{ ...panelStyle, padding: 14, background: 'rgba(167,139,250,0.08)', borderColor: theme.colors.primary }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: theme.colors.primary }}>
            Revise o contrato abaixo e assine digitalmente para confirmar os servicos.
          </div>
        </div>
      )}

      {/* Contract document */}
      <div style={{
        background: '#fff', color: '#111', padding: '36px 40px', borderRadius: 10,
        fontFamily: "'Inter', serif", fontSize: 13, lineHeight: 1.7,
        maxHeight: step === 'view' ? 500 : 300, overflowY: 'auto',
        border: '1px solid rgba(255,255,255,0.1)',
      }}>
        <h1 style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, marginBottom: 20, textTransform: 'uppercase' }}>
          {c.title}
        </h1>

        {c.contratante_nome && (
          <p style={{ marginBottom: 10, textAlign: 'justify', fontSize: 12 }}>
            <strong>CONTRATANTE: {c.contratante_nome}</strong>
            {`, ${getPartyTypeLabel(c.contratante_tipo)}`}
            {formatPartyDoc('contratante') && `, ${formatPartyDoc('contratante')}`}
            {c.contratante_endereco && `, sede na ${c.contratante_endereco}`}
          </p>
        )}
        {c.contratado_nome && (
          <p style={{ marginBottom: 10, textAlign: 'justify', fontSize: 12 }}>
            <strong>CONTRATADO: {c.contratado_nome}</strong>
            {`, ${getPartyTypeLabel(c.contratado_tipo)}`}
            {formatPartyDoc('contratado') && `, ${formatPartyDoc('contratado')}`}
            {c.contratado_endereco && `, endereco: ${c.contratado_endereco}`}
          </p>
        )}

        {(c.contratante_nome || c.contratado_nome) && (
          <p style={{ marginBottom: 16, textAlign: 'justify', fontSize: 12 }}>
            As partes acima identificadas tem, entre si, justo e contratado o que segue:
          </p>
        )}

        {clauses.map((clause, idx) => {
          const topics = getTopics(clause)
          return (
            <div key={idx} style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase' }}>
                CLAUSULA {idx + 1}&#170; &ndash; {clause.title}
              </h2>
              {clause.content && <p style={{ marginBottom: 4, textAlign: 'justify', fontSize: 12 }}>{clause.content}</p>}
              {topics.length > 0 && (
                <div>
                  {topics.map((topic, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>
                      <p style={{ fontSize: 12, textAlign: 'justify' }}>
                        <strong>{idx + 1}.{i + 1}</strong> &ndash; {topic.text}
                      </p>
                      {topic.subtopics?.length > 0 && (
                        <div style={{ paddingLeft: 20 }}>
                          {topic.subtopics.map((sub, si) => (
                            <p key={si} style={{ fontSize: 11.5, marginBottom: 2 }}>* {sub}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {(c.city || c.contract_date) && (
          <p style={{ textAlign: 'center', marginTop: 24, fontSize: 12 }}>
            {c.city || '___'}, {c.contract_date || '___'}
          </p>
        )}
      </div>

      {/* Sign form */}
      {!isSigned && step === 'view' && (
        <div style={{ ...panelStyle, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: theme.colors.text, marginBottom: 14 }}>Assinar contrato</h3>

          {/* Method selector */}
          {govbrAvailable && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setSignMethod('govbr')}
                  style={{
                    flex: 1, padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${signMethod === 'govbr' ? '#1351B4' : theme.colors.border}`,
                    background: signMethod === 'govbr' ? 'rgba(19,81,180,0.08)' : 'transparent',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                    background: 'linear-gradient(135deg, #1351B4, #0C326F)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, color: '#fff',
                  }}>G</div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: signMethod === 'govbr' ? '#1351B4' : theme.colors.text }}>Gov.br</div>
                    <div style={{ fontSize: 10, color: theme.colors.textMuted }}>Conta Gov.br</div>
                  </div>
                </button>
                <button onClick={() => setSignMethod('typed')}
                  style={{
                    flex: 1, padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${signMethod === 'typed' ? theme.colors.primary : theme.colors.border}`,
                    background: signMethod === 'typed' ? theme.colors.primaryMuted : 'transparent',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                    background: theme.colors.primary,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, color: '#fff',
                  }}>✍</div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: signMethod === 'typed' ? theme.colors.primary : theme.colors.text }}>Digital</div>
                    <div style={{ fontSize: 10, color: theme.colors.textMuted }}>Nome + email</div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Gov.br signing */}
          {signMethod === 'govbr' && govbrAvailable && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', padding: '8px 0' }}>
              <p style={{ fontSize: 12.5, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 1.6 }}>
                Voce sera redirecionado ao <strong style={{ color: theme.colors.text }}>Gov.br</strong> para autenticar e assinar o contrato.
              </p>
              <a href={`${window.location.origin}/audiovisual/api/govbr/authorize-client`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '14px 20px', borderRadius: 10, border: 'none', textDecoration: 'none',
                  background: 'linear-gradient(135deg, #1351B4, #0C326F)',
                  color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  justifyContent: 'center', boxShadow: '0 2px 12px rgba(19,81,180,0.3)',
                }}>
                Entrar com Gov.br e assinar
              </a>
              <p style={{ fontSize: 10, color: theme.colors.textFaint, textAlign: 'center' }}>
                Assinatura com validade juridica (MP 2.200-2/2001)
              </p>
            </div>
          )}

          {/* Typed signature */}
          {signMethod === 'typed' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Nome completo">
                <input value={signerName} onChange={e => setSignerName(e.target.value)}
                  style={inputStyle} placeholder="Seu nome completo" />
              </Field>
              <Field label="CPF">
                <input value={signerCPF} onChange={e => { setSignerCPF(maskCPF(e.target.value)); setCpfError('') }}
                  style={{ ...inputStyle, borderColor: cpfError ? '#f47383' : undefined }}
                  placeholder="000.000.000-00" maxLength={14} />
                {cpfError && <div style={{ fontSize: 11, color: '#f47383', marginTop: 4 }}>{cpfError}</div>}
              </Field>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: theme.colors.textMuted, marginBottom: 4 }}>Sua assinatura digital</label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  {CLIENT_CURSIVE_FONTS.map(f => (
                    <button key={f.name} onClick={() => setSelectedFont(f.name)}
                      style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                        border: `1px solid ${selectedFont === f.name ? theme.colors.primary + '66' : theme.colors.border}`,
                        background: selectedFont === f.name ? theme.colors.primaryMuted : 'transparent',
                        color: selectedFont === f.name ? theme.colors.primary : theme.colors.textMuted,
                      }}>{f.label}</button>
                  ))}
                </div>
                <div style={{
                  background: '#fff', borderRadius: 8, padding: '16px 20px', minHeight: 64,
                  border: `1px solid ${theme.colors.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
                }}>
                  {signerName.trim() ? (
                    <div style={{ fontFamily: `'${selectedFont}', cursive`, fontSize: 32, color: '#111', textAlign: 'center', userSelect: 'none' }}>
                      {signerName}
                    </div>
                  ) : (
                    <div style={{ color: '#bbb', fontSize: 13, fontStyle: 'italic' }}>Digite seu nome acima</div>
                  )}
                  <div style={{ position: 'absolute', bottom: 12, left: 20, right: 20, height: 1, background: '#ddd' }} />
                </div>
              </div>

              <button onClick={handleSendOTP} disabled={submitting || !signerName.trim() || !signerCPF}
                style={{ ...btnPrimary, width: '100%', opacity: (submitting || !signerName.trim() || !signerCPF) ? 0.5 : 1 }}>
                {submitting ? 'Enviando...' : 'Enviar codigo de verificacao para meu email'}
              </button>
              <p style={{ fontSize: 11, color: theme.colors.textFaint, textAlign: 'center' }}>
                Ao assinar, voce concorda com os termos. Um codigo sera enviado ao seu email.
              </p>
            </div>
          )}
        </div>
      )}

      {/* OTP */}
      {!isSigned && step === 'otp' && (
        <div style={{ ...panelStyle, padding: 24, textAlign: 'center' }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: theme.colors.text, marginBottom: 8 }}>Verificacao</h3>
          <p style={{ fontSize: 12.5, color: theme.colors.textMuted, marginBottom: 16 }}>
            Codigo enviado para <strong style={{ color: theme.colors.text }}>{otpEmail}</strong>
          </p>
          <input value={otpCode} onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            style={{ width: 160, padding: '12px', borderRadius: 8, border: `1px solid ${theme.colors.border}`, background: theme.colors.bg, color: theme.colors.text, fontSize: 22, fontWeight: 700, textAlign: 'center', letterSpacing: 6, fontFamily: 'monospace' }}
            placeholder="000000" maxLength={6} autoFocus
          />
          {/* Signature preview */}
          <div style={{
            margin: '16px auto', maxWidth: 320, padding: '10px 16px',
            background: '#fff', borderRadius: 8, border: `1px solid ${theme.colors.border}`,
          }}>
            <div style={{ fontSize: 9, color: '#999', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assinatura</div>
            <div style={{ fontFamily: `'${selectedFont}', cursive`, fontSize: 24, color: '#111', textAlign: 'center' }}>
              {signerName}
            </div>
          </div>
          <button onClick={handleVerify} disabled={submitting || otpCode.length !== 6}
            style={{ ...btnPrimary, display: 'block', width: '100%', maxWidth: 280, margin: '16px auto 0', opacity: (submitting || otpCode.length !== 6) ? 0.5 : 1 }}>
            {submitting ? 'Verificando...' : 'Confirmar assinatura'}
          </button>
          <button onClick={handleSendOTP} disabled={submitting}
            style={{ display: 'block', margin: '10px auto 0', background: 'transparent', border: 'none', color: theme.colors.primary, fontSize: 12, cursor: 'pointer' }}>
            Reenviar codigo
          </button>
        </div>
      )}
    </div>
  )
}
