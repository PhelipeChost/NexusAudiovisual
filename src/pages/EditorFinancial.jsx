// src/pages/EditorFinancial.jsx — editor payment history & earnings
import { useState, useEffect } from 'react'
import api from '../api'
import theme from '../styles/theme'
import { Icon, Spinner, panelStyle, fmtBRL } from '../components/ui'

export default function EditorFinancial() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedBatch, setExpandedBatch] = useState(null)

  useEffect(() => {
    api.editorPortal.getFinancial()
      .then(d => setData(d))
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner />

  const { stats, batches, orders, standaloneEntries = [] } = data || { stats: {}, batches: [], orders: [], standaloneEntries: [] }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Header */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>financeiro</div>
        <h2 className="display" style={{ fontSize: 32, color: theme.colors.text, margin: 0 }}>
          Seus recebimentos
        </h2>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {[
          { label: 'Total recebido', value: fmtBRL(stats.totalEarned || 0), color: theme.colors.mint },
          { label: 'Pendente', value: fmtBRL(stats.totalPending || 0), color: theme.colors.warm },
          { label: 'Total atribuido', value: fmtBRL(stats.totalAssigned || 0), color: theme.colors.primary },
          { label: 'Lançamentos avulsos', value: fmtBRL(stats.totalEntries || 0), color: theme.colors.gold },
        ].map((m, i) => (
          <div key={i} style={{ ...panelStyle, padding: 20 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>{m.label}</div>
            <div className={m.isNumber ? 'display tnum' : 'mono tnum'} style={{
              fontSize: m.isNumber ? 32 : 20, lineHeight: 1, color: m.color,
            }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Payment batches */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Historico de pagamentos</div>
        {batches.length === 0 ? (
          <div style={{ ...panelStyle, padding: 40, textAlign: 'center', color: theme.colors.textMuted, fontSize: 13 }}>
            Nenhum pagamento registrado ainda.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {batches.map(batch => (
              <div key={batch.id} style={{ ...panelStyle, overflow: 'hidden' }}>
                <div
                  onClick={() => setExpandedBatch(expandedBatch === batch.id ? null : batch.id)}
                  className="row-hover"
                  style={{
                    padding: '16px 20px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 16,
                  }}
                >
                  <Icon name={expandedBatch === batch.id ? 'chevronDown' : 'arrowRight'} size={12} stroke color={theme.colors.textMuted} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: theme.colors.text }}>
                      Lote #{batch.id}
                      <span style={{ marginLeft: 8, fontSize: 11, color: theme.colors.textMuted }}>
                        {batch.company_name}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 2 }}>
                      {new Date(batch.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                      {(batch.items?.length > 0 || batch.entries?.length > 0) && ` · ${(batch.items?.length || 0) + (batch.entries?.length || 0)} item(ns)`}
                    </div>
                  </div>
                  <span style={{
                    padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                    background: batch.status === 'paid' ? 'rgba(0,210,150,0.12)' : 'rgba(255,183,77,0.12)',
                    color: batch.status === 'paid' ? theme.colors.mint : theme.colors.warm,
                    fontFamily: theme.fonts.mono, textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>
                    {batch.status === 'paid' ? 'pago' : 'pendente'}
                  </span>
                  <span className="mono tnum" style={{ fontSize: 14, fontWeight: 600, color: theme.colors.text }}>
                    {fmtBRL(batch.total_amount)}
                  </span>
                </div>

                {/* Expanded */}
                {expandedBatch === batch.id && (
                  <div style={{ borderTop: `1px solid ${theme.colors.border}`, padding: '16px 20px', background: theme.colors.bg }}>
                    {batch.status === 'paid' && batch.paid_at && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                        <Icon name="check" size={13} color={theme.colors.mint} />
                        <span style={{ fontSize: 12, color: theme.colors.mint }}>
                          Pago em {new Date(batch.paid_at).toLocaleDateString('pt-BR')}
                        </span>
                        {batch.proof_url && (
                          <a href={batch.proof_url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 11.5, color: theme.colors.primary, marginLeft: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Icon name="link" size={11} stroke />
                            Ver comprovante
                          </a>
                        )}
                      </div>
                    )}
                    {batch.notes && (
                      <div style={{ marginBottom: 12, padding: 10, background: theme.colors.bgSecondary, borderRadius: 8, border: `1px solid ${theme.colors.border}` }}>
                        <div className="eyebrow" style={{ marginBottom: 4 }}>Observacoes</div>
                        <div style={{ fontSize: 12.5, color: theme.colors.textSecondary }}>{batch.notes}</div>
                      </div>
                    )}
                    {((batch.items && batch.items.length > 0) || (batch.entries && batch.entries.length > 0)) && (
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th className="eyebrow" style={{ padding: '8px 12px', textAlign: 'left', borderBottom: `1px solid ${theme.colors.border}` }}>Descrição</th>
                            <th className="eyebrow" style={{ padding: '8px 12px', textAlign: 'center', borderBottom: `1px solid ${theme.colors.border}`, width: 80 }}>Tipo</th>
                            <th className="eyebrow" style={{ padding: '8px 12px', textAlign: 'right', borderBottom: `1px solid ${theme.colors.border}` }}>Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(batch.items || []).map((item, idx) => (
                            <tr key={`o-${idx}`} style={{ borderBottom: `1px solid ${theme.colors.borderSoft}` }}>
                              <td style={{ padding: '10px 12px', fontSize: 13, color: theme.colors.text }}>{item.order_title}</td>
                              <td style={{ padding: '10px 12px', fontSize: 11, textAlign: 'center' }}>
                                <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(100,149,237,0.12)', color: '#6495ed', fontWeight: 500 }}>Trabalho</span>
                              </td>
                              <td style={{ padding: '10px 12px', fontSize: 13, textAlign: 'right' }} className="mono tnum">
                                <span style={{ color: theme.colors.mint }}>{fmtBRL(item.amount)}</span>
                              </td>
                            </tr>
                          ))}
                          {(batch.entries || []).map((entry, idx) => (
                            <tr key={`e-${idx}`} style={{ borderBottom: `1px solid ${theme.colors.borderSoft}` }}>
                              <td style={{ padding: '10px 12px', fontSize: 13, color: theme.colors.text }}>{entry.description}</td>
                              <td style={{ padding: '10px 12px', fontSize: 11, textAlign: 'center' }}>
                                <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(255,165,0,0.12)', color: theme.colors.warm, fontWeight: 500 }}>Avulso</span>
                              </td>
                              <td style={{ padding: '10px 12px', fontSize: 13, textAlign: 'right' }} className="mono tnum">
                                <span style={{ color: theme.colors.warm }}>{fmtBRL(entry.amount)}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Standalone entries */}
      {standaloneEntries.filter(e => e.entry_status === 'pending').length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Lançamentos avulsos pendentes</div>
          <div style={{ ...panelStyle, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: theme.colors.bgSecondary }}>
                  {['Descrição', 'Equipe', 'Data', 'Valor'].map(h => (
                    <th key={h} className="eyebrow" style={{ padding: '12px 14px', textAlign: 'left', borderBottom: `1px solid ${theme.colors.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {standaloneEntries.filter(e => e.entry_status === 'pending').map(e => (
                  <tr key={e.id} style={{ borderBottom: `1px solid ${theme.colors.borderSoft}` }}>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: theme.colors.text }}>{e.description}</td>
                    <td style={{ padding: '12px 14px', fontSize: 11.5, color: theme.colors.textFaint }}>{e.company_name}</td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: theme.colors.textMuted }}>
                      {e.entry_date ? new Date(e.entry_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13 }} className="mono tnum">
                      <span style={{ color: theme.colors.warm, fontWeight: 500 }}>{fmtBRL(e.amount)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Orders with values */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Pedidos com valor atribuido</div>
        <div style={{ ...panelStyle, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: theme.colors.bgSecondary }}>
                {['Pedido', 'Cliente', 'Equipe', 'Status', 'Valor'].map(h => (
                  <th key={h} className="eyebrow" style={{ padding: '12px 14px', textAlign: 'left', borderBottom: `1px solid ${theme.colors.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.filter(o => o.editor_value > 0).map(o => (
                <tr key={o.id} style={{ borderBottom: `1px solid ${theme.colors.borderSoft}` }}>
                  <td style={{ padding: '12px 14px', fontSize: 13, color: theme.colors.text }}>{o.title}</td>
                  <td style={{ padding: '12px 14px', fontSize: 12, color: theme.colors.textMuted }}>{o.client_name}</td>
                  <td style={{ padding: '12px 14px', fontSize: 11.5, color: theme.colors.textFaint }}>{o.company_name}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 10.5, fontWeight: 500,
                      background: o.column_name === 'Finalizado' ? 'rgba(0,210,150,0.12)' : theme.colors.bgSecondary,
                      color: o.column_name === 'Finalizado' ? theme.colors.mint : theme.colors.textMuted,
                    }}>
                      {o.column_name}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 13 }} className="mono tnum">
                    <span style={{ color: theme.colors.mint, fontWeight: 500 }}>{fmtBRL(o.editor_value)}</span>
                  </td>
                </tr>
              ))}
              {orders.filter(o => o.editor_value > 0).length === 0 && (
                <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: theme.colors.textMuted, fontSize: 13 }}>Nenhum pedido com valor</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
