// src/pages/EditorMyReport.jsx — editor individual performance report
import { useState, useEffect } from 'react'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import theme from '../styles/theme'
import { Icon, Spinner, panelStyle, fmtBRL } from '../components/ui'

export default function EditorMyReport() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.editorPortal.getMyReport()
      .then(d => setData(d))
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner />
  if (!data) return null

  const { total, completed, onTime, late, inProgress, overdue, totalValue, onTimeRate, months } = data
  const maxCompleted = Math.max(...months.map(m => m.completed), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Header */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>desempenho pessoal</div>
        <h2 className="display" style={{ fontSize: 32, color: theme.colors.text, margin: 0 }}>
          Seu relatorio, {user?.name?.split(' ')[0]}.
        </h2>
      </div>

      {/* Main KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {[
          { label: 'Total pedidos', value: total, color: theme.colors.text },
          { label: 'Concluidos', value: completed, color: theme.colors.mint },
          { label: 'Em andamento', value: inProgress, color: theme.colors.primary },
          { label: 'Atrasados', value: overdue, color: theme.colors.danger },
        ].map((m, i) => (
          <div key={i} style={{ ...panelStyle, padding: 20 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>{m.label}</div>
            <div className="display tnum" style={{ fontSize: 36, lineHeight: 1, color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Performance gauge */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <div style={{ ...panelStyle, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div className="eyebrow">Taxa no prazo</div>
          <div style={{ position: 'relative', width: 100, height: 100 }}>
            <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="50" cy="50" r="40" fill="none" stroke={theme.colors.bg} strokeWidth="10" />
              <circle cx="50" cy="50" r="40" fill="none"
                stroke={onTimeRate >= 80 ? theme.colors.mint : onTimeRate >= 50 ? theme.colors.warm : theme.colors.danger}
                strokeWidth="10" strokeDasharray={`${onTimeRate * 2.51} 251`} strokeLinecap="round" />
            </svg>
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 700, color: theme.colors.text, fontFamily: theme.fonts.mono,
            }}>
              {onTimeRate}%
            </div>
          </div>
          <div style={{ fontSize: 12, color: theme.colors.textMuted }}>{onTime} de {completed} no prazo</div>
        </div>

        <div style={{ ...panelStyle, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div className="eyebrow">Entregas atrasadas</div>
          <div className="display tnum" style={{ fontSize: 48, color: late > 0 ? theme.colors.danger : theme.colors.mint }}>
            {late}
          </div>
          <div style={{ fontSize: 12, color: theme.colors.textMuted }}>
            {late === 0 ? 'Nenhuma entrega atrasada!' : `${late} entrega${late !== 1 ? 's' : ''} fora do prazo`}
          </div>
        </div>

        <div style={{ ...panelStyle, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div className="eyebrow">Total faturado</div>
          <div className="mono tnum" style={{ fontSize: 24, color: theme.colors.mint, fontWeight: 600 }}>
            {fmtBRL(totalValue)}
          </div>
          <div style={{ fontSize: 12, color: theme.colors.textMuted }}>
            Soma de todos os pedidos atribuidos
          </div>
        </div>
      </div>

      {/* Monthly chart */}
      <div style={{ ...panelStyle, padding: 24 }}>
        <div className="eyebrow" style={{ marginBottom: 20 }}>Evolucao mensal (ultimos 6 meses)</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 160 }}>
          {months.map((m, i) => {
            const h = maxCompleted > 0 ? (m.completed / maxCompleted) * 130 : 0
            const [y, mo] = m.month.split('-')
            const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div className="mono tnum" style={{ fontSize: 11, color: theme.colors.text, fontWeight: 500 }}>
                  {m.completed}
                </div>
                <div style={{
                  width: '100%', maxWidth: 48, height: Math.max(h, 4), borderRadius: 6,
                  background: `linear-gradient(180deg, ${theme.colors.primary}, ${theme.colors.mint})`,
                  opacity: m.completed > 0 ? 0.8 : 0.15,
                  transition: 'height 0.3s ease',
                }} />
                <div style={{ fontSize: 10, color: theme.colors.textMuted, textAlign: 'center' }}>
                  {monthNames[Number(mo) - 1]}
                </div>
                {m.value > 0 && (
                  <div className="mono" style={{ fontSize: 9, color: theme.colors.mint }}>
                    {fmtBRL(m.value, true)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
