// src/pages/PersonalFinance.jsx — Painel Financeiro Pessoal (estilo planilha)
import { useState, useEffect, useMemo, useRef } from 'react'
import api from '../api'
import theme from '../styles/theme'
import {
  Icon, Spinner, fmtBRL, panelStyle,
} from '../components/ui'
import useIsMobile from '../hooks/useIsMobile'

const CAT = {
  necessidade: { label: 'Necessidades', color: '#4285f4', bg: '#e8f0fe' },
  desejo:      { label: 'Desejos',       color: '#f4b400', bg: '#fef7e0' },
  economia:    { label: 'Economias',     color: '#0f9d58', bg: '#e6f4ea' },
}

// ── shared cell / row styles ──
const cellBase = {
  padding: '7px 10px', fontSize: 13, color: theme.colors.text,
  borderBottom: `1px solid ${theme.colors.borderSoft}`,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}
const cellInput = {
  width: '100%', background: 'transparent', border: 'none', outline: 'none',
  fontSize: 13, color: theme.colors.text, padding: 0, fontFamily: theme.fonts.ui,
}
const headerCell = (color) => ({
  ...cellBase, fontWeight: 600, fontSize: 12, textTransform: 'uppercase',
  letterSpacing: '0.06em', background: color, color: '#222',
  borderBottom: `2px solid ${color}`,
})
const totalRow = (color) => ({
  ...cellBase, fontWeight: 700, fontSize: 13, background: color, color: '#222',
  borderBottom: 'none',
})

export default function PersonalFinance() {
  const isMobile = useIsMobile()
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mobileTab, setMobileTab] = useState('entradas')

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    try { setData(await api.personalFinance.get(month)) }
    catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  function changeMonth(delta) {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-')
    return new Date(parseInt(y), parseInt(m) - 1)
      .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  }, [month])

  if (loading && !data) return <Spinner />

  const {
    totalIncome = 0, totalPlatformIncome = 0, totalManualIncome = 0,
    totalExpenses = 0, totalNecessidade = 0, totalDesejo = 0, totalEconomia = 0,
    totalAvulsas = 0,
    balance = 0, totalPendingPlatform = 0,
    platformIncome = [], legacyPayments = [], pendingPlatformWork = [],
    incomeEntries = [], expensesByCategory = {}, fixedByCategory = {},
    avulsas = [],
  } = data || {}

  const pctN = totalIncome > 0 ? Math.round((totalNecessidade / totalIncome) * 100) : 0
  const pctD = totalIncome > 0 ? Math.round((totalDesejo / totalIncome) * 100) : 0
  const pctE = totalIncome > 0 ? Math.round((totalEconomia / totalIncome) * 100) : 0

  // Build all platform income items for the Entradas table
  const allPlatformItems = [
    ...platformIncome.map((item, i) => ({
      id: `p-${item.batch_id || item.id || i}`,
      name: item.title || item.order_titles || 'Pagamento',
      amount: item.amount || item.total_amount || 0,
      sub: item.client_name || item.client_names || '',
      auto: true,
    })),
    ...legacyPayments.map((p, i) => ({
      id: `l-${p.id || i}`,
      name: p.order_title || p.notes || 'Pagamento',
      amount: p.amount || 0,
      sub: p.client_name || '',
      auto: true,
    })),
  ]

  const AVULSA_META = { label: 'Avulsas', color: '#e17055', bg: '#fde4dc' }

  const columns = [
    { key: 'entradas', label: 'Entradas', headerColor: '#e0e0e0', totalColor: '#e0e0e0' },
    { key: 'necessidade', ...CAT.necessidade },
    { key: 'desejo', ...CAT.desejo },
    { key: 'economia', ...CAT.economia },
    { key: 'avulsa', ...AVULSA_META },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 14 : 24 }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'flex-end',
        justifyContent: 'space-between', gap: 12,
      }}>
        <div>
          <h2 className="display" style={{
            fontSize: isMobile ? 26 : 40, margin: 0, color: theme.colors.text,
            lineHeight: 1, letterSpacing: '-0.02em', textTransform: 'capitalize',
          }}>
            {monthLabel.split(' ')[0]}
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2,
            background: theme.colors.bgSecondary,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: 8, padding: 2,
          }}>
            <button onClick={() => changeMonth(-1)} style={{
              width: 30, height: 30, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: theme.colors.textMuted,
            }}>
              <Icon name="chevronLeft" size={16} />
            </button>
            <span className="display" style={{
              fontSize: 12, padding: '0 6px', color: theme.colors.text,
              textTransform: 'capitalize', minWidth: 120, textAlign: 'center',
            }}>
              {monthLabel}
            </span>
            <button onClick={() => changeMonth(1)} style={{
              width: 30, height: 30, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: theme.colors.textMuted,
            }}>
              <Icon name="chevronRight" size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Summary bar (Planejado x Realizado) ── */}
      <div style={{
        ...panelStyle, padding: isMobile ? 14 : 20,
        display: 'flex', flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: 'space-between', gap: isMobile ? 14 : 24,
      }}>
        {/* Percentages */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 16 : 32, justifyContent: 'center' }}>
          <div className="eyebrow" style={{ fontSize: 11, color: theme.colors.textMuted }}>Planejado x Realizado</div>
          {[
            { label: 'Necessidades', pct: pctN, color: CAT.necessidade.color },
            { label: 'Desejos', pct: pctD, color: CAT.desejo.color },
            { label: 'Economias', pct: pctE, color: CAT.economia.color },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div className="mono tnum" style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.pct}%</div>
              <div style={{ fontSize: 11, color: theme.colors.textMuted }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Resumo */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 24,
          ...(isMobile ? { justifyContent: 'space-around', borderTop: `1px solid ${theme.colors.border}`, paddingTop: 12 } : {}),
        }}>
          <div className="eyebrow" style={{ fontSize: 11, color: theme.colors.textMuted }}>Resumo</div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: theme.colors.textMuted }}>Entradas</div>
            <div className="mono tnum" style={{ fontSize: 14, color: theme.colors.mint, fontWeight: 600 }}>{fmtBRL(totalIncome)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: theme.colors.textMuted }}>Atual</div>
            <div className="mono tnum" style={{ fontSize: 14, color: theme.colors.text, fontWeight: 600 }}>{fmtBRL(totalExpenses)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: theme.colors.textMuted }}>Resta</div>
            <div className="mono tnum" style={{ fontSize: 14, color: balance >= 0 ? theme.colors.mint : theme.colors.danger, fontWeight: 600 }}>{fmtBRL(balance)}</div>
          </div>
        </div>
      </div>

      {/* ── Mobile tab selector ── */}
      {isMobile && (
        <div style={{
          display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden',
          border: `1px solid ${theme.colors.border}`,
        }}>
          {columns.map(col => (
            <button key={col.key} onClick={() => setMobileTab(col.key)} style={{
              flex: 1, padding: '10px 0', fontSize: 11, fontWeight: mobileTab === col.key ? 700 : 400,
              color: mobileTab === col.key ? '#222' : theme.colors.textMuted,
              background: mobileTab === col.key ? (col.headerColor || col.color) : theme.colors.bgSecondary,
              borderRight: `1px solid ${theme.colors.border}`,
            }}>
              {col.key === 'entradas' ? 'Entradas' : col.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Row 1: Entradas + Avulsas (fluxo do dia a dia) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '3fr 2fr',
        gap: isMobile ? 0 : 14,
        alignItems: 'start',
      }}>
        {(!isMobile || mobileTab === 'entradas') && (
          <IncomeTable
            platformItems={allPlatformItems}
            pendingItems={pendingPlatformWork}
            manualEntries={incomeEntries}
            total={totalIncome}
            totalPending={totalPendingPlatform}
            onAdd={async (name, amount) => {
              await api.personalFinance.createIncome({ source: name, amount, entry_date: `${month}-01` })
              load()
            }}
            onDelete={async (id) => {
              await api.personalFinance.deleteIncome(id)
              load()
            }}
          />
        )}

        {(!isMobile || mobileTab === 'avulsa') && (
          <AvulsaTable
            meta={AVULSA_META}
            items={avulsas}
            total={totalAvulsas}
            month={month}
            onAdd={async (name, amount) => {
              await api.personalFinance.createAvulsa({
                name, amount,
                entry_date: new Date().toISOString().substring(0, 10),
              })
              load()
            }}
            onDelete={async (id) => { await api.personalFinance.deleteAvulsa(id); load() }}
          />
        )}
      </div>

      {/* ── Row 2: Necessidades + Desejos + Economias (regra 50/30/20) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
        gap: isMobile ? 0 : 14,
        alignItems: 'start',
      }}>
        {Object.entries(CAT).map(([cat, meta]) => {
          if (isMobile && mobileTab !== cat) return null
          const items = expensesByCategory[cat] || []
          const fixed = fixedByCategory[cat] || []
          const catTotal = items.reduce((s, e) => s + (e.amount || 0), 0)
            + fixed.reduce((s, e) => s + (e.amount || 0), 0)

          return (
            <ExpenseTable
              key={cat}
              category={cat}
              meta={meta}
              items={items}
              fixedCosts={fixed}
              total={catTotal}
              month={month}
              onAddExpense={async (name, amount, installments) => {
                await api.personalFinance.createExpense({
                  category: cat, name, amount,
                  entry_date: `${month}-01`,
                  installments: installments || undefined,
                })
                load()
              }}
              onToggle={async (id) => { await api.personalFinance.toggleExpense(id); load() }}
              onDelete={async (id) => { await api.personalFinance.deleteExpense(id); load() }}
              onAddFixed={async (name, amount) => {
                await api.personalFinance.createFixedCost({ category: cat, name, amount })
                load()
              }}
              onDeleteFixed={async (id) => { await api.personalFinance.deleteFixedCost(id); load() }}
            />
          )
        })}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════
   IncomeTable — coluna Entradas
   ═══════════════════════════════════════ */
function IncomeTable({ platformItems, pendingItems, manualEntries, total, totalPending, onAdd, onDelete }) {
  const [draft, setDraft] = useState({ name: '', amount: '' })
  const nameRef = useRef(null)

  async function submit() {
    if (!draft.name.trim() || !draft.amount) return
    try {
      await onAdd(draft.name.trim(), parseFloat(draft.amount))
      setDraft({ name: '', amount: '' })
      nameRef.current?.focus()
    } catch (err) { alert(err.message) }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); submit() }
  }

  return (
    <div style={{ ...panelStyle, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', ...headerCell('#d9d9d9') }}>
        <span>Entradas</span><span style={{ textAlign: 'right' }}>Valor</span>
      </div>

      {/* Platform items (auto — read-only) */}
      {platformItems.map(item => (
        <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px', ...cellBase, background: 'rgba(124, 224, 184, 0.06)' }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span>{item.name}</span>
            {item.sub && <span style={{ fontSize: 10, color: theme.colors.textMuted, marginLeft: 6 }}>{item.sub}</span>}
          </div>
          <div className="mono tnum" style={{ textAlign: 'right', color: theme.colors.mint, fontWeight: 500 }}>
            {fmtBRL(item.amount)}
          </div>
        </div>
      ))}

      {/* Pending items (not counted) */}
      {pendingItems.map(item => (
        <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px', ...cellBase, opacity: 0.5 }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span>{item.title}</span>
            <span style={{ fontSize: 10, color: theme.colors.gold, marginLeft: 6 }}>pendente</span>
          </div>
          <div className="mono tnum" style={{ textAlign: 'right', color: theme.colors.gold }}>
            {fmtBRL(item.editor_value)}
          </div>
        </div>
      ))}

      {/* Manual entries */}
      {manualEntries.map(e => (
        <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 20px', ...cellBase }}
          className="row-hover">
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {e.source}{e.description ? ` — ${e.description}` : ''}
          </div>
          <div className="mono tnum" style={{ textAlign: 'right' }}>{fmtBRL(e.amount)}</div>
          <button onClick={() => onDelete(e.id)} style={{ padding: 0, color: theme.colors.textFaint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={11} />
          </button>
        </div>
      ))}

      {/* Inline new row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', ...cellBase, borderBottom: 'none', background: theme.colors.bgSecondary }}>
        <input
          ref={nameRef}
          value={draft.name}
          onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          onKeyDown={onKeyDown}
          placeholder="Nova entrada..."
          style={{ ...cellInput, color: theme.colors.textMuted }}
        />
        <input
          value={draft.amount}
          onChange={e => setDraft(d => ({ ...d, amount: e.target.value }))}
          onKeyDown={onKeyDown}
          onBlur={submit}
          placeholder="0,00"
          type="number" step="0.01" min="0"
          style={{ ...cellInput, textAlign: 'right', color: theme.colors.textMuted }}
        />
      </div>

      {/* Total */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', ...totalRow('#d9d9d9') }}>
        <span>Total</span>
        <span className="mono tnum" style={{ textAlign: 'right' }}>{fmtBRL(total)}</span>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════
   ExpenseTable — coluna de despesa
   ═══════════════════════════════════════ */
function ExpenseTable({ category, meta, items, fixedCosts, total, month, onAddExpense, onToggle, onDelete, onAddFixed, onDeleteFixed }) {
  const [draft, setDraft] = useState({ name: '', amount: '', installments: '' })
  const [fixedDraft, setFixedDraft] = useState({ name: '', amount: '' })
  const [showFixed, setShowFixed] = useState(false)
  const nameRef = useRef(null)
  const fixedNameRef = useRef(null)

  async function submitExpense() {
    if (!draft.name.trim() || !draft.amount) return
    try {
      await onAddExpense(draft.name.trim(), parseFloat(draft.amount), draft.installments ? parseInt(draft.installments) : 0)
      setDraft({ name: '', amount: '', installments: '' })
      nameRef.current?.focus()
    } catch (err) { alert(err.message) }
  }

  async function submitFixed() {
    if (!fixedDraft.name.trim() || !fixedDraft.amount) return
    try {
      await onAddFixed(fixedDraft.name.trim(), parseFloat(fixedDraft.amount))
      setFixedDraft({ name: '', amount: '' })
      fixedNameRef.current?.focus()
    } catch (err) { alert(err.message) }
  }

  function onKeyDown(e, fn) {
    if (e.key === 'Enter') { e.preventDefault(); fn() }
  }

  return (
    <div style={{ ...panelStyle, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', ...headerCell(meta.bg) }}>
        <span style={{ color: meta.color }}>{meta.label}</span>
        <span style={{ textAlign: 'right', color: meta.color }}>Valor</span>
      </div>

      {/* Fixed costs section */}
      {fixedCosts.length > 0 && fixedCosts.map(fc => (
        <div key={`fc-${fc.id}`}
          style={{ display: 'grid', gridTemplateColumns: '1fr 110px 20px', ...cellBase, background: `${meta.color}08` }}
          className="row-hover">
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span>{fc.name}</span>
            <span style={{ fontSize: 9, color: meta.color, marginLeft: 6, textTransform: 'uppercase', fontWeight: 600 }}>fixo</span>
          </div>
          <div className="mono tnum" style={{ textAlign: 'right' }}>{fmtBRL(fc.amount)}</div>
          <button onClick={() => onDeleteFixed(fc.id)} style={{ padding: 0, color: theme.colors.textFaint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={11} />
          </button>
        </div>
      ))}

      {/* Variable expenses */}
      {items.map(exp => (
        <div key={exp.id}
          style={{
            display: 'grid', gridTemplateColumns: '1fr 110px 20px', ...cellBase,
            opacity: exp.paid ? 0.5 : 1,
            textDecoration: exp.paid ? 'line-through' : 'none',
          }}
          className="row-hover">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
            <button onClick={() => onToggle(exp.id)} style={{
              width: 14, height: 14, borderRadius: 3, flexShrink: 0,
              border: `1.5px solid ${exp.paid ? meta.color : theme.colors.border}`,
              background: exp.paid ? meta.color : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
            }}>
              {exp.paid && <Icon name="check" size={9} color="#fff" />}
            </button>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {exp.name}
              {exp.installment_total > 0 && (
                <span style={{ fontSize: 10, color: meta.color, marginLeft: 4 }}>
                  {exp.installment_current}/{exp.installment_total}
                </span>
              )}
            </span>
          </div>
          <div className="mono tnum" style={{ textAlign: 'right' }}>{fmtBRL(exp.amount)}</div>
          <button onClick={() => onDelete(exp.id)} style={{ padding: 0, color: theme.colors.textFaint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={11} />
          </button>
        </div>
      ))}

      {/* Inline new expense row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', ...cellBase, borderBottom: 'none', background: theme.colors.bgSecondary }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            ref={nameRef}
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            onKeyDown={e => onKeyDown(e, submitExpense)}
            placeholder="Nova despesa..."
            style={{ ...cellInput, color: theme.colors.textMuted, flex: 1 }}
          />
          {draft.name && (
            <input
              value={draft.installments}
              onChange={e => setDraft(d => ({ ...d, installments: e.target.value }))}
              onKeyDown={e => onKeyDown(e, submitExpense)}
              placeholder="Parcelas"
              type="number" min="2" max="48"
              title="Numero de parcelas (deixe vazio para pagamento unico)"
              style={{ ...cellInput, color: theme.colors.textMuted, width: 55, textAlign: 'center', fontSize: 11 }}
            />
          )}
        </div>
        <input
          value={draft.amount}
          onChange={e => setDraft(d => ({ ...d, amount: e.target.value }))}
          onKeyDown={e => onKeyDown(e, submitExpense)}
          onBlur={submitExpense}
          placeholder="0,00"
          type="number" step="0.01" min="0"
          style={{ ...cellInput, textAlign: 'right', color: theme.colors.textMuted }}
        />
      </div>

      {/* Total */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', ...totalRow(meta.bg) }}>
        <span style={{ color: meta.color }}>Total</span>
        <span className="mono tnum" style={{ textAlign: 'right', color: meta.color }}>{fmtBRL(total)}</span>
      </div>

      {/* Fixed costs toggle */}
      <div style={{ borderTop: `1px solid ${theme.colors.borderSoft}` }}>
        <button onClick={() => setShowFixed(s => !s)} style={{
          width: '100%', padding: '8px 10px', fontSize: 11, color: theme.colors.textMuted,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: theme.colors.bgSecondary,
        }}>
          <span>Custos fixos ({fixedCosts.length})</span>
          <Icon name={showFixed ? 'chevronDown' : 'chevronRight'} size={12} />
        </button>

        {showFixed && (
          <div style={{ background: theme.colors.bgSecondary, borderTop: `1px solid ${theme.colors.borderSoft}` }}>
            {/* Inline add fixed */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', padding: '6px 10px' }}>
              <input
                ref={fixedNameRef}
                value={fixedDraft.name}
                onChange={e => setFixedDraft(d => ({ ...d, name: e.target.value }))}
                onKeyDown={e => onKeyDown(e, submitFixed)}
                placeholder="Nome do custo fixo..."
                style={{ ...cellInput, color: theme.colors.textMuted, fontSize: 12 }}
              />
              <input
                value={fixedDraft.amount}
                onChange={e => setFixedDraft(d => ({ ...d, amount: e.target.value }))}
                onKeyDown={e => onKeyDown(e, submitFixed)}
                onBlur={submitFixed}
                placeholder="0,00"
                type="number" step="0.01" min="0"
                style={{ ...cellInput, textAlign: 'right', color: theme.colors.textMuted, fontSize: 12 }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════
   AvulsaTable — compras avulsas do dia a dia
   ═══════════════════════════════════════ */
function AvulsaTable({ meta, items, total, onAdd, onDelete }) {
  const [draft, setDraft] = useState({ name: '', amount: '' })
  const nameRef = useRef(null)

  async function submit() {
    if (!draft.name.trim() || !draft.amount) return
    try {
      await onAdd(draft.name.trim(), parseFloat(draft.amount))
      setDraft({ name: '', amount: '' })
      nameRef.current?.focus()
    } catch (err) { alert(err.message) }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); submit() }
  }

  // Group items by day for visual organization
  const byDay = {}
  for (const it of items) {
    const d = it.entry_date || '—'
    if (!byDay[d]) byDay[d] = []
    byDay[d].push(it)
  }
  const days = Object.keys(byDay).sort((a, b) => b.localeCompare(a))

  return (
    <div style={{ ...panelStyle, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', ...headerCell(meta.bg) }}>
        <span style={{ color: meta.color }}>{meta.label}</span>
        <span style={{ textAlign: 'right', color: meta.color }}>Valor</span>
      </div>

      {/* Items grouped by day */}
      {days.map(day => (
        <div key={day}>
          {day !== '—' && (
            <div style={{
              padding: '4px 10px', fontSize: 10, color: meta.color,
              background: `${meta.color}10`,
              fontFamily: 'monospace', letterSpacing: '0.04em',
              borderBottom: `1px solid ${theme.colors.borderSoft}`,
            }}>
              {new Date(day + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            </div>
          )}
          {byDay[day].map(av => (
            <div key={av.id}
              style={{ display: 'grid', gridTemplateColumns: '1fr 110px 20px', ...cellBase }}
              className="row-hover">
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {av.name}
              </div>
              <div className="mono tnum" style={{ textAlign: 'right' }}>{fmtBRL(av.amount)}</div>
              <button onClick={() => onDelete(av.id)} style={{ padding: 0, color: theme.colors.textFaint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="x" size={11} />
              </button>
            </div>
          ))}
        </div>
      ))}

      {/* Inline new row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', ...cellBase, borderBottom: 'none', background: theme.colors.bgSecondary }}>
        <input
          ref={nameRef}
          value={draft.name}
          onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          onKeyDown={onKeyDown}
          placeholder="Nova compra..."
          style={{ ...cellInput, color: theme.colors.textMuted }}
        />
        <input
          value={draft.amount}
          onChange={e => setDraft(d => ({ ...d, amount: e.target.value }))}
          onKeyDown={onKeyDown}
          onBlur={submit}
          placeholder="0,00"
          type="number" step="0.01" min="0"
          style={{ ...cellInput, textAlign: 'right', color: theme.colors.textMuted }}
        />
      </div>

      {/* Total */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', ...totalRow(meta.bg) }}>
        <span style={{ color: meta.color }}>Total</span>
        <span className="mono tnum" style={{ textAlign: 'right', color: meta.color }}>{fmtBRL(total)}</span>
      </div>
    </div>
  )
}
