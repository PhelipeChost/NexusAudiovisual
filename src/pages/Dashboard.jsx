// src/pages/Dashboard.jsx — Panorama do gestor (mantém api.dashboard.get())
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import theme from '../styles/theme'
import {
  Icon, Avatar, Sparkline, Spinner, Badge,
  fmtBRL, daysUntil, panelStyle, btnPrimary, btnSoft,
} from '../components/ui'

const ACT_COLORS = {
  created: theme.colors.mint,
  moved: theme.colors.primary,
  commented: theme.colors.gold,
  uploaded: theme.colors.warm,
  completed: theme.colors.mint,
  updated: theme.colors.textMuted,
}

function actionVerb(a) {
  const m = {
    created: 'criou',
    moved: 'moveu',
    commented: 'comentou em',
    uploaded: 'subiu arquivos em',
    completed: 'concluiu',
    updated: 'atualizou',
  }
  return m[a] || a
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.dashboard.get()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Greeting calendar info
  const now = useMemo(() => new Date(), [])
  const greeting = now.getHours() < 12 ? 'Bom dia' : now.getHours() < 18 ? 'Boa tarde' : 'Boa noite'
  const weekday = now.toLocaleDateString('pt-BR', { weekday: 'long' })
  const dateStr = now.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
  const week = Math.ceil((((now - new Date(now.getFullYear(), 0, 1)) / 86400000) + 1) / 7)

  if (loading) return <Spinner />
  if (!data) return null

  const { stats, recentActivity, ordersByColumn, topClients, editorPerformance } = data

  // Hero metric cards
  const heroMetrics = [
    { id: 'rev',     label: 'Faturamento do mês',  value: stats.revenue,         currency: true,  color: theme.colors.primary },
    { id: 'open',    label: 'Pedidos em curso',    value: stats.inProgress,                       color: theme.colors.gold },
    { id: 'overdue', label: 'Atrasados',           value: stats.overdue,                          color: theme.colors.warm },
    { id: 'pending', label: 'A receber',           value: stats.pendingPayments, currency: true,  color: theme.colors.mint },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Editorial intro */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 28, alignItems: 'end' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            {weekday} · {dateStr} · semana {week}
          </div>
          <h2 className="display" style={{
            fontSize: 44, lineHeight: 1.04, letterSpacing: '-0.02em',
            maxWidth: 760, margin: 0, color: theme.colors.text,
          }}>
            {greeting}.
            {stats.inProgress > 0 && (
              <>
                <span className="display-italic" style={{ color: theme.colors.textMuted }}>
                  {' '}{stats.inProgress} pedido{stats.inProgress !== 1 ? 's' : ''} em curso
                </span>
                <span style={{ color: theme.colors.textMuted }}>
                  {stats.overdue > 0 ? ',' : '.'}
                </span>
              </>
            )}
            {stats.overdue > 0 && (
              <>
                <span className="display-italic" style={{ color: theme.colors.textMuted }}>
                  {' '}{stats.overdue} atrasado{stats.overdue !== 1 ? 's' : ''}
                </span>
                <span style={{ color: theme.colors.textMuted }}>.</span>
              </>
            )}
          </h2>
        </div>
      </div>

      {/* Hero metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {heroMetrics.map((m) => (
          <div key={m.id} style={{ ...panelStyle, padding: 18 }}>
            <div className="eyebrow" style={{ marginBottom: 18 }}>{m.label}</div>
            <div className="display tnum" style={{
              fontSize: 36, lineHeight: 1, letterSpacing: '-0.02em',
              color: theme.colors.text,
            }}>
              {m.currency ? (
                <>
                  <span style={{ fontSize: 18, color: theme.colors.textMuted, marginRight: 4 }}>R$</span>
                  {Number(m.value).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </>
              ) : (
                m.value
              )}
            </div>
            <div style={{ height: 4, marginTop: 16, background: theme.colors.bg, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: '60%', background: m.color, opacity: 0.5 }} />
            </div>
          </div>
        ))}
      </div>

      {/* Two-column: pipeline + activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20 }}>
        {/* Pipeline */}
        <div style={{ ...panelStyle, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 22 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Esteira de produção</div>
              <h3 className="display" style={{ fontSize: 22, margin: 0, color: theme.colors.text }}>
                {stats.totalOrders} pedidos no total
              </h3>
            </div>
            <button onClick={() => navigate('/dashboard/clients')}
              style={{ fontSize: 12, color: theme.colors.primary, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              ver kanbans <Icon name="arrowRight" size={11} stroke />
            </button>
          </div>

          {ordersByColumn.length > 0 ? (
            <>
              {/* Stacked bar */}
              <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 24 }}>
                {ordersByColumn.map((c, i) => (
                  <div key={c.column_name + i} style={{
                    flex: Math.max(c.count, 0.01),
                    background: c.color || theme.colors.primary,
                    opacity: 0.85,
                    borderRight: i < ordersByColumn.length - 1 ? `2px solid ${theme.colors.bg}` : 'none',
                  }} />
                ))}
              </div>

              {/* Columns mini */}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(ordersByColumn.length, 5)}, 1fr)`, gap: 14 }}>
                {ordersByColumn.slice(0, 5).map(c => (
                  <div key={c.column_name} style={{ borderTop: `2px solid ${c.color || theme.colors.primary}`, paddingTop: 12 }}>
                    <div className="eyebrow" style={{ fontSize: 10 }}>{c.column_name}</div>
                    <div className="display tnum" style={{ fontSize: 28, lineHeight: 1, marginTop: 8, color: theme.colors.text }}>
                      {c.count}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: theme.colors.textMuted, fontSize: 13 }}>
              Nenhum dado disponível
            </div>
          )}

          {/* Editor performance */}
          {editorPerformance.length > 0 && (
            <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${theme.colors.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <h4 className="display" style={{ fontSize: 18, margin: 0, color: theme.colors.text }}>Desempenho da equipe</h4>
                <span className="eyebrow">conclusão</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {editorPerformance.map(ed => {
                  const pct = ed.total_orders > 0 ? Math.round((ed.completed / ed.total_orders) * 100) : 0
                  return (
                    <div key={ed.name} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 100px', alignItems: 'center', gap: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={ed.name} size={26} />
                        <span style={{ fontSize: 12.5, color: theme.colors.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ed.name}
                        </span>
                      </div>
                      <div style={{ height: 4, background: theme.colors.bg, borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${pct}%`,
                          background: pct >= 80 ? theme.colors.mint : pct >= 60 ? theme.colors.gold : theme.colors.warm,
                        }} />
                      </div>
                      <div className="mono tnum" style={{ fontSize: 11.5, color: theme.colors.textMuted, textAlign: 'right' }}>
                        <span style={{ color: theme.colors.text }}>{ed.completed}</span>/{ed.total_orders} · {pct}%
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Activity */}
        <div style={{ ...panelStyle, padding: 24 }}>
          <div style={{ marginBottom: 18 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Atividade</div>
            <h3 className="display" style={{ fontSize: 22, margin: 0, color: theme.colors.text }}>Últimas horas</h3>
          </div>
          {recentActivity.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: theme.colors.textMuted, fontSize: 13 }}>
              Nenhuma atividade registrada
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {recentActivity.slice(0, 10).map((a, i, arr) => {
                const color = ACT_COLORS[a.action] || theme.colors.textMuted
                return (
                  <div key={a.id} style={{
                    display: 'flex', gap: 14,
                    padding: '12px 0',
                    borderBottom: i < arr.length - 1 ? `1px solid ${theme.colors.borderSoft}` : 'none',
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: color, marginTop: 5,
                        boxShadow: `0 0 0 3px ${color}22`,
                      }} />
                      {i < arr.length - 1 && (
                        <div style={{ width: 1, flex: 1, background: theme.colors.border, marginTop: 4 }} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: theme.colors.textSecondary, lineHeight: 1.5 }}>
                        <span style={{ color: theme.colors.text, fontWeight: 500 }}>{a.user_name?.split(' ')[0]}</span>
                        <span style={{ color: theme.colors.textMuted }}> {actionVerb(a.action)} </span>
                        <span className="display-italic" style={{ color: theme.colors.text }}>{a.details}</span>
                      </div>
                      <div className="eyebrow" style={{ marginTop: 4 }}>
                        {new Date(a.created_at).toLocaleString('pt-BR')}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom — top clients */}
      {topClients.length > 0 && (
        <div style={{ ...panelStyle, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Volume por cliente</div>
              <h3 className="display" style={{ fontSize: 22, margin: 0, color: theme.colors.text }}>Top clientes</h3>
            </div>
            <button onClick={() => navigate('/dashboard/clients')}
              style={{ fontSize: 12, color: theme.colors.primary }}>
              todos
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {topClients.map((c, i, arr) => {
              const maxOrders = Math.max(...topClients.map(x => x.order_count))
              const pct = maxOrders > 0 ? (c.order_count / maxOrders) * 100 : 0
              return (
                <div key={c.name}
                  className="row-hover"
                  style={{
                    display: 'grid', gridTemplateColumns: '32px 1fr 150px 80px',
                    alignItems: 'center', gap: 14,
                    padding: '14px 12px', marginLeft: -12, marginRight: -12,
                    borderRadius: 8,
                    borderBottom: i < arr.length - 1 ? `1px solid ${theme.colors.borderSoft}` : 'none',
                    cursor: 'pointer',
                  }}>
                  <div className="mono" style={{ fontSize: 11, color: theme.colors.textFaint }}>
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Avatar name={c.name} size={28} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, color: theme.colors.text }}>{c.name}</div>
                      <div style={{ fontSize: 11.5, color: theme.colors.textMuted }}>
                        {c.order_count} pedido{c.order_count !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ height: 4, background: theme.colors.bg, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: theme.colors.primary }} />
                  </div>
                  <div className="mono tnum" style={{ fontSize: 12, color: theme.colors.text, textAlign: 'right' }}>
                    {c.order_count}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
