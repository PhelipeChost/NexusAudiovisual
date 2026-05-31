// src/pages/PersonalFinance.jsx — Painel Financeiro Pessoal
import { useState, useEffect, useMemo } from 'react'
import api from '../api'
import theme from '../styles/theme'
import Modal from '../components/Modal'
import {
  Icon, Spinner, Field,
  inputStyle, btnPrimary, btnSoft, panelStyle, fmtBRL,
} from '../components/ui'
import useIsMobile from '../hooks/useIsMobile'

const CATEGORY_META = {
  necessidade: { label: 'Necessidades', color: theme.colors.primary, icon: 'briefcase', pct: 50 },
  desejo:      { label: 'Desejos',       color: theme.colors.gold,    icon: 'film',      pct: 30 },
  economia:    { label: 'Economias',     color: theme.colors.mint,    icon: 'financial',  pct: 20 },
}

const INCOME_SOURCES = ['Edição', 'Freelance', 'Salário', 'Investimento', 'Outro']

export default function PersonalFinance() {
  const isMobile = useIsMobile()
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showIncomeModal, setShowIncomeModal] = useState(false)
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [expenseCategory, setExpenseCategory] = useState('necessidade')
  const [incomeForm, setIncomeForm] = useState({ source: 'Edição', amount: '', description: '', entry_date: '' })
  const [expenseForm, setExpenseForm] = useState({ name: '', amount: '', due_day: '', entry_date: '' })
  const [activeTab, setActiveTab] = useState('resumo') // resumo, entradas, saidas

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    try {
      const d = await api.personalFinance.get(month)
      setData(d)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateIncome(e) {
    e.preventDefault()
    try {
      await api.personalFinance.createIncome({
        ...incomeForm,
        entry_date: incomeForm.entry_date || undefined,
      })
      setShowIncomeModal(false)
      setIncomeForm({ source: 'Edição', amount: '', description: '', entry_date: '' })
      load()
    } catch (err) { alert(err.message) }
  }

  async function handleCreateExpense(e) {
    e.preventDefault()
    try {
      await api.personalFinance.createExpense({
        ...expenseForm,
        category: expenseCategory,
        due_day: expenseForm.due_day ? parseInt(expenseForm.due_day) : undefined,
        entry_date: expenseForm.entry_date || undefined,
      })
      setShowExpenseModal(false)
      setExpenseForm({ name: '', amount: '', due_day: '', entry_date: '' })
      load()
    } catch (err) { alert(err.message) }
  }

  async function handleToggleExpense(id) {
    try {
      await api.personalFinance.toggleExpense(id)
      load()
    } catch (err) { alert(err.message) }
  }

  async function handleDeleteIncome(id) {
    if (!confirm('Remover esta entrada?')) return
    try {
      await api.personalFinance.deleteIncome(id)
      load()
    } catch (err) { alert(err.message) }
  }

  async function handleDeleteExpense(id) {
    if (!confirm('Remover esta despesa?')) return
    try {
      await api.personalFinance.deleteExpense(id)
      load()
    } catch (err) { alert(err.message) }
  }

  function changeMonth(delta) {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-')
    const d = new Date(parseInt(y), parseInt(m) - 1)
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  }, [month])

  if (loading && !data) return <Spinner />

  const {
    totalIncome = 0, totalPlatformIncome = 0, totalManualIncome = 0,
    totalExpenses = 0, totalNecessidade = 0, totalDesejo = 0, totalEconomia = 0,
    balance = 0, totalPendingPlatform = 0,
    platformIncome = [], legacyPayments = [], pendingPlatformWork = [],
    incomeEntries = [], expensesByCategory = {},
  } = data || {}

  const idealNecessidade = totalIncome * 0.5
  const idealDesejo = totalIncome * 0.3
  const idealEconomia = totalIncome * 0.2

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 16 : 24 }}>
      {/* Header */}
      <div style={{
        display: 'flex', flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: 'space-between', gap: isMobile ? 12 : 16,
      }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Painel pessoal</div>
          <h2 className="display" style={{
            fontSize: isMobile ? 22 : 32, margin: 0, color: theme.colors.text,
            lineHeight: 1.1, letterSpacing: '-0.02em',
          }}>
            Financeiro Pessoal
          </h2>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          flexWrap: isMobile ? 'wrap' : 'nowrap',
        }}>
          {/* Month navigation */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: theme.colors.bgSecondary,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: 8, padding: 2,
          }}>
            <button onClick={() => changeMonth(-1)} style={{
              width: 32, height: 32, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: theme.colors.textMuted,
            }}>
              <Icon name="chevronLeft" size={16} />
            </button>
            <span className="display" style={{
              fontSize: 13, padding: '0 8px', color: theme.colors.text,
              textTransform: 'capitalize', minWidth: isMobile ? 100 : 140, textAlign: 'center',
            }}>
              {monthLabel}
            </span>
            <button onClick={() => changeMonth(1)} style={{
              width: 32, height: 32, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: theme.colors.textMuted,
            }}>
              <Icon name="chevronRight" size={16} />
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button style={{ ...btnSoft, ...(isMobile ? { flex: 1, justifyContent: 'center' } : {}) }}
              onClick={() => setShowIncomeModal(true)}>
              <Icon name="arrowUp" size={14} />
              Entrada
            </button>
            <button style={{ ...btnPrimary, ...(isMobile ? { flex: 1, justifyContent: 'center' } : {}) }}
              onClick={() => { setExpenseCategory('necessidade'); setShowExpenseModal(true) }}>
              <Icon name="arrowDown" size={14} />
              Despesa
            </button>
          </div>
        </div>
      </div>

      {/* Mobile tab bar */}
      {isMobile && (
        <div style={{
          display: 'flex', gap: 4,
          background: theme.colors.bgSecondary,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: 8, padding: 3,
        }}>
          {[
            { id: 'resumo', label: 'Resumo' },
            { id: 'entradas', label: 'Entradas' },
            { id: 'saidas', label: 'Saídas' },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              flex: 1, padding: '8px 0', fontSize: 12, fontWeight: activeTab === t.id ? 600 : 400,
              borderRadius: 6, textAlign: 'center',
              color: activeTab === t.id ? theme.colors.text : theme.colors.textMuted,
              background: activeTab === t.id ? theme.colors.surfaceHover : 'transparent',
            }}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Overview hero cards */}
      {(!isMobile || activeTab === 'resumo') && (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
            gap: isMobile ? 8 : 14,
          }}>
            {/* Total income */}
            <div style={{ ...panelStyle, padding: isMobile ? 14 : 20 }}>
              <div className="eyebrow" style={{ fontSize: isMobile ? 9 : 11, marginBottom: isMobile ? 8 : 14 }}>
                Receita total
              </div>
              <div className="display tnum" style={{
                fontSize: isMobile ? 20 : 32, lineHeight: 1, letterSpacing: '-0.02em',
                color: theme.colors.mint,
              }}>
                <span style={{ fontSize: isMobile ? 10 : 16, color: theme.colors.textMuted, marginRight: 2 }}>R$</span>
                {Number(totalIncome).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
              <div style={{ height: 3, marginTop: isMobile ? 8 : 14, background: theme.colors.bg, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '100%', background: theme.colors.mint, opacity: 0.5 }} />
              </div>
            </div>

            {/* Total expenses */}
            <div style={{ ...panelStyle, padding: isMobile ? 14 : 20 }}>
              <div className="eyebrow" style={{ fontSize: isMobile ? 9 : 11, marginBottom: isMobile ? 8 : 14 }}>
                Despesas totais
              </div>
              <div className="display tnum" style={{
                fontSize: isMobile ? 20 : 32, lineHeight: 1, letterSpacing: '-0.02em',
                color: theme.colors.warm,
              }}>
                <span style={{ fontSize: isMobile ? 10 : 16, color: theme.colors.textMuted, marginRight: 2 }}>R$</span>
                {Number(totalExpenses).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
              <div style={{ height: 3, marginTop: isMobile ? 8 : 14, background: theme.colors.bg, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: totalIncome > 0 ? `${Math.min((totalExpenses / totalIncome) * 100, 100)}%` : '0%', background: theme.colors.warm, opacity: 0.5 }} />
              </div>
            </div>

            {/* Balance */}
            <div style={{ ...panelStyle, padding: isMobile ? 14 : 20 }}>
              <div className="eyebrow" style={{ fontSize: isMobile ? 9 : 11, marginBottom: isMobile ? 8 : 14 }}>
                Saldo
              </div>
              <div className="display tnum" style={{
                fontSize: isMobile ? 20 : 32, lineHeight: 1, letterSpacing: '-0.02em',
                color: balance >= 0 ? theme.colors.mint : theme.colors.danger,
              }}>
                <span style={{ fontSize: isMobile ? 10 : 16, color: theme.colors.textMuted, marginRight: 2 }}>R$</span>
                {Number(balance).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
              <div style={{ height: 3, marginTop: isMobile ? 8 : 14, background: theme.colors.bg, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: balance >= 0 ? '100%' : '0%', background: balance >= 0 ? theme.colors.primary : theme.colors.danger, opacity: 0.5 }} />
              </div>
            </div>

            {/* Use percentage */}
            <div style={{ ...panelStyle, padding: isMobile ? 14 : 20 }}>
              <div className="eyebrow" style={{ fontSize: isMobile ? 9 : 11, marginBottom: isMobile ? 8 : 14 }}>
                Comprometido
              </div>
              <div className="display tnum" style={{
                fontSize: isMobile ? 20 : 32, lineHeight: 1, letterSpacing: '-0.02em',
                color: theme.colors.text,
              }}>
                {totalIncome > 0 ? Math.round((totalExpenses / totalIncome) * 100) : 0}
                <span style={{ fontSize: isMobile ? 12 : 18, color: theme.colors.textMuted }}>%</span>
              </div>
              <div style={{ height: 3, marginTop: isMobile ? 8 : 14, background: theme.colors.bg, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: totalIncome > 0 ? `${Math.min((totalExpenses / totalIncome) * 100, 100)}%` : '0%', background: theme.colors.gold, opacity: 0.5 }} />
              </div>
            </div>
          </div>

          {/* 50/30/20 rule breakdown */}
          <div style={{ ...panelStyle, padding: isMobile ? 16 : 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: isMobile ? 14 : 20 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 4 }}>Regra 50/30/20</div>
                <h3 className="display" style={{ fontSize: isMobile ? 18 : 22, margin: 0, color: theme.colors.text }}>
                  Distribuicao de gastos
                </h3>
              </div>
            </div>

            {/* Stacked bar */}
            {totalExpenses > 0 && (
              <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: isMobile ? 16 : 24, gap: 2 }}>
                {totalNecessidade > 0 && (
                  <div style={{ flex: totalNecessidade, background: CATEGORY_META.necessidade.color, opacity: 0.85 }} />
                )}
                {totalDesejo > 0 && (
                  <div style={{ flex: totalDesejo, background: CATEGORY_META.desejo.color, opacity: 0.85 }} />
                )}
                {totalEconomia > 0 && (
                  <div style={{ flex: totalEconomia, background: CATEGORY_META.economia.color, opacity: 0.85 }} />
                )}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: isMobile ? 12 : 20 }}>
              {Object.entries(CATEGORY_META).map(([key, meta]) => {
                const spent = key === 'necessidade' ? totalNecessidade : key === 'desejo' ? totalDesejo : totalEconomia
                const ideal = key === 'necessidade' ? idealNecessidade : key === 'desejo' ? idealDesejo : idealEconomia
                const pctOfIncome = totalIncome > 0 ? Math.round((spent / totalIncome) * 100) : 0
                const overBudget = ideal > 0 && spent > ideal

                return (
                  <div key={key} style={{
                    borderTop: `3px solid ${meta.color}`,
                    paddingTop: 16,
                    ...(isMobile ? { paddingBottom: 12, borderBottom: `1px solid ${theme.colors.borderSoft}` } : {}),
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Icon name={meta.icon} size={16} color={meta.color} />
                        <span style={{ fontSize: 14, fontWeight: 500, color: theme.colors.text }}>{meta.label}</span>
                      </div>
                      <span className="eyebrow" style={{ color: meta.color }}>
                        {meta.pct}% ideal
                      </span>
                    </div>

                    <div className="display tnum" style={{ fontSize: isMobile ? 22 : 28, lineHeight: 1, color: theme.colors.text, marginBottom: 8 }}>
                      <span style={{ fontSize: isMobile ? 12 : 14, color: theme.colors.textMuted }}>R$ </span>
                      {Number(spent).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span className="mono tnum" style={{ fontSize: 11, color: theme.colors.textMuted }}>
                        {pctOfIncome}% da receita
                      </span>
                      {totalIncome > 0 && (
                        <span className="mono tnum" style={{
                          fontSize: 11,
                          color: overBudget ? theme.colors.warm : theme.colors.mint,
                        }}>
                          {overBudget ? '+' : ''}{fmtBRL(spent - ideal)} {overBudget ? 'acima' : 'restante'}
                        </span>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div style={{ height: 4, background: theme.colors.bg, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: ideal > 0 ? `${Math.min((spent / ideal) * 100, 100)}%` : '0%',
                        background: overBudget ? theme.colors.warm : meta.color,
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Two-column: Income + Expenses */}
      {(!isMobile || activeTab !== 'resumo') && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1.5fr',
          gap: isMobile ? 16 : 20,
        }}>
          {/* Income panel */}
          {(!isMobile || activeTab === 'entradas') && (
            <div style={{ ...panelStyle, padding: isMobile ? 16 : 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 4 }}>Entradas</div>
                  <h3 className="display" style={{ fontSize: isMobile ? 18 : 20, margin: 0, color: theme.colors.text }}>
                    {fmtBRL(totalIncome)}
                  </h3>
                </div>
                <button style={btnSoft} onClick={() => setShowIncomeModal(true)}>
                  <Icon name="plus" size={14} />
                </button>
              </div>

              {/* Platform income — PAID batches only */}
              {(platformIncome.length > 0 || legacyPayments.length > 0) && (
                <div style={{ marginBottom: 16 }}>
                  <div className="eyebrow" style={{ marginBottom: 10, color: theme.colors.mint }}>
                    Recebido da plataforma ({fmtBRL(totalPlatformIncome)})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {platformIncome.map(b => (
                      <div key={`batch-${b.batch_id}`} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 12px', borderRadius: 8,
                        background: theme.colors.mintMuted,
                      }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, color: theme.colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {b.order_titles || 'Lote de pagamento'}
                          </div>
                          <div style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 2 }}>
                            {b.client_names}{b.company_names ? ` · ${b.company_names}` : ''}
                            {b.paid_at && ` · ${new Date(b.paid_at).toLocaleDateString('pt-BR')}`}
                          </div>
                        </div>
                        <span className="mono tnum" style={{ fontSize: 13, color: theme.colors.mint, fontWeight: 600, marginLeft: 8 }}>
                          {fmtBRL(b.total_amount)}
                        </span>
                      </div>
                    ))}
                    {legacyPayments.map(p => (
                      <div key={`pay-${p.id}`} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 12px', borderRadius: 8,
                        background: theme.colors.mintMuted,
                      }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, color: theme.colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.order_title || p.notes || 'Pagamento'}
                          </div>
                          <div style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 2 }}>
                            {p.client_name}{p.company_name ? ` · ${p.company_name}` : ''}
                            {p.paid_at && ` · ${new Date(p.paid_at).toLocaleDateString('pt-BR')}`}
                          </div>
                        </div>
                        <span className="mono tnum" style={{ fontSize: 13, color: theme.colors.mint, fontWeight: 600, marginLeft: 8 }}>
                          {fmtBRL(p.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending platform work — NOT counted as income */}
              {pendingPlatformWork.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div className="eyebrow" style={{ marginBottom: 10, color: theme.colors.gold }}>
                    Pendente de pagamento ({fmtBRL(totalPendingPlatform)})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {pendingPlatformWork.map(o => (
                      <div key={o.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 12px', borderRadius: 8,
                        background: theme.colors.goldMuted,
                        opacity: 0.7,
                      }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, color: theme.colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {o.title}
                          </div>
                          <div style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 2 }}>
                            {o.client_name}{o.company_name ? ` · ${o.company_name}` : ''} · aguardando comprovante
                          </div>
                        </div>
                        <span className="mono tnum" style={{ fontSize: 13, color: theme.colors.gold, fontWeight: 600, marginLeft: 8 }}>
                          {fmtBRL(o.editor_value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Manual income entries */}
              {incomeEntries.length > 0 && (
                <div>
                  <div className="eyebrow" style={{ marginBottom: 10, color: theme.colors.mint }}>
                    Entradas manuais ({fmtBRL(totalManualIncome)})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {incomeEntries.map(e => (
                      <div key={e.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 12px', borderRadius: 8,
                        background: theme.colors.mintMuted,
                      }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, color: theme.colors.text }}>
                            {e.source}
                            {e.recurring ? <span style={{ fontSize: 10, color: theme.colors.textMuted, marginLeft: 6 }}>recorrente</span> : null}
                          </div>
                          {e.description && (
                            <div style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 2 }}>{e.description}</div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="mono tnum" style={{ fontSize: 13, color: theme.colors.mint, fontWeight: 600 }}>
                            {fmtBRL(e.amount)}
                          </span>
                          <button onClick={() => handleDeleteIncome(e.id)} style={{ padding: 4, color: theme.colors.textFaint }}>
                            <Icon name="x" size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {platformIncome.length === 0 && legacyPayments.length === 0 && pendingPlatformWork.length === 0 && incomeEntries.length === 0 && (
                <div style={{ textAlign: 'center', padding: 32, color: theme.colors.textMuted, fontSize: 13 }}>
                  Nenhuma entrada este mes.
                  <br />
                  <button onClick={() => setShowIncomeModal(true)} style={{ color: theme.colors.primary, marginTop: 8, fontSize: 13 }}>
                    Adicionar entrada
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Expenses panel */}
          {(!isMobile || activeTab === 'saidas') && (
            <div style={{ ...panelStyle, padding: isMobile ? 16 : 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 4 }}>Saidas</div>
                  <h3 className="display" style={{ fontSize: isMobile ? 18 : 20, margin: 0, color: theme.colors.text }}>
                    {fmtBRL(totalExpenses)}
                  </h3>
                </div>
                <button style={btnSoft} onClick={() => { setExpenseCategory('necessidade'); setShowExpenseModal(true) }}>
                  <Icon name="plus" size={14} />
                </button>
              </div>

              {Object.entries(CATEGORY_META).map(([cat, meta]) => {
                const items = expensesByCategory[cat] || []
                const catTotal = items.reduce((s, e) => s + (e.amount || 0), 0)
                const paidCount = items.filter(e => e.paid).length

                return (
                  <div key={cat} style={{ marginBottom: 20 }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      marginBottom: 10, paddingBottom: 8,
                      borderBottom: `2px solid ${meta.color}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Icon name={meta.icon} size={15} color={meta.color} />
                        <span style={{ fontSize: 14, fontWeight: 600, color: theme.colors.text }}>
                          {meta.label}
                        </span>
                        {items.length > 0 && (
                          <span className="mono tnum" style={{ fontSize: 11, color: theme.colors.textMuted }}>
                            ({paidCount}/{items.length} pagas)
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="mono tnum" style={{ fontSize: 13, fontWeight: 600, color: meta.color }}>
                          {fmtBRL(catTotal)}
                        </span>
                        <button onClick={() => { setExpenseCategory(cat); setShowExpenseModal(true) }}
                          style={{ padding: 4, color: theme.colors.textFaint }}>
                          <Icon name="plus" size={14} />
                        </button>
                      </div>
                    </div>

                    {items.length === 0 ? (
                      <div style={{ fontSize: 12, color: theme.colors.textMuted, padding: '8px 0' }}>
                        Nenhuma despesa registrada
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {items.map(exp => (
                          <div key={exp.id} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '9px 10px', borderRadius: 8,
                            background: exp.paid ? 'transparent' : `${meta.color}08`,
                            opacity: exp.paid ? 0.6 : 1,
                          }}>
                            {/* Toggle paid */}
                            <button onClick={() => handleToggleExpense(exp.id)} style={{
                              width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                              border: `2px solid ${exp.paid ? meta.color : theme.colors.border}`,
                              background: exp.paid ? meta.color : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer',
                            }}>
                              {exp.paid && <Icon name="check" size={12} color={theme.colors.bg} />}
                            </button>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontSize: 13, color: theme.colors.text,
                                textDecoration: exp.paid ? 'line-through' : 'none',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                                {exp.name}
                              </div>
                              {exp.due_day && (
                                <div style={{ fontSize: 10, color: theme.colors.textMuted, marginTop: 1 }}>
                                  Vence dia {exp.due_day}
                                </div>
                              )}
                            </div>

                            <span className="mono tnum" style={{
                              fontSize: 13, fontWeight: 500,
                              color: exp.paid ? theme.colors.textMuted : theme.colors.text,
                            }}>
                              {fmtBRL(exp.amount)}
                            </span>

                            <button onClick={() => handleDeleteExpense(exp.id)}
                              style={{ padding: 4, color: theme.colors.textFaint, flexShrink: 0 }}>
                              <Icon name="x" size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Desktop: always show income + expenses below */}
      {!isMobile && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 14,
        }}>
          {/* Income sources breakdown */}
          <div style={{ ...panelStyle, padding: 20 }}>
            <div className="eyebrow" style={{ marginBottom: 14 }}>Fontes de receita</div>
            {(() => {
              // Group income by source
              const sources = {}
              for (const b of platformIncome) {
                const key = 'Plataforma'
                sources[key] = (sources[key] || 0) + (b.total_amount || 0)
              }
              for (const p of legacyPayments) {
                const key = 'Plataforma'
                sources[key] = (sources[key] || 0) + (p.amount || 0)
              }
              for (const e of incomeEntries) {
                sources[e.source] = (sources[e.source] || 0) + (e.amount || 0)
              }
              const entries = Object.entries(sources).sort((a, b) => b[1] - a[1])
              if (entries.length === 0) {
                return <div style={{ fontSize: 12, color: theme.colors.textMuted, padding: '12px 0' }}>Sem dados</div>
              }
              const maxVal = Math.max(...entries.map(e => e[1]))
              return entries.map(([source, amount]) => (
                <div key={source} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span style={{ color: theme.colors.textSecondary }}>{source}</span>
                    <span className="mono tnum" style={{ color: theme.colors.text }}>{fmtBRL(amount)}</span>
                  </div>
                  <div style={{ height: 4, background: theme.colors.bg, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(amount / maxVal) * 100}%`, background: theme.colors.mint }} />
                  </div>
                </div>
              ))
            })()}
          </div>

          {/* Expenses paid vs pending */}
          <div style={{ ...panelStyle, padding: 20 }}>
            <div className="eyebrow" style={{ marginBottom: 14 }}>Status das despesas</div>
            {(() => {
              const allExpenses = [...(expensesByCategory.necessidade || []), ...(expensesByCategory.desejo || []), ...(expensesByCategory.economia || [])]
              const paidTotal = allExpenses.filter(e => e.paid).reduce((s, e) => s + (e.amount || 0), 0)
              const unpaidTotal = allExpenses.filter(e => !e.paid).reduce((s, e) => s + (e.amount || 0), 0)
              const paidCount = allExpenses.filter(e => e.paid).length
              const unpaidCount = allExpenses.filter(e => !e.paid).length

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: theme.colors.mint }} />
                        <span style={{ fontSize: 13, color: theme.colors.textSecondary }}>Pagas</span>
                      </div>
                      <span className="mono tnum" style={{ fontSize: 13, color: theme.colors.mint }}>{fmtBRL(paidTotal)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: theme.colors.textMuted, paddingLeft: 16 }}>
                      {paidCount} despesa{paidCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: theme.colors.warm }} />
                        <span style={{ fontSize: 13, color: theme.colors.textSecondary }}>Pendentes</span>
                      </div>
                      <span className="mono tnum" style={{ fontSize: 13, color: theme.colors.warm }}>{fmtBRL(unpaidTotal)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: theme.colors.textMuted, paddingLeft: 16 }}>
                      {unpaidCount} despesa{unpaidCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                  {totalExpenses > 0 && (
                    <div style={{ height: 6, background: theme.colors.bg, borderRadius: 3, overflow: 'hidden', display: 'flex', gap: 2 }}>
                      <div style={{ flex: paidTotal || 0.01, background: theme.colors.mint }} />
                      <div style={{ flex: unpaidTotal || 0.01, background: theme.colors.warm }} />
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Savings target */}
          <div style={{ ...panelStyle, padding: 20 }}>
            <div className="eyebrow" style={{ marginBottom: 14 }}>Meta de economia</div>
            <div className="display tnum" style={{ fontSize: 28, lineHeight: 1, color: theme.colors.text, marginBottom: 8 }}>
              <span style={{ fontSize: 14, color: theme.colors.textMuted }}>R$ </span>
              {Number(totalEconomia).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: 12, color: theme.colors.textMuted, marginBottom: 12 }}>
              de {fmtBRL(idealEconomia)} ideal (20%)
            </div>
            <div style={{ height: 8, background: theme.colors.bg, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: idealEconomia > 0 ? `${Math.min((totalEconomia / idealEconomia) * 100, 100)}%` : '0%',
                background: totalEconomia >= idealEconomia ? theme.colors.mint : theme.colors.gold,
                transition: 'width 0.3s ease',
              }} />
            </div>
            <div className="mono tnum" style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 8, textAlign: 'right' }}>
              {idealEconomia > 0 ? Math.round((totalEconomia / idealEconomia) * 100) : 0}%
            </div>
          </div>
        </div>
      )}

      {/* Income Modal */}
      <Modal open={showIncomeModal} onClose={() => setShowIncomeModal(false)} title="Nova entrada" subtitle="receita" width={460}>
        <form onSubmit={handleCreateIncome} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Fonte" required>
            <select
              value={incomeForm.source}
              onChange={e => setIncomeForm({ ...incomeForm, source: e.target.value })}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {INCOME_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Valor (R$)" required>
            <input
              type="number" step="0.01" min="0.01"
              value={incomeForm.amount}
              onChange={e => setIncomeForm({ ...incomeForm, amount: e.target.value })}
              required placeholder="0,00" style={inputStyle}
            />
          </Field>
          <Field label="Descricao">
            <input
              value={incomeForm.description}
              onChange={e => setIncomeForm({ ...incomeForm, description: e.target.value })}
              placeholder="Ex: Projeto freelance XYZ" style={inputStyle}
            />
          </Field>
          <Field label="Data">
            <input
              type="date"
              value={incomeForm.entry_date}
              onChange={e => setIncomeForm({ ...incomeForm, entry_date: e.target.value })}
              style={inputStyle}
            />
          </Field>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" style={btnSoft} onClick={() => setShowIncomeModal(false)}>Cancelar</button>
            <button type="submit" style={btnPrimary}>Adicionar</button>
          </div>
        </form>
      </Modal>

      {/* Expense Modal */}
      <Modal open={showExpenseModal} onClose={() => setShowExpenseModal(false)}
        title="Nova despesa" subtitle={CATEGORY_META[expenseCategory]?.label || 'despesa'} width={460}>
        <form onSubmit={handleCreateExpense} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Categoria" required>
            <div style={{ display: 'flex', gap: 6 }}>
              {Object.entries(CATEGORY_META).map(([key, meta]) => (
                <button key={key} type="button"
                  onClick={() => setExpenseCategory(key)}
                  style={{
                    flex: 1, padding: '8px 0', fontSize: 12, borderRadius: 6,
                    fontWeight: expenseCategory === key ? 600 : 400,
                    color: expenseCategory === key ? meta.color : theme.colors.textMuted,
                    background: expenseCategory === key ? `${meta.color}18` : theme.colors.bgSecondary,
                    border: `1px solid ${expenseCategory === key ? meta.color : theme.colors.border}`,
                    textAlign: 'center',
                  }}
                >
                  {meta.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Nome" required>
            <input
              value={expenseForm.name}
              onChange={e => setExpenseForm({ ...expenseForm, name: e.target.value })}
              required placeholder="Ex: Aluguel, Netflix, Reserva..." style={inputStyle}
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Valor (R$)" required>
              <input
                type="number" step="0.01" min="0.01"
                value={expenseForm.amount}
                onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                required placeholder="0,00" style={inputStyle}
              />
            </Field>
            <Field label="Dia de vencimento">
              <input
                type="number" min="1" max="31"
                value={expenseForm.due_day}
                onChange={e => setExpenseForm({ ...expenseForm, due_day: e.target.value })}
                placeholder="Ex: 10" style={inputStyle}
              />
            </Field>
          </div>
          <Field label="Data">
            <input
              type="date"
              value={expenseForm.entry_date}
              onChange={e => setExpenseForm({ ...expenseForm, entry_date: e.target.value })}
              style={inputStyle}
            />
          </Field>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" style={btnSoft} onClick={() => setShowExpenseModal(false)}>Cancelar</button>
            <button type="submit" style={btnPrimary}>Adicionar</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
