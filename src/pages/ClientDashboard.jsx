// src/pages/ClientDashboard.jsx — visao do cliente: kanban read-only + tabela + financeiro
import { useState, useEffect } from 'react'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import theme from '../styles/theme'
import Modal from '../components/Modal'
import {
  Icon, Avatar, Spinner, Badge,
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

  useEffect(() => {
    async function load() {
      try {
        const d = await api.clientPortal.getProjects()
        setData(d)
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
                    minWidth: 240, width: 240, flexShrink: 0, flex: '1 0 240px',
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

                    <div style={{ flex: 1, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
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

      {/* Order detail modal */}
      <Modal open={!!selectedOrder} onClose={() => setSelectedOrder(null)} width={560}>
        {selectedOrder && <ClientOrderDetail order={selectedOrder} />}
      </Modal>
    </div>
  )
}

function ClientOrderCard({ order, onClick }) {
  const d = daysUntil(order.due_date)
  const overdue = d != null && d < 0
  const today = d === 0

  return (
    <div
      onClick={onClick}
      style={{
        background: theme.colors.panel,
        border: `1px solid ${overdue ? 'rgba(244, 115, 131, 0.35)' : theme.colors.border}`,
        borderRadius: 10,
        padding: 12,
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'border-color 0.12s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = overdue ? 'rgba(244, 115, 131, 0.5)' : theme.colors.borderLight}
      onMouseLeave={e => e.currentTarget.style.borderColor = overdue ? 'rgba(244, 115, 131, 0.35)' : theme.colors.border}
    >
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 2,
        background: PRIORITY[order.priority]?.color || theme.colors.primary,
        opacity: ['urgent', 'high'].includes(order.priority) ? 1 : 0.4,
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

function ClientOrderDetail({ order }) {
  const d = daysUntil(order.due_date)
  const overdue = d != null && d < 0

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

      {/* Briefing (client can see briefing too) */}
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

      {/* Drive links */}
      {order.drive_links && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Links</div>
          <a href={order.drive_links} target="_blank" rel="noopener noreferrer" style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 12px', background: theme.colors.bg,
            border: `1px solid ${theme.colors.border}`, borderRadius: 8,
            fontSize: 12.5, color: theme.colors.primary, wordBreak: 'break-all',
          }}>
            <Icon name="drive" size={13} />
            <span style={{ flex: 1 }}>{order.drive_links}</span>
            <Icon name="arrowRight" size={11} stroke />
          </a>
        </div>
      )}
    </div>
  )
}
