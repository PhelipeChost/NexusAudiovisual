// src/pages/EditorReport.jsx — relatorio de desempenho por editor
import { useState, useEffect } from 'react'
import api from '../api'
import theme from '../styles/theme'
import { Icon, Avatar, Spinner, panelStyle, fmtBRL } from '../components/ui'

export default function EditorReport() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const d = await api.reports.editors()
        setData(d)
      } catch (err) { console.error(err) } finally { setLoading(false) }
    }
    load()
  }, [])

  if (loading) return <Spinner />

  const editors = data?.editors || []

  if (editors.length === 0) {
    return (
      <div style={{ ...panelStyle, padding: 60, textAlign: 'center', color: theme.colors.textMuted }}>
        <div style={{ fontSize: 14, marginBottom: 8 }}>Nenhum editor com pedidos encontrado.</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>desempenho</div>
        <h2 className="display" style={{ fontSize: 32, color: theme.colors.text, margin: 0 }}>
          Relatorio de editores
        </h2>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {[
          { label: 'Total editores', value: editors.length, color: theme.colors.primary },
          { label: 'Pedidos atribuidos', value: editors.reduce((s, e) => s + e.total, 0), color: theme.colors.text },
          { label: 'Concluidos', value: editors.reduce((s, e) => s + e.completed, 0), color: theme.colors.mint },
          { label: 'Atrasados', value: editors.reduce((s, e) => s + e.overdue, 0), color: theme.colors.danger },
        ].map((m, i) => (
          <div key={i} style={{ ...panelStyle, padding: 20 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>{m.label}</div>
            <div className="display tnum" style={{ fontSize: 32, lineHeight: 1, color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Editor table */}
      <div style={{ ...panelStyle, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: theme.colors.bgSecondary }}>
              {['Editor', 'Total', 'Em progresso', 'Concluidos', 'No prazo', 'Atrasados', 'Em atraso', 'Valor total'].map(h => (
                <th key={h} className="eyebrow" style={{
                  padding: '12px 14px', textAlign: 'left',
                  borderBottom: `1px solid ${theme.colors.border}`,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {editors.sort((a, b) => b.completed - a.completed).map(ed => {
              const rate = ed.completed > 0 ? Math.round((ed.onTime / ed.completed) * 100) : 0
              return (
                <tr key={ed.id} style={{ borderBottom: `1px solid ${theme.colors.borderSoft}` }}>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={ed.name} size={28} src={ed.avatar || undefined} />
                      <span style={{ fontSize: 13.5, fontWeight: 500, color: theme.colors.text }}>{ed.name}</span>
                    </div>
                  </td>
                  <td className="mono tnum" style={{ padding: '12px 14px', fontSize: 13, color: theme.colors.text }}>{ed.total}</td>
                  <td className="mono tnum" style={{ padding: '12px 14px', fontSize: 13, color: theme.colors.warm }}>{ed.inProgress}</td>
                  <td className="mono tnum" style={{ padding: '12px 14px', fontSize: 13, color: theme.colors.mint }}>{ed.completed}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="mono tnum" style={{ fontSize: 13, color: theme.colors.mint }}>{ed.onTime}</span>
                      <span style={{
                        fontSize: 10, padding: '1px 5px', borderRadius: 3,
                        background: rate >= 80 ? 'rgba(0,210,150,0.12)' : rate >= 50 ? 'rgba(255,183,77,0.12)' : 'rgba(244,115,131,0.12)',
                        color: rate >= 80 ? theme.colors.mint : rate >= 50 ? theme.colors.warm : theme.colors.danger,
                        fontFamily: theme.fonts.mono, fontWeight: 600,
                      }}>
                        {rate}%
                      </span>
                    </div>
                  </td>
                  <td className="mono tnum" style={{ padding: '12px 14px', fontSize: 13, color: ed.late > 0 ? theme.colors.danger : theme.colors.textFaint }}>{ed.late}</td>
                  <td className="mono tnum" style={{ padding: '12px 14px', fontSize: 13, color: ed.overdue > 0 ? theme.colors.danger : theme.colors.textFaint }}>{ed.overdue}</td>
                  <td className="mono tnum" style={{ padding: '12px 14px', fontSize: 13, color: theme.colors.mint, fontWeight: 500 }}>
                    {ed.totalValue > 0 ? fmtBRL(ed.totalValue) : '---'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
