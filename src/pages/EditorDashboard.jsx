// src/pages/EditorDashboard.jsx — visao completa do editor (multi-equipe)
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import theme from '../styles/theme'
import {
  Icon, Avatar, Spinner, Badge,
  panelStyle, PRIORITY, fmtBRL, daysUntil,
} from '../components/ui'

export default function EditorDashboard() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const d = await api.editorPortal.getDashboard()
        setData(d)
      } catch (err) { console.error(err) } finally { setLoading(false) }
    }
    load()
  }, [])

  if (loading) return <Spinner />

  const stats = data?.stats || {}
  const orders = data?.orders || data?.myOrders || []
  const inProgress = orders.filter(o => o.column_name !== 'Finalizado')
  const done = orders.filter(o => o.column_name === 'Finalizado')
  const overdue = orders.filter(o => o.due_date && daysUntil(o.due_date) < 0 && o.column_name !== 'Finalizado')
  const pendingInvites = data?.pendingInvites || []
  const teamsCount = data?.teams || 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Hello */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>seu painel</div>
          <h2 className="display" style={{ fontSize: 40, lineHeight: 1.05, letterSpacing: '-0.02em', color: theme.colors.text, margin: 0 }}>
            Bom trabalho, {user?.name?.split(' ')[0]}.
            {inProgress.length > 0 && (
              <span className="display-italic" style={{ color: theme.colors.textMuted }}>
                {' '}{inProgress.length} pedido{inProgress.length !== 1 ? 's' : ''} aguardando.
              </span>
            )}
          </h2>
        </div>
        <button onClick={() => navigate('/board')} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '9px 18px', borderRadius: 8,
          background: theme.colors.bgSecondary,
          border: `1px solid ${theme.colors.border}`,
          color: theme.colors.text, fontSize: 13, fontWeight: 500,
          cursor: 'pointer',
        }}>
          <Icon name="film" size={14} stroke color={theme.colors.primary} />
          Abrir mapa
        </button>
      </div>

      {/* Pending team invites */}
      {pendingInvites.length > 0 && (
        <div style={{
          ...panelStyle,
          padding: '16px 20px',
          borderColor: theme.colors.primaryLine,
          background: 'rgba(127, 219, 255, 0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Icon name="team" size={16} color={theme.colors.primary} />
            <span style={{ fontSize: 14, fontWeight: 600, color: theme.colors.text }}>
              Convites de equipe
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pendingInvites.map(inv => (
              <div key={inv.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderRadius: 8,
                background: theme.colors.surfaceHover,
                border: `1px solid ${theme.colors.border}`,
              }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: theme.colors.text }}>
                    {inv.company_name}
                  </div>
                  <div style={{ fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2 }}>
                    Convite de {inv.invited_by_name || 'gestor'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={async () => {
                      try {
                        await api.team.acceptInvite(inv.id)
                        const d = await api.editorPortal.getDashboard()
                        setData(d)
                        const me = await api.auth.me()
                        if (setUser) setUser(me)
                      } catch (err) { alert(err.message) }
                    }}
                    style={{
                      padding: '6px 16px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                      background: theme.colors.primary, color: theme.colors.bg,
                      cursor: 'pointer', border: 'none',
                    }}
                  >
                    Aceitar
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await api.team.declineInvite(inv.id)
                        const d = await api.editorPortal.getDashboard()
                        setData(d)
                      } catch (err) { alert(err.message) }
                    }}
                    style={{
                      padding: '6px 16px', fontSize: 12, fontWeight: 500, borderRadius: 6,
                      background: 'transparent', color: theme.colors.textMuted,
                      cursor: 'pointer', border: `1px solid ${theme.colors.border}`,
                    }}
                  >
                    Recusar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
        {[
          { label: 'Em andamento', value: inProgress.length, color: theme.colors.primary },
          { label: 'Concluidos', value: done.length, color: theme.colors.mint },
          { label: 'Atrasados', value: overdue.length, color: theme.colors.warm },
          { label: 'Equipes', value: teamsCount, color: theme.colors.gold },
          { label: 'A receber', value: fmtBRL(stats.pendingPayment || 0), color: theme.colors.primary, isMoney: true },
        ].map((m, i) => (
          <div key={i} style={{ ...panelStyle, padding: 20 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>{m.label}</div>
            <div className={m.isMoney ? 'mono tnum' : 'display tnum'} style={{
              fontSize: m.isMoney ? 18 : 36, lineHeight: 1, color: theme.colors.text,
            }}>
              {m.value}
            </div>
            <div style={{ height: 3, marginTop: 14, background: theme.colors.bg, borderRadius: 2 }}>
              <div style={{
                height: '100%',
                width: (typeof m.value === 'number' ? m.value : 1) > 0 ? '50%' : 0,
                background: m.color, borderRadius: 2, opacity: 0.6,
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Orders list */}
      <div>
        <h3 className="display" style={{ fontSize: 22, color: theme.colors.text, marginBottom: 14 }}>Seus pedidos</h3>
        {orders.length === 0 ? (
          <div style={{ ...panelStyle, textAlign: 'center', padding: 60, color: theme.colors.textMuted }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>Nenhum pedido atribuido ainda.</div>
            <div style={{ fontSize: 12.5, color: theme.colors.textFaint }}>
              Quando um gestor atribuir um pedido a voce, ele aparecera aqui.
            </div>
          </div>
        ) : (
          <div style={{ ...panelStyle, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: theme.colors.bgSecondary }}>
                  {['Pedido', 'Cliente', 'Equipe', 'Prazo', 'Status', 'Seu valor'].map(h => (
                    <th key={h} className="eyebrow" style={{ padding: '12px 16px', textAlign: 'left', borderBottom: `1px solid ${theme.colors.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map(o => {
                  const d = daysUntil(o.due_date)
                  const overdueRow = d != null && d < 0 && o.column_name !== 'Finalizado'
                  return (
                    <tr key={o.id} className="row-hover" style={{ borderBottom: `1px solid ${theme.colors.borderSoft}` }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {o.priority && o.priority !== 'normal' && (
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY[o.priority]?.color }} />
                          )}
                          <span style={{ fontSize: 13.5, color: theme.colors.text }}>{o.title}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12.5, color: theme.colors.textMuted }}>{o.client_name}</td>
                      <td style={{ padding: '12px 16px', fontSize: 11.5, color: theme.colors.textFaint }}>{o.company_name || '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12 }} className="mono tnum">
                        {o.due_date ? (
                          <span style={{ color: overdueRow ? theme.colors.danger : theme.colors.text }}>
                            {new Date(o.due_date).toLocaleDateString('pt-BR')}
                            {overdueRow && <span style={{ marginLeft: 6, color: theme.colors.danger, fontSize: 11 }}>{Math.abs(d)}d</span>}
                          </span>
                        ) : '—'}
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
                        {o.editor_value > 0 ? <span style={{ color: theme.colors.mint }}>{fmtBRL(o.editor_value, true)}</span> : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `2px solid ${theme.colors.border}` }}>
                  <td colSpan={5} style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: theme.colors.text }}>
                    Total a receber
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600 }} className="mono tnum">
                    <span style={{ color: theme.colors.mint }}>{fmtBRL(orders.reduce((sum, o) => sum + (o.editor_value || 0), 0))}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
