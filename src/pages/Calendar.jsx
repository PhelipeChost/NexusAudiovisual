// src/pages/Calendar.jsx — calendario de entregas
import { useState, useEffect } from 'react'
import api from '../api'
import theme from '../styles/theme'
import { Icon, Spinner, PRIORITY, panelStyle } from '../components/ui'

export default function Calendar() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  useEffect(() => { loadData() }, [currentMonth])

  async function loadData() {
    setLoading(true)
    try {
      const d = await api.calendar.get(currentMonth)
      setOrders(d.orders || [])
    } catch (err) { console.error(err) } finally { setLoading(false) }
  }

  const [year, month] = currentMonth.split('-').map(Number)
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  const startWeekday = firstDay.getDay() // 0=Sun
  const daysInMonth = lastDay.getDate()

  function prevMonth() {
    const d = new Date(year, month - 2, 1)
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  function nextMonth() {
    const d = new Date(year, month, 1)
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const monthLabel = firstDay.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  // Group orders by day
  const ordersByDay = {}
  for (const o of orders) {
    const day = parseInt(o.due_date.split('-')[2], 10)
    if (!ordersByDay[day]) ordersByDay[day] = []
    ordersByDay[day].push(o)
  }

  // Build calendar grid (6 rows x 7 cols)
  const cells = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length < 42) cells.push(null)

  const today = new Date()
  const isToday = (day) => day && today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === day

  if (loading) return <Spinner />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 className="display" style={{ fontSize: 28, color: theme.colors.text, margin: 0, textTransform: 'capitalize' }}>
          {monthLabel}
        </h2>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={prevMonth} style={{
            padding: '8px 12px', borderRadius: 8,
            background: theme.colors.bgSecondary, border: `1px solid ${theme.colors.border}`,
            color: theme.colors.textMuted, cursor: 'pointer',
          }}>
            <Icon name="chevronLeft" size={14} />
          </button>
          <button onClick={nextMonth} style={{
            padding: '8px 12px', borderRadius: 8,
            background: theme.colors.bgSecondary, border: `1px solid ${theme.colors.border}`,
            color: theme.colors.textMuted, cursor: 'pointer',
          }}>
            <Icon name="chevronRight" size={14} />
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div style={{ ...panelStyle, overflow: 'hidden' }}>
        {/* Weekday header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: `1px solid ${theme.colors.border}` }}>
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map(d => (
            <div key={d} className="eyebrow" style={{ padding: '10px 8px', textAlign: 'center' }}>{d}</div>
          ))}
        </div>

        {/* Days */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {cells.map((day, i) => {
            const dayOrders = day ? (ordersByDay[day] || []) : []
            return (
              <div key={i} style={{
                minHeight: 90, padding: 6,
                borderRight: (i + 1) % 7 !== 0 ? `1px solid ${theme.colors.borderSoft}` : 'none',
                borderBottom: i < 35 ? `1px solid ${theme.colors.borderSoft}` : 'none',
                background: day ? 'transparent' : theme.colors.bgSecondary,
              }}>
                {day && (
                  <>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: isToday(day) ? 700 : 400,
                      color: isToday(day) ? '#0a0d13' : theme.colors.text,
                      background: isToday(day) ? theme.colors.primary : 'transparent',
                      marginBottom: 4,
                    }}>
                      {day}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {dayOrders.slice(0, 3).map(o => (
                        <div key={o.id} style={{
                          padding: '2px 5px', borderRadius: 4, fontSize: 10,
                          background: (PRIORITY[o.priority]?.soft || theme.colors.primaryMuted),
                          color: PRIORITY[o.priority]?.color || theme.colors.primary,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          fontWeight: 500,
                        }} title={`${o.title} — ${o.client_name || ''}`}>
                          {o.title}
                        </div>
                      ))}
                      {dayOrders.length > 3 && (
                        <div style={{ fontSize: 9, color: theme.colors.textFaint, paddingLeft: 4 }}>
                          +{dayOrders.length - 3} mais
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Orders list for month */}
      {orders.length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Entregas do mes · {orders.length}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {orders.map(o => {
              const isPast = new Date(o.due_date) < today && o.column_name !== 'Finalizado'
              return (
                <div key={o.id} style={{
                  ...panelStyle, padding: '12px 16px',
                  display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: PRIORITY[o.priority]?.color || theme.colors.primary,
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: theme.colors.text }}>{o.title}</div>
                    <div style={{ fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2 }}>
                      {o.client_name}{o.editor_name ? ` · ${o.editor_name}` : ''}
                    </div>
                  </div>
                  <span className="mono tnum" style={{ fontSize: 12, color: isPast ? theme.colors.danger : theme.colors.textMuted }}>
                    {new Date(o.due_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  </span>
                  {o.column_name && (
                    <span style={{
                      padding: '2px 8px', borderRadius: 4,
                      background: (o.column_color || theme.colors.primary) + '22',
                      color: o.column_color || theme.colors.primary,
                      fontSize: 10, fontWeight: 500,
                    }}>
                      {o.column_name}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
