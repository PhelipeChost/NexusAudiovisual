// src/pages/ClientDashboard.jsx — visao do cliente: kanban read-only + tabela de valores
import { useState, useEffect } from 'react'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import theme from '../styles/theme'
import {
  Icon, Avatar, Spinner, Badge,
  panelStyle, PRIORITY, fmtBRL, daysUntil,
} from '../components/ui'

export default function ClientDashboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('map')

  useEffect(() => {
    async function load() {
      try {
        const d = await api.clientPortal.getProjects()
        setData(d)
      } catch (err) { console.error(err) } finally { setLoading(false) }
    }
    load()
  }, [])

  if (loading) return <Spinner />

  const orders = data?.orders || []
  const columns = data?.columns || []
  const stats = data?.stats || {}

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

          {/* Kanban map (read-only) */}
          {tab === 'map' && (
            <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8 }}>
              {columns.map(column => {
                const colOrders = orders.filter(o => o.column_id === column.id)
                return (
                  <div key={column.id} style={{
                    minWidth: 280, width: 280, flexShrink: 0,
                    background: theme.colors.bgSecondary,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: 12,
                    display: 'flex', flexDirection: 'column',
                    maxHeight: 'calc(100vh - 500px)',
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

                    <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {colOrders.map(order => (
                        <ClientOrderCard key={order.id} order={order} />
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
                    {['Pedido', 'Status', 'Prazo', 'Editor', 'Valor'].map(h => (
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
                      <tr key={o.id} style={{ borderBottom: `1px solid ${theme.colors.borderSoft}` }}>
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
                          ) : '—'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {o.editor_name ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Avatar name={o.editor_name} size={22} />
                              <span style={{ fontSize: 12.5, color: theme.colors.textMuted }}>{o.editor_name.split(' ')[0]}</span>
                            </div>
                          ) : <span style={{ color: theme.colors.textFaint }}>—</span>}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 13 }} className="mono tnum">
                          {o.value > 0 ? (
                            <span style={{ color: theme.colors.mint, fontWeight: 500 }}>{fmtBRL(o.value)}</span>
                          ) : <span style={{ color: theme.colors.textFaint }}>—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${theme.colors.border}` }}>
                    <td colSpan={4} style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: theme.colors.text }}>
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
        </>
      )}
    </div>
  )
}

function ClientOrderCard({ order }) {
  const d = daysUntil(order.due_date)
  const overdue = d != null && d < 0
  const today = d === 0

  return (
    <div style={{
      background: theme.colors.panel,
      border: `1px solid ${overdue ? 'rgba(244, 115, 131, 0.35)' : theme.colors.border}`,
      borderRadius: 10,
      padding: 12,
      position: 'relative',
      overflow: 'hidden',
    }}>
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
        {order.editor_name && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Avatar name={order.editor_name} size={16} />
            <span>{order.editor_name.split(' ')[0]}</span>
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
