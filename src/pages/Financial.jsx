// src/pages/Financial.jsx — visão geral + planilhas por cliente/editor + notas/lotes
import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../api'
import theme from '../styles/theme'
import Modal from '../components/Modal'
import {
  Icon, Avatar, Spinner, Field, Badge,
  inputStyle, btnPrimary, btnSoft, btnGhost, btnDanger,
  panelStyle, fmtBRL,
} from '../components/ui'
import useIsMobile from '../hooks/useIsMobile'

const tabs = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'clients', label: 'Por cliente' },
  { id: 'editors', label: 'Por editor' },
]

function getMonthStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function getDaysInMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number)
  const days = new Date(y, m, 0).getDate()
  const result = []
  for (let d = 1; d <= days; d++) {
    result.push(`${monthStr}-${String(d).padStart(2, '0')}`)
  }
  return result
}

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function MonthPicker({ value, onChange }) {
  const [y, m] = value.split('-').map(Number)
  const prev = () => onChange(getMonthStr(new Date(y, m - 2, 1)))
  const next = () => onChange(getMonthStr(new Date(y, m, 1)))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button onClick={prev} style={{ ...btnSoft, padding: '6px 10px' }}><Icon name="chevronLeft" size={14} /></button>
      <div className="display" style={{ fontSize: 17, minWidth: 160, textAlign: 'center', color: theme.colors.text }}>
        {MONTH_NAMES[m - 1]} {y}
      </div>
      <button onClick={next} style={{ ...btnSoft, padding: '6px 10px' }}><Icon name="chevronRight" size={14} /></button>
    </div>
  )
}

export default function Financial() {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState('overview')
  const [month, setMonth] = useState(getMonthStr(new Date()))
  const [lists, setLists] = useState({ clients: [], editors: [] })

  useEffect(() => {
    Promise.all([api.clients.list(), api.team.list()])
      .then(([clients, editors]) => setLists({ clients, editors }))
      .catch(console.error)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', gap: isMobile ? 10 : 16 }}>
        <div style={{
          display: 'flex', padding: 4,
          background: theme.colors.bgSecondary,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: 10, gap: 2,
          overflowX: isMobile ? 'auto' : 'visible',
        }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '7px 14px', borderRadius: 7,
              fontSize: 12.5, fontWeight: tab === t.id ? 500 : 400,
              color: tab === t.id ? theme.colors.text : theme.colors.textMuted,
              background: tab === t.id ? theme.colors.surfaceHover : 'transparent',
              whiteSpace: 'nowrap',
            }}>
              {t.label}
            </button>
          ))}
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      {tab === 'overview' && <OverviewTab month={month} isMobile={isMobile} />}
      {tab === 'clients'  && <ClientSheetTab month={month} lists={lists} />}
      {tab === 'editors'  && <EditorSheetTab month={month} lists={lists} />}
    </div>
  )
}

// ============================================================
// OVERVIEW
// ============================================================
function OverviewTab({ month, isMobile: isMobileProp }) {
  const isMobile = isMobileProp ?? false
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.financial.getOverview(month).then(setData).catch(console.error).finally(() => setLoading(false))
  }, [month])

  if (loading) return <Spinner />
  if (!data) return <div style={{ color: theme.colors.textMuted, textAlign: 'center', padding: 40 }}>Sem dados</div>

  const profit = data.totalReceivedClients - data.totalPaidEditors
  const margin = data.totalBilled > 0 ? (profit / data.totalBilled) * 100 : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Hero KPIs */}
      <div style={{ ...panelStyle, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr 1fr' }}>
          <div style={{ padding: isMobile ? 20 : 32, borderRight: isMobile ? 'none' : `1px solid ${theme.colors.border}`, borderBottom: isMobile ? `1px solid ${theme.colors.border}` : 'none', position: 'relative', overflow: 'hidden' }}>
            <div className="grid-bg" style={{ position: 'absolute', inset: 0, opacity: 0.4, pointerEvents: 'none' }} />
            <div style={{ position: 'relative' }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>lucro do mês</div>
              <div className="display tnum" style={{
                fontSize: 56, lineHeight: 0.95, letterSpacing: '-0.03em',
                color: profit >= 0 ? theme.colors.mint : theme.colors.danger,
              }}>
                <span style={{ fontSize: 22, color: theme.colors.textMuted, marginRight: 6 }}>R$</span>
                {fmtBRL(profit, true)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16 }}>
                <Badge color={profit >= 0 ? 'mint' : 'rose'}>
                  {profit >= 0 ? '+' : ''}{margin.toFixed(1)}% margem
                </Badge>
              </div>
            </div>
          </div>

          <div style={{ padding: isMobile ? 16 : 24, borderRight: isMobile ? 'none' : `1px solid ${theme.colors.border}`, borderBottom: isMobile ? `1px solid ${theme.colors.border}` : 'none', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>a receber</div>
              <div className="display tnum" style={{ fontSize: 28, color: theme.colors.gold }}>
                <span style={{ fontSize: 13, color: theme.colors.textMuted, marginRight: 4 }}>R$</span>
                {fmtBRL(data.totalPendingClients, true)}
              </div>
            </div>
            <div style={{ marginTop: 18 }}>
              <div style={{ height: 4, background: theme.colors.bg, borderRadius: 2 }}>
                <div style={{
                  width: `${data.totalBilled > 0 ? (data.totalReceivedClients / data.totalBilled) * 100 : 0}%`,
                  height: '100%', background: theme.colors.mint, borderRadius: 2,
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span className="eyebrow" style={{ fontSize: 9 }}>recebido</span>
                <span className="mono" style={{ fontSize: 11, color: theme.colors.textMuted }}>
                  {fmtBRL(data.totalReceivedClients, true)} / {fmtBRL(data.totalBilled, true)}
                </span>
              </div>
            </div>
          </div>

          <div style={{ padding: isMobile ? 16 : 24, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>a pagar editores</div>
              <div className="display tnum" style={{ fontSize: 28, color: theme.colors.warm }}>
                <span style={{ fontSize: 13, color: theme.colors.textMuted, marginRight: 4 }}>R$</span>
                {fmtBRL(data.totalPendingEditors, true)}
              </div>
            </div>
            <div style={{ marginTop: 18 }}>
              <div style={{ height: 4, background: theme.colors.bg, borderRadius: 2 }}>
                <div style={{
                  width: `${(data.totalPaidEditors + data.totalPendingEditors) > 0 ? (data.totalPaidEditors / (data.totalPaidEditors + data.totalPendingEditors)) * 100 : 0}%`,
                  height: '100%', background: theme.colors.primary, borderRadius: 2,
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span className="eyebrow" style={{ fontSize: 9 }}>pago</span>
                <span className="mono" style={{ fontSize: 11, color: theme.colors.textMuted }}>
                  {fmtBRL(data.totalPaidEditors, true)} / {fmtBRL(data.totalPaidEditors + data.totalPendingEditors, true)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          borderTop: `1px solid ${theme.colors.border}`,
        }}>
          {[
            { k: 'Faturado', v: fmtBRL(data.totalBilled, true), c: theme.colors.text },
            { k: 'Recebido', v: fmtBRL(data.totalReceivedClients, true), c: theme.colors.mint },
            { k: 'Pago a editores', v: fmtBRL(data.totalPaidEditors, true), c: theme.colors.primary },
          ].map((m, i) => (
            <div key={i} style={{
              padding: '16px 24px',
              borderRight: i < 2 ? `1px solid ${theme.colors.border}` : 'none',
            }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>{m.k}</div>
              <div className="display tnum" style={{ fontSize: 22, color: m.c }}>{m.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Two tables */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
        <FinTable
          eyebrow="por cliente"
          title="Faturamento"
          headers={['Cliente', 'Pedidos', 'Total', 'Recebido', 'Pendente']}
          rows={data.perClient.map(c => ({
            cells: [
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} key="n">
                <Avatar name={c.client_name} size={22} />
                <div>
                  <span style={{ fontSize: 13, color: theme.colors.text }}>{c.client_name}</span>
                  {c.total_entry_value > 0 && (
                    <div style={{ fontSize: 9.5, color: theme.colors.primary, marginTop: 1 }}>
                      incl. {fmtBRL(c.total_entry_value, true)} avulso
                    </div>
                  )}
                </div>
              </div>,
              <span className="mono tnum">{c.total_orders}</span>,
              <span className="mono tnum" style={{ fontWeight: 600 }}>{fmtBRL(c.total_value, true)}</span>,
              <span className="mono tnum" style={{ color: theme.colors.mint }}>{fmtBRL(c.total_received, true)}</span>,
              <span className="mono tnum" style={{ color: c.total_pending_invoice > 0 ? theme.colors.gold : theme.colors.textFaint }}>
                {c.total_pending_invoice > 0 ? fmtBRL(c.total_pending_invoice, true) : '—'}
              </span>,
            ],
          }))}
          empty="Nenhum registro no período"
        />
        <FinTable
          eyebrow="por editor"
          title="Custos & pagamentos"
          headers={['Editor', 'Trab.', 'Total', 'Pago', 'Pendente']}
          rows={data.perEditor.map(e => ({
            cells: [
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} key="n">
                <Avatar name={e.editor_name} size={22} />
                <span style={{ fontSize: 13, color: theme.colors.text }}>{e.editor_name}</span>
              </div>,
              <span className="mono tnum">{e.total_orders}</span>,
              <span className="mono tnum" style={{ fontWeight: 600 }}>{fmtBRL(e.total_value, true)}</span>,
              <span className="mono tnum" style={{ color: theme.colors.mint }}>{fmtBRL(e.total_paid, true)}</span>,
              <span className="mono tnum" style={{ color: e.total_pending_batch > 0 ? theme.colors.warm : theme.colors.textFaint }}>
                {e.total_pending_batch > 0 ? fmtBRL(e.total_pending_batch, true) : '—'}
              </span>,
            ],
          }))}
          empty="Nenhum registro no período"
        />
      </div>
    </div>
  )
}

function FinTable({ eyebrow, title, headers, rows, empty }) {
  return (
    <div style={{ ...panelStyle, overflow: 'hidden' }}>
      <div style={{ padding: '18px 20px 14px' }}>
        {eyebrow && <div className="eyebrow" style={{ marginBottom: 4 }}>{eyebrow}</div>}
        <h3 className="display" style={{ fontSize: 18, margin: 0, color: theme.colors.text }}>{title}</h3>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: theme.colors.bgSecondary }}>
            {headers.map((h, i) => (
              <th key={h} className="eyebrow" style={{
                padding: '10px 16px',
                textAlign: i === 0 ? 'left' : 'right',
                borderTop: `1px solid ${theme.colors.border}`,
                borderBottom: `1px solid ${theme.colors.border}`,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} style={{ padding: 24, textAlign: 'center', fontSize: 13, color: theme.colors.textMuted }}>{empty}</td></tr>
          ) : rows.map((r, i) => (
            <tr key={i} className="row-hover" style={{ borderBottom: `1px solid ${theme.colors.borderSoft}` }}>
              {r.cells.map((c, j) => (
                <td key={j} style={{ padding: '12px 16px', textAlign: j === 0 ? 'left' : 'right' }}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================
// CLIENT SHEET (planilha por cliente + cobranças)
// ============================================================
function ClientSheetTab({ month, lists }) {
  const [clientId, setClientId] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState([])
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [invoiceNotes, setInvoiceNotes] = useState('')
  const [detailModal, setDetailModal] = useState(null)
  const [detailData, setDetailData] = useState(null)
  const [proofUrl, setProofUrl] = useState('')
  const [showClientEntryModal, setShowClientEntryModal] = useState(false)
  const [clientEntryForm, setClientEntryForm] = useState({ amount: '', description: '', entry_date: '' })
  const [selectedEntries, setSelectedEntries] = useState([])
  const [entryProofModal, setEntryProofModal] = useState(null)
  const [entryProofUrl, setEntryProofUrl] = useState('')
  const debounceRef = useRef({})

  const loadSheet = useCallback(() => {
    if (!clientId) return
    setLoading(true)
    api.financial.getClientSheet(clientId, month).then(setData).catch(console.error).finally(() => setLoading(false))
  }, [clientId, month])

  useEffect(() => { loadSheet() }, [loadSheet])

  const days = getDaysInMonth(month)
  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  function ordersForDay(dateStr) {
    if (!data) return []
    return data.orders.filter(o => o.updated_at && o.updated_at.substring(0, 10) === dateStr)
  }
  function dailyRecord(dateStr) {
    if (!data) return null
    return data.dailyRecords.find(r => r.record_date === dateStr)
  }

  function handleDailyChange(dateStr, field, value) {
    setData(prev => {
      if (!prev) return prev
      const existing = prev.dailyRecords.find(r => r.record_date === dateStr)
      if (existing) {
        return { ...prev, dailyRecords: prev.dailyRecords.map(r => r.record_date === dateStr ? { ...r, [field]: value } : r) }
      }
      return { ...prev, dailyRecords: [...prev.dailyRecords, { record_date: dateStr, meetings: 0, observations: '', [field]: value }] }
    })
    const key = `${dateStr}-${field}`
    clearTimeout(debounceRef.current[key])
    debounceRef.current[key] = setTimeout(() => {
      api.financial.upsertDailyRecord({ client_id: parseInt(clientId), record_date: dateStr, [field]: value }).catch(console.error)
    }, 800)
  }

  function toggleSelect(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function selectAll() {
    if (!data) return
    setSelected(selected.length === data.uninvoiced.length ? [] : data.uninvoiced.map(o => o.id))
  }

  async function handleCreateInvoice() {
    if (selected.length === 0) return
    try {
      await api.financial.createClientInvoice({ client_id: parseInt(clientId), order_ids: selected, notes: invoiceNotes || null })
      setSelected([]); setInvoiceNotes(''); setShowInvoiceModal(false); loadSheet()
    } catch (err) { alert(err.message) }
  }
  async function handlePayInvoice(invoiceId) {
    try {
      await api.financial.payClientInvoice(invoiceId, { proof_url: proofUrl || null })
      setProofUrl(''); setDetailModal(null); loadSheet()
    } catch (err) { alert(err.message) }
  }
  async function handleDeleteInvoice(invoiceId) {
    if (!confirm('Excluir esta nota? Os pedidos voltarão para "não faturados".')) return
    try { await api.financial.deleteClientInvoice(invoiceId); loadSheet() } catch (err) { alert(err.message) }
  }
  async function openInvoiceDetail(invoice) {
    setDetailModal(invoice)
    try { const d = await api.financial.getInvoiceItems(invoice.id); setDetailData(d) } catch (err) { console.error(err) }
  }

  async function handleCreateClientEntry() {
    if (!clientEntryForm.amount || !clientEntryForm.description) return
    try {
      await api.financial.createClientEntry({
        client_id: parseInt(clientId),
        amount: parseFloat(clientEntryForm.amount),
        description: clientEntryForm.description,
        entry_date: clientEntryForm.entry_date || undefined,
      })
      setClientEntryForm({ amount: '', description: '', entry_date: '' })
      setShowClientEntryModal(false)
      loadSheet()
    } catch (err) { alert(err.message) }
  }

  async function handleDeleteClientEntry(entryId) {
    if (!confirm('Excluir este lançamento avulso?')) return
    try { await api.financial.deleteClientEntry(entryId); loadSheet() } catch (err) { alert(err.message) }
  }

  async function handlePayClientEntry(entryId) {
    try {
      await api.financial.payClientEntry(entryId, { proof_url: entryProofUrl || null })
      setEntryProofModal(null); setEntryProofUrl(''); loadSheet()
    } catch (err) { alert(err.message) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ ...panelStyle, padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
        <select
          value={clientId}
          onChange={e => { setClientId(e.target.value); setData(null); setSelected([]) }}
          style={{ ...inputStyle, maxWidth: 320, cursor: 'pointer' }}
        >
          <option value="">Selecione um cliente…</option>
          {lists.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {!clientId && (
        <div style={{ ...panelStyle, textAlign: 'center', padding: 60 }}>
          <h3 className="display" style={{ fontSize: 22, color: theme.colors.text, marginBottom: 6 }}>Selecione um cliente</h3>
          <p style={{ color: theme.colors.textMuted, fontSize: 13 }}>Escolha um cliente para ver a planilha mensal</p>
        </div>
      )}

      {clientId && loading && <Spinner />}

      {clientId && data && !loading && (
        <>
          {/* Spreadsheet */}
          <div style={{ ...panelStyle, padding: 0, overflow: 'auto' }}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${theme.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="display" style={{ fontSize: 18, margin: 0, color: theme.colors.text }}>
                Planilha — {data.client.name}
              </h3>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr style={{ background: theme.colors.bgSecondary }}>
                  {['Dia', 'Reun.', 'Trabalhos entregues', 'Valor', 'Observação'].map((h, i) => (
                    <th key={h} className="eyebrow" style={{
                      padding: '10px 14px',
                      textAlign: i === 3 ? 'right' : 'left',
                      borderBottom: `1px solid ${theme.colors.border}`,
                      width: i === 0 ? 100 : i === 1 ? 80 : i === 3 ? 120 : 'auto',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map(dateStr => {
                  const dayOrders = ordersForDay(dateStr)
                  const dayRecord = dailyRecord(dateStr)
                  const dayValue = dayOrders.reduce((s, o) => s + (o.value || 0), 0)
                  const dayNum = parseInt(dateStr.split('-')[2])
                  const dow = weekDays[new Date(dateStr + 'T12:00:00').getDay()]
                  const isWeekend = dow === 'Sáb' || dow === 'Dom'
                  return (
                    <tr key={dateStr} style={{
                      background: isWeekend ? 'rgba(127, 219, 255, 0.02)' : 'transparent',
                      borderBottom: `1px solid ${theme.colors.borderSoft}`,
                    }}>
                      <td style={{ padding: '10px 14px' }}>
                        <span className="mono" style={{ fontSize: 13, color: theme.colors.text }}>{String(dayNum).padStart(2, '0')}</span>
                        <span style={{ marginLeft: 6, fontSize: 11, color: theme.colors.textFaint }}>{dow}</span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <input type="number" min="0" value={dayRecord?.meetings || ''}
                          onChange={e => handleDailyChange(dateStr, 'meetings', parseInt(e.target.value) || 0)}
                          placeholder="0"
                          style={{ ...inputStyle, width: 56, padding: '4px 8px', textAlign: 'center', fontSize: 13 }}
                        />
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {dayOrders.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {dayOrders.map(o => (
                              <span key={o.id} style={{
                                padding: '2px 8px',
                                background: theme.colors.primaryMuted,
                                borderRadius: 4, fontSize: 11.5,
                                color: theme.colors.primary, fontWeight: 500,
                              }}>{o.title}</span>
                            ))}
                          </div>
                        ) : <span style={{ color: theme.colors.textFaint, fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }} className="mono tnum">
                        {dayValue > 0 ? <span style={{ color: theme.colors.mint, fontWeight: 600 }}>{fmtBRL(dayValue, true)}</span> : <span style={{ color: theme.colors.textFaint }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <input type="text" value={dayRecord?.observations || ''}
                          onChange={e => handleDailyChange(dateStr, 'observations', e.target.value)}
                          placeholder="…"
                          style={{ ...inputStyle, padding: '4px 8px', fontSize: 12 }}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: theme.colors.bgSecondary }}>
                  <td style={{ padding: '12px 14px' }} className="eyebrow">total</td>
                  <td style={{ padding: '12px 14px', fontWeight: 600 }} className="mono tnum">
                    {data.dailyRecords.reduce((s, r) => s + (r.meetings || 0), 0)}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 12, color: theme.colors.textMuted }}>
                    {data.orders.length} trabalho{data.orders.length !== 1 ? 's' : ''}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: theme.colors.mint, fontWeight: 600 }} className="mono tnum">
                    {fmtBRL(data.orders.reduce((s, o) => s + (o.value || 0), 0), true)}
                  </td>
                  <td style={{ padding: '12px 14px' }}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Uninvoiced */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="display" style={{ fontSize: 17, color: theme.colors.text, margin: 0 }}>
              Pedidos não faturados ({data.uninvoiced.length})
            </h3>
            {data.uninvoiced.length > 0 && (
              <button
                onClick={() => { if (selected.length === 0) { alert('Selecione pelo menos um pedido'); return } setShowInvoiceModal(true) }}
                style={{ ...btnPrimary, fontSize: 12, padding: '8px 14px' }}
              >
                Gerar nota ({selected.length})
              </button>
            )}
          </div>
          {data.uninvoiced.length > 0 ? (
            <div style={{ ...panelStyle, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: theme.colors.bgSecondary }}>
                    <th style={{ width: 40, padding: '10px 16px', borderBottom: `1px solid ${theme.colors.border}` }}>
                      <input type="checkbox" checked={selected.length === data.uninvoiced.length && data.uninvoiced.length > 0} onChange={selectAll} style={{ cursor: 'pointer', accentColor: theme.colors.primary }} />
                    </th>
                    {['Pedido', 'Editor', 'Valor', 'Data'].map(h => (
                      <th key={h} className="eyebrow" style={{ padding: '10px 16px', textAlign: 'left', borderBottom: `1px solid ${theme.colors.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.uninvoiced.map(o => (
                    <tr key={o.id}
                      onClick={() => toggleSelect(o.id)}
                      style={{
                        background: selected.includes(o.id) ? theme.colors.primaryMuted : 'transparent',
                        cursor: 'pointer', borderBottom: `1px solid ${theme.colors.borderSoft}`,
                      }}>
                      <td style={{ padding: '10px 16px' }}>
                        <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggleSelect(o.id)} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer', accentColor: theme.colors.primary }} />
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: theme.colors.text }}>{o.title}</td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: theme.colors.textMuted }}>{o.editor_name || '—'}</td>
                      <td style={{ padding: '10px 16px', fontWeight: 600 }} className="mono tnum" >
                        <span style={{ color: theme.colors.mint }}>{fmtBRL(o.value, true)}</span>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: theme.colors.textMuted }}>
                        {o.updated_at ? new Date(o.updated_at).toLocaleDateString('pt-BR') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ ...panelStyle, textAlign: 'center', padding: 24, color: theme.colors.textMuted, fontSize: 13 }}>
              Todos os pedidos já foram faturados
            </div>
          )}

          {/* Invoices */}
          <h3 className="display" style={{ fontSize: 17, color: theme.colors.text, margin: 0 }}>Notas / Cobranças</h3>
          {data.invoices.length > 0 ? (
            <div style={{ ...panelStyle, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: theme.colors.bgSecondary }}>
                    {['#', 'Valor', 'Itens', 'Status', 'Data', 'Ações'].map(h => (
                      <th key={h} className="eyebrow" style={{ padding: '10px 16px', textAlign: 'left', borderBottom: `1px solid ${theme.colors.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.invoices.map(inv => (
                    <tr key={inv.id} className="row-hover" style={{ borderBottom: `1px solid ${theme.colors.borderSoft}` }}>
                      <td style={{ padding: '12px 16px' }} className="mono tnum">
                        <span style={{ color: theme.colors.textFaint }}>NF-</span>{inv.id}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600 }} className="mono tnum">{fmtBRL(inv.total_amount, true)}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: theme.colors.textMuted }}>{inv.item_count} item(s)</td>
                      <td style={{ padding: '12px 16px' }}>
                        <Badge color={inv.status === 'paid' ? 'mint' : 'gold'}>{inv.status === 'paid' ? 'Pago' : 'Pendente'}</Badge>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: theme.colors.textMuted }} className="mono">
                        {new Date(inv.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td style={{ padding: '12px 16px', display: 'flex', gap: 6 }}>
                        <button onClick={() => openInvoiceDetail(inv)} style={{ padding: '4px 10px', background: theme.colors.primaryMuted, border: 'none', borderRadius: 4, color: theme.colors.primary, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Ver</button>
                        {inv.status === 'pending' && (
                          <button onClick={() => handleDeleteInvoice(inv.id)} style={{ padding: '4px 10px', background: theme.colors.dangerMuted, border: 'none', borderRadius: 4, color: theme.colors.danger, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Excluir</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ ...panelStyle, textAlign: 'center', padding: 24, color: theme.colors.textMuted, fontSize: 13 }}>
              Nenhuma nota criada
            </div>
          )}

          {/* Client Standalone Entries */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="display" style={{ fontSize: 17, color: theme.colors.text, margin: 0 }}>
              Lançamentos avulsos ({(data.allClientEntries || []).length})
            </h3>
            <button onClick={() => setShowClientEntryModal(true)} style={{ ...btnSoft, fontSize: 12, padding: '8px 14px' }}>
              <Icon name="plus" size={12} /> Novo lançamento
            </button>
          </div>

          {(data.allClientEntries || []).length > 0 ? (
            <div style={{ ...panelStyle, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: theme.colors.bgSecondary }}>
                    {['Descrição', 'Valor', 'Data', 'Status', 'Ações'].map(h => (
                      <th key={h} className="eyebrow" style={{ padding: '10px 16px', textAlign: 'left', borderBottom: `1px solid ${theme.colors.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data.allClientEntries || []).map(e => (
                    <tr key={e.id} style={{ borderBottom: `1px solid ${theme.colors.borderSoft}` }}>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: theme.colors.text }}>{e.description}</td>
                      <td style={{ padding: '10px 16px', fontWeight: 600 }} className="mono tnum">
                        <span style={{ color: e.status === 'paid' ? theme.colors.mint : theme.colors.warm }}>{fmtBRL(e.amount, true)}</span>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: theme.colors.textMuted }}>
                        {e.entry_date ? new Date(e.entry_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        {e.status === 'paid' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Badge color="mint">Pago</Badge>
                            {e.proof_url && (
                              <a href={e.proof_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: theme.colors.primary, display: 'flex', alignItems: 'center', gap: 3 }}>
                                <Icon name="link" size={10} stroke /> comprovante
                              </a>
                            )}
                          </div>
                        ) : (
                          <Badge color="gold">Pendente</Badge>
                        )}
                      </td>
                      <td style={{ padding: '10px 16px', display: 'flex', gap: 6 }}>
                        {e.status === 'pending' && (
                          <>
                            <button onClick={() => { setEntryProofModal(e); setEntryProofUrl('') }}
                              style={{ padding: '4px 10px', background: 'rgba(0,210,150,0.12)', border: 'none', borderRadius: 4, color: theme.colors.mint, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                              Pagar
                            </button>
                            <button onClick={() => handleDeleteClientEntry(e.id)}
                              style={{ padding: '4px 10px', background: theme.colors.dangerMuted, border: 'none', borderRadius: 4, color: theme.colors.danger, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                              Excluir
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ ...panelStyle, textAlign: 'center', padding: 24, color: theme.colors.textMuted, fontSize: 13 }}>
              Nenhum lançamento avulso
            </div>
          )}
        </>
      )}

      {/* Client entry creation modal */}
      <Modal open={showClientEntryModal} onClose={() => setShowClientEntryModal(false)} title="Lançamento avulso" subtitle="cliente" width={460}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Valor (R$)">
            <input type="number" step="0.01" min="0" value={clientEntryForm.amount}
              onChange={e => setClientEntryForm(f => ({ ...f, amount: e.target.value }))} placeholder="0,00" style={inputStyle} />
          </Field>
          <Field label="Descrição / referência do contrato">
            <textarea value={clientEntryForm.description}
              onChange={e => setClientEntryForm(f => ({ ...f, description: e.target.value }))} rows={3}
              placeholder="Ex: Mensalidade contrato maio/2026, Pacote 10 vídeos…" style={{ ...inputStyle, resize: 'vertical', fontFamily: theme.fonts.ui }} />
          </Field>
          <Field label="Data (opcional)">
            <input type="date" value={clientEntryForm.entry_date}
              onChange={e => setClientEntryForm(f => ({ ...f, entry_date: e.target.value }))} style={inputStyle} />
          </Field>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button style={btnSoft} onClick={() => setShowClientEntryModal(false)}>Cancelar</button>
          <button onClick={handleCreateClientEntry} style={btnPrimary} disabled={!clientEntryForm.amount || !clientEntryForm.description}>Registrar</button>
        </div>
      </Modal>

      {/* Entry payment proof modal */}
      <Modal open={!!entryProofModal} onClose={() => { setEntryProofModal(null); setEntryProofUrl('') }} title="Confirmar pagamento" subtitle="lançamento" width={460}>
        {entryProofModal && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Descrição</div>
              <div style={{ fontSize: 14, color: theme.colors.text }}>{entryProofModal.description}</div>
              <div className="display tnum" style={{ fontSize: 24, color: theme.colors.mint, marginTop: 8 }}>
                {fmtBRL(entryProofModal.amount)}
              </div>
            </div>
            <Field label="Comprovante (URL)">
              <input value={entryProofUrl} onChange={e => setEntryProofUrl(e.target.value)}
                placeholder="Link do comprovante de pagamento…" style={inputStyle} />
            </Field>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button style={btnSoft} onClick={() => setEntryProofModal(null)}>Cancelar</button>
              <button onClick={() => handlePayClientEntry(entryProofModal.id)}
                style={{ ...btnPrimary, background: theme.colors.mint, color: theme.colors.bg }}>
                Confirmar pagamento
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create invoice modal */}
      <Modal open={showInvoiceModal} onClose={() => setShowInvoiceModal(false)} title="Gerar nota" subtitle="cobrança" width={520}>
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 14, color: theme.colors.text, marginBottom: 12 }}>
            <strong>{selected.length}</strong> pedido(s) selecionado(s) · Total:{' '}
            <strong style={{ color: theme.colors.mint }} className="mono tnum">
              {fmtBRL(data?.uninvoiced?.filter(o => selected.includes(o.id)).reduce((s, o) => s + (o.value || 0), 0) || 0)}
            </strong>
          </p>
          <div style={{ maxHeight: 200, overflow: 'auto', marginBottom: 16 }}>
            {data?.uninvoiced?.filter(o => selected.includes(o.id)).map(o => (
              <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.colors.borderSoft}`, fontSize: 13 }}>
                <span style={{ color: theme.colors.text }}>{o.title}</span>
                <span style={{ color: theme.colors.mint }} className="mono tnum">{fmtBRL(o.value, true)}</span>
              </div>
            ))}
          </div>
          <Field label="Observações">
            <textarea value={invoiceNotes} onChange={e => setInvoiceNotes(e.target.value)} rows={3}
              placeholder="Observações da nota…" style={{ ...inputStyle, resize: 'vertical', fontFamily: theme.fonts.ui }} />
          </Field>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={btnSoft} onClick={() => setShowInvoiceModal(false)}>Cancelar</button>
          <button onClick={handleCreateInvoice} style={btnPrimary}>Criar nota</button>
        </div>
      </Modal>

      {/* Invoice detail modal */}
      <Modal open={!!detailModal} onClose={() => { setDetailModal(null); setDetailData(null); setProofUrl('') }} title={`Nota #${detailModal?.id || ''}`} width={620}>
        {detailData ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
              <div>
                <div className="eyebrow">cliente</div>
                <div style={{ fontSize: 14, color: theme.colors.text, marginTop: 2 }}>{detailData.invoice?.client_name}</div>
              </div>
              <div>
                <div className="eyebrow">valor total</div>
                <div className="display tnum" style={{ fontSize: 24, color: theme.colors.mint, marginTop: 2 }}>{fmtBRL(detailData.invoice?.total_amount)}</div>
              </div>
              <Badge color={detailData.invoice?.status === 'paid' ? 'mint' : 'gold'}>{detailData.invoice?.status === 'paid' ? 'Pago' : 'Pendente'}</Badge>
            </div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>itens</div>
            <div style={{ ...panelStyle, padding: 0, overflow: 'hidden', marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {detailData.items.map(item => (
                    <tr key={item.id} style={{ borderBottom: `1px solid ${theme.colors.borderSoft}` }}>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: theme.colors.text }}>{item.order_title}</td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: theme.colors.textMuted }}>{item.editor_name || '—'}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }} className="mono tnum">{fmtBRL(item.amount, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detailModal?.status === 'pending' && (
              <div style={{ paddingTop: 14, borderTop: `1px solid ${theme.colors.border}` }}>
                <Field label="Comprovante (URL)">
                  <input value={proofUrl} onChange={e => setProofUrl(e.target.value)}
                    placeholder="Link do comprovante de pagamento…" style={inputStyle} />
                </Field>
                <button onClick={() => handlePayInvoice(detailModal.id)} style={{ ...btnPrimary, marginTop: 12, background: theme.colors.mint, color: theme.colors.bg }}>
                  Confirmar pagamento do cliente
                </button>
              </div>
            )}
            {detailModal?.status === 'paid' && detailData.invoice?.proof_url && (
              <div style={{ padding: 12, background: theme.colors.mintMuted, borderRadius: 8, fontSize: 13 }}>
                <strong>Comprovante:</strong>{' '}
                <a href={detailData.invoice.proof_url} target="_blank" rel="noreferrer" style={{ color: theme.colors.mint, wordBreak: 'break-all' }}>
                  {detailData.invoice.proof_url}
                </a>
              </div>
            )}
          </div>
        ) : <Spinner />}
      </Modal>
    </div>
  )
}

// ============================================================
// EDITOR SHEET
// ============================================================
function EditorSheetTab({ month, lists }) {
  const [editorId, setEditorId] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState([])       // order IDs
  const [selectedEntries, setSelectedEntries] = useState([]) // standalone entry IDs
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [batchNotes, setBatchNotes] = useState('')
  const [detailModal, setDetailModal] = useState(null)
  const [detailData, setDetailData] = useState(null)
  const [proofUrl, setProofUrl] = useState('')
  const [showEntryModal, setShowEntryModal] = useState(false)
  const [entryForm, setEntryForm] = useState({ amount: '', description: '', entry_date: '' })

  const loadSheet = useCallback(() => {
    if (!editorId) return
    setLoading(true)
    api.financial.getEditorSheet(editorId, month).then(setData).catch(console.error).finally(() => setLoading(false))
  }, [editorId, month])

  useEffect(() => { loadSheet() }, [loadSheet])

  function toggleSelect(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function toggleSelectEntry(id) {
    setSelectedEntries(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function selectAll() {
    if (!data) return
    const allOrders = selected.length === data.unpaid.length
    const allEntries = selectedEntries.length === (data.unpaidEntries || []).length
    if (allOrders && allEntries) {
      setSelected([])
      setSelectedEntries([])
    } else {
      setSelected(data.unpaid.map(o => o.id))
      setSelectedEntries((data.unpaidEntries || []).map(e => e.id))
    }
  }

  const totalSelectedCount = selected.length + selectedEntries.length

  async function handleCreateBatch() {
    if (totalSelectedCount === 0) return
    try {
      await api.financial.createEditorBatch({
        editor_id: parseInt(editorId),
        order_ids: selected.length > 0 ? selected : undefined,
        entry_ids: selectedEntries.length > 0 ? selectedEntries : undefined,
        notes: batchNotes || null,
      })
      setSelected([]); setSelectedEntries([]); setBatchNotes(''); setShowBatchModal(false); loadSheet()
    } catch (err) { alert(err.message) }
  }

  async function handleCreateEntry() {
    if (!entryForm.amount || !entryForm.description) return
    try {
      await api.financial.createEditorEntry({
        editor_id: parseInt(editorId),
        amount: parseFloat(entryForm.amount),
        description: entryForm.description,
        entry_date: entryForm.entry_date || undefined,
      })
      setEntryForm({ amount: '', description: '', entry_date: '' })
      setShowEntryModal(false)
      loadSheet()
    } catch (err) { alert(err.message) }
  }

  async function handleDeleteEntry(entryId) {
    if (!confirm('Excluir este lançamento avulso?')) return
    try { await api.financial.deleteEditorEntry(entryId); loadSheet() } catch (err) { alert(err.message) }
  }
  async function handlePayBatch(batchId) {
    try {
      await api.financial.payEditorBatch(batchId, { proof_url: proofUrl || null })
      setProofUrl(''); setDetailModal(null); loadSheet()
    } catch (err) { alert(err.message) }
  }
  async function handleDeleteBatch(batchId) {
    if (!confirm('Excluir este lote? Os pedidos voltarão para "não pagos".')) return
    try { await api.financial.deleteEditorBatch(batchId); loadSheet() } catch (err) { alert(err.message) }
  }
  async function openBatchDetail(batch) {
    setDetailModal(batch)
    try { const d = await api.financial.getBatchItems(batch.id); setDetailData(d) } catch (err) { console.error(err) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ ...panelStyle, padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
        <select
          value={editorId}
          onChange={e => { setEditorId(e.target.value); setData(null); setSelected([]); setSelectedEntries([]) }}
          style={{ ...inputStyle, maxWidth: 320, cursor: 'pointer' }}
        >
          <option value="">Selecione um editor…</option>
          {lists.editors.map(ed => <option key={ed.id} value={ed.id}>{ed.name}</option>)}
        </select>
      </div>

      {!editorId && (
        <div style={{ ...panelStyle, textAlign: 'center', padding: 60 }}>
          <h3 className="display" style={{ fontSize: 22, color: theme.colors.text, marginBottom: 6 }}>Selecione um editor</h3>
          <p style={{ color: theme.colors.textMuted, fontSize: 13 }}>Escolha um editor para ver os trabalhos e pagamentos</p>
        </div>
      )}

      {editorId && loading && <Spinner />}

      {editorId && data && !loading && (
        <>
          {/* Editor Spreadsheet — daily view like client sheet */}
          <div style={{ ...panelStyle, padding: 0, overflow: 'auto' }}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${theme.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="display" style={{ fontSize: 18, margin: 0, color: theme.colors.text }}>
                Planilha — {data.editor.name}
              </h3>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: theme.colors.textMuted }}>
                  {data.orders.length} trabalho{data.orders.length !== 1 ? 's' : ''}
                  {(data.monthEntries || []).length > 0 && ` + ${(data.monthEntries || []).length} avulso(s)`}
                </div>
                <div className="mono tnum" style={{ fontSize: 14, fontWeight: 600, color: theme.colors.primary }}>
                  Total: {fmtBRL(
                    data.orders.reduce((s, o) => s + (o.editor_value || 0), 0) +
                    (data.monthEntries || []).reduce((s, e) => s + (e.amount || 0), 0)
                  , true)}
                </div>
              </div>
            </div>
            {(data.orders.length > 0 || (data.monthEntries || []).length > 0) ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                <thead>
                  <tr style={{ background: theme.colors.bgSecondary }}>
                    {['Dia', 'Descrição', 'Info', 'Valor editor', 'Status'].map((h, i) => (
                      <th key={h} className="eyebrow" style={{
                        padding: '10px 14px',
                        textAlign: i === 3 ? 'right' : 'left',
                        borderBottom: `1px solid ${theme.colors.border}`,
                        width: i === 0 ? 100 : i === 3 ? 130 : i === 4 ? 120 : 'auto',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const days = getDaysInMonth(month)
                    const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
                    const mEntries = data.monthEntries || []
                    return days.map(dateStr => {
                      const dayOrders = data.orders.filter(o => {
                        const oDate = (o.updated_at || o.created_at || '').substring(0, 10)
                        return oDate === dateStr
                      })
                      const dayEntries = mEntries.filter(e => e.entry_date === dateStr)
                      const totalRows = dayOrders.length + dayEntries.length
                      if (totalRows === 0) return null
                      const dayNum = parseInt(dateStr.split('-')[2])
                      const dow = weekDays[new Date(dateStr + 'T12:00:00').getDay()]
                      const rows = []
                      dayOrders.forEach((o, oi) => {
                        rows.push(
                          <tr key={`${dateStr}-o-${o.id}`} style={{ borderBottom: `1px solid ${theme.colors.borderSoft}` }}>
                            {oi === 0 && dayEntries.length === 0 && (
                              <td rowSpan={totalRows} style={{ padding: '10px 14px', verticalAlign: 'top' }}>
                                <span className="mono" style={{ fontSize: 13, color: theme.colors.text }}>{String(dayNum).padStart(2, '0')}</span>
                                <span style={{ marginLeft: 6, fontSize: 11, color: theme.colors.textFaint }}>{dow}</span>
                              </td>
                            )}
                            {oi === 0 && dayEntries.length > 0 && (
                              <td rowSpan={totalRows} style={{ padding: '10px 14px', verticalAlign: 'top' }}>
                                <span className="mono" style={{ fontSize: 13, color: theme.colors.text }}>{String(dayNum).padStart(2, '0')}</span>
                                <span style={{ marginLeft: 6, fontSize: 11, color: theme.colors.textFaint }}>{dow}</span>
                              </td>
                            )}
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{
                                padding: '2px 8px', background: theme.colors.primaryMuted,
                                borderRadius: 4, fontSize: 11.5, color: theme.colors.primary, fontWeight: 500,
                              }}>{o.title}</span>
                            </td>
                            <td style={{ padding: '10px 14px', fontSize: 12, color: theme.colors.textMuted }}>{o.client_name}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'right' }} className="mono tnum">
                              {o.editor_value > 0
                                ? <span style={{ color: theme.colors.primary, fontWeight: 600 }}>{fmtBRL(o.editor_value, true)}</span>
                                : <span style={{ color: theme.colors.textFaint }}>—</span>}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <Badge color={
                                o.batch_status === 'paid' ? 'mint' : o.batch_id ? 'gold' : o.column_name?.toLowerCase().includes('finaliz') ? 'blue' : 'default'
                              }>
                                {o.batch_status === 'paid' ? 'Pago' : o.batch_id ? 'Em lote' : o.column_name || '—'}
                              </Badge>
                            </td>
                          </tr>
                        )
                      })
                      dayEntries.forEach((e, ei) => {
                        rows.push(
                          <tr key={`${dateStr}-e-${e.id}`} style={{ borderBottom: `1px solid ${theme.colors.borderSoft}` }}>
                            {dayOrders.length === 0 && ei === 0 && (
                              <td rowSpan={totalRows} style={{ padding: '10px 14px', verticalAlign: 'top' }}>
                                <span className="mono" style={{ fontSize: 13, color: theme.colors.text }}>{String(dayNum).padStart(2, '0')}</span>
                                <span style={{ marginLeft: 6, fontSize: 11, color: theme.colors.textFaint }}>{dow}</span>
                              </td>
                            )}
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{
                                padding: '2px 8px', background: 'rgba(255,165,0,0.12)',
                                borderRadius: 4, fontSize: 11.5, color: theme.colors.warm, fontWeight: 500,
                              }}>{e.description}</span>
                            </td>
                            <td style={{ padding: '10px 14px', fontSize: 12, color: theme.colors.textFaint, fontStyle: 'italic' }}>Avulso</td>
                            <td style={{ padding: '10px 14px', textAlign: 'right' }} className="mono tnum">
                              <span style={{ color: theme.colors.warm, fontWeight: 600 }}>{fmtBRL(e.amount, true)}</span>
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <Badge color={e.batch_id ? (e.batch_status === 'paid' ? 'mint' : 'gold') : 'warm'}>
                                {e.batch_id ? (e.batch_status === 'paid' ? 'Pago' : 'Em lote') : 'Pendente'}
                              </Badge>
                            </td>
                          </tr>
                        )
                      })
                      return rows
                    })
                  })()}
                </tbody>
                <tfoot>
                  <tr style={{ background: theme.colors.bgSecondary }}>
                    <td style={{ padding: '12px 14px' }} className="eyebrow">total</td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: theme.colors.textMuted }}>
                      {data.orders.length} trabalho{data.orders.length !== 1 ? 's' : ''}
                      {(data.monthEntries || []).length > 0 && ` + ${(data.monthEntries || []).length} avulso(s)`}
                    </td>
                    <td style={{ padding: '12px 14px' }}></td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: theme.colors.primary, fontWeight: 600 }} className="mono tnum">
                      {fmtBRL(
                        data.orders.reduce((s, o) => s + (o.editor_value || 0), 0) +
                        (data.monthEntries || []).reduce((s, e) => s + (e.amount || 0), 0)
                      , true)}
                    </td>
                    <td style={{ padding: '12px 14px' }}></td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <div style={{ padding: 32, textAlign: 'center', color: theme.colors.textMuted, fontSize: 13 }}>
                Nenhum trabalho registrado neste mês
              </div>
            )}
          </div>

          {/* Unpaid */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="display" style={{ fontSize: 17, color: theme.colors.text, margin: 0 }}>
              Pendentes ({data.unpaid.length + (data.unpaidEntries || []).length})
            </h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setShowEntryModal(true)}
                style={{ ...btnSoft, fontSize: 12, padding: '8px 14px' }}
              >
                <Icon name="plus" size={12} /> Lançamento avulso
              </button>
              {(data.unpaid.length > 0 || (data.unpaidEntries || []).length > 0) && (
                <button
                  onClick={() => { if (totalSelectedCount === 0) { alert('Selecione pelo menos um item'); return } setShowBatchModal(true) }}
                  style={{ ...btnPrimary, fontSize: 12, padding: '8px 14px' }}
                >
                  Registrar pagamento ({totalSelectedCount})
                </button>
              )}
            </div>
          </div>

          {(data.unpaid.length > 0 || (data.unpaidEntries || []).length > 0) ? (
            <div style={{ ...panelStyle, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: theme.colors.bgSecondary }}>
                    <th style={{ width: 40, padding: '10px 16px', borderBottom: `1px solid ${theme.colors.border}` }}>
                      <input type="checkbox" checked={selected.length === data.unpaid.length && selectedEntries.length === (data.unpaidEntries || []).length && (data.unpaid.length + (data.unpaidEntries || []).length) > 0} onChange={selectAll} style={{ cursor: 'pointer', accentColor: theme.colors.primary }} />
                    </th>
                    {['Descrição', 'Tipo', 'Valor', 'Info', 'Data', ''].map(h => (
                      <th key={h} className="eyebrow" style={{ padding: '10px 16px', textAlign: 'left', borderBottom: `1px solid ${theme.colors.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.unpaid.map(o => (
                    <tr key={`order-${o.id}`}
                      onClick={() => toggleSelect(o.id)}
                      style={{ background: selected.includes(o.id) ? theme.colors.primaryMuted : 'transparent', cursor: 'pointer', borderBottom: `1px solid ${theme.colors.borderSoft}` }}>
                      <td style={{ padding: '10px 16px' }}>
                        <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggleSelect(o.id)} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer', accentColor: theme.colors.primary }} />
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: theme.colors.text }}>{o.title}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <Badge color="blue">Trabalho</Badge>
                      </td>
                      <td style={{ padding: '10px 16px', fontWeight: 600 }} className="mono tnum">
                        <span style={{ color: theme.colors.mint }}>{fmtBRL(o.editor_value, true)}</span>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: theme.colors.textMuted }}>{o.client_name}</td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: theme.colors.textMuted }}>
                        {o.updated_at ? new Date(o.updated_at).toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td style={{ padding: '10px 16px' }}></td>
                    </tr>
                  ))}
                  {(data.unpaidEntries || []).map(e => (
                    <tr key={`entry-${e.id}`}
                      onClick={() => toggleSelectEntry(e.id)}
                      style={{ background: selectedEntries.includes(e.id) ? 'rgba(255,165,0,0.08)' : 'transparent', cursor: 'pointer', borderBottom: `1px solid ${theme.colors.borderSoft}` }}>
                      <td style={{ padding: '10px 16px' }}>
                        <input type="checkbox" checked={selectedEntries.includes(e.id)} onChange={() => toggleSelectEntry(e.id)} onClick={ev => ev.stopPropagation()} style={{ cursor: 'pointer', accentColor: theme.colors.warm }} />
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: theme.colors.text }}>{e.description}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <Badge color="warm">Avulso</Badge>
                      </td>
                      <td style={{ padding: '10px 16px', fontWeight: 600 }} className="mono tnum">
                        <span style={{ color: theme.colors.warm }}>{fmtBRL(e.amount, true)}</span>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: theme.colors.textMuted }}>—</td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: theme.colors.textMuted }}>
                        {e.entry_date ? new Date(e.entry_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <button onClick={ev => { ev.stopPropagation(); handleDeleteEntry(e.id) }} style={{ padding: '3px 8px', background: theme.colors.dangerMuted, border: 'none', borderRadius: 4, color: theme.colors.danger, cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>Excluir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ ...panelStyle, textAlign: 'center', padding: 24, color: theme.colors.textMuted, fontSize: 13 }}>
              Nenhum pagamento pendente
            </div>
          )}

          {/* Batches */}
          <h3 className="display" style={{ fontSize: 17, color: theme.colors.text, margin: 0 }}>Lotes de pagamento</h3>
          {data.batches.length > 0 ? (
            <div style={{ ...panelStyle, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: theme.colors.bgSecondary }}>
                    {['#', 'Valor', 'Itens', 'Status', 'Data', 'Ações'].map(h => (
                      <th key={h} className="eyebrow" style={{ padding: '10px 16px', textAlign: 'left', borderBottom: `1px solid ${theme.colors.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.batches.map(b => (
                    <tr key={b.id} className="row-hover" style={{ borderBottom: `1px solid ${theme.colors.borderSoft}` }}>
                      <td style={{ padding: '12px 16px' }} className="mono tnum">
                        <span style={{ color: theme.colors.textFaint }}>LT-</span>{b.id}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600 }} className="mono tnum">{fmtBRL(b.total_amount, true)}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: theme.colors.textMuted }}>{b.item_count} trabalho(s)</td>
                      <td style={{ padding: '12px 16px' }}>
                        <Badge color={b.status === 'paid' ? 'mint' : 'gold'}>{b.status === 'paid' ? 'Pago' : 'Pendente'}</Badge>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: theme.colors.textMuted }} className="mono">
                        {new Date(b.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td style={{ padding: '12px 16px', display: 'flex', gap: 6 }}>
                        <button onClick={() => openBatchDetail(b)} style={{ padding: '4px 10px', background: theme.colors.primaryMuted, border: 'none', borderRadius: 4, color: theme.colors.primary, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Ver</button>
                        {b.status === 'pending' && (
                          <button onClick={() => handleDeleteBatch(b.id)} style={{ padding: '4px 10px', background: theme.colors.dangerMuted, border: 'none', borderRadius: 4, color: theme.colors.danger, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Excluir</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ ...panelStyle, textAlign: 'center', padding: 24, color: theme.colors.textMuted, fontSize: 13 }}>
              Nenhum lote criado
            </div>
          )}
        </>
      )}

      {/* Create batch modal */}
      <Modal open={showBatchModal} onClose={() => setShowBatchModal(false)} title="Registrar pagamento" subtitle="lote" width={520}>
        <div style={{ marginBottom: 16 }}>
          {selected.length > 0 && (
            <p style={{ fontSize: 13, color: theme.colors.text, marginBottom: 6 }}>
              <strong>{selected.length}</strong> trabalho(s):{' '}
              <strong style={{ color: theme.colors.mint }} className="mono tnum">
                {fmtBRL(data?.unpaid?.filter(o => selected.includes(o.id)).reduce((s, o) => s + (o.editor_value || 0), 0) || 0)}
              </strong>
            </p>
          )}
          {selectedEntries.length > 0 && (
            <p style={{ fontSize: 13, color: theme.colors.text, marginBottom: 6 }}>
              <strong>{selectedEntries.length}</strong> lançamento(s) avulso(s):{' '}
              <strong style={{ color: theme.colors.warm }} className="mono tnum">
                {fmtBRL((data?.unpaidEntries || []).filter(e => selectedEntries.includes(e.id)).reduce((s, e) => s + (e.amount || 0), 0) || 0)}
              </strong>
            </p>
          )}
          <p style={{ fontSize: 14, color: theme.colors.text, marginBottom: 12, fontWeight: 600, borderTop: `1px solid ${theme.colors.border}`, paddingTop: 8 }}>
            Total do lote:{' '}
            <span className="mono tnum" style={{ color: theme.colors.primary }}>
              {fmtBRL(
                (data?.unpaid?.filter(o => selected.includes(o.id)).reduce((s, o) => s + (o.editor_value || 0), 0) || 0) +
                ((data?.unpaidEntries || []).filter(e => selectedEntries.includes(e.id)).reduce((s, e) => s + (e.amount || 0), 0) || 0)
              )}
            </span>
          </p>
          <Field label="Observações">
            <textarea value={batchNotes} onChange={e => setBatchNotes(e.target.value)} rows={3} placeholder="Observações…" style={{ ...inputStyle, resize: 'vertical', fontFamily: theme.fonts.ui }} />
          </Field>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={btnSoft} onClick={() => setShowBatchModal(false)}>Cancelar</button>
          <button onClick={handleCreateBatch} style={btnPrimary}>Criar lote</button>
        </div>
      </Modal>

      {/* Batch detail modal */}
      <Modal open={!!detailModal} onClose={() => { setDetailModal(null); setDetailData(null); setProofUrl('') }} title={`Lote #${detailModal?.id || ''}`} width={620}>
        {detailData ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
              <div>
                <div className="eyebrow">editor</div>
                <div style={{ fontSize: 14, color: theme.colors.text, marginTop: 2 }}>{detailData.batch?.editor_name}</div>
              </div>
              <div>
                <div className="eyebrow">valor total</div>
                <div className="display tnum" style={{ fontSize: 24, color: theme.colors.mint, marginTop: 2 }}>{fmtBRL(detailData.batch?.total_amount)}</div>
              </div>
              <Badge color={detailData.batch?.status === 'paid' ? 'mint' : 'gold'}>{detailData.batch?.status === 'paid' ? 'Pago' : 'Pendente'}</Badge>
            </div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>itens</div>
            <div style={{ ...panelStyle, padding: 0, overflow: 'hidden', marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {detailData.items.map(item => (
                    <tr key={`order-${item.id}`} style={{ borderBottom: `1px solid ${theme.colors.borderSoft}` }}>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: theme.colors.text }}>{item.order_title}</td>
                      <td style={{ padding: '10px 16px' }}><Badge color="blue">Trabalho</Badge></td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: theme.colors.textMuted }}>{item.client_name}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }} className="mono tnum">{fmtBRL(item.amount, true)}</td>
                    </tr>
                  ))}
                  {(detailData.entries || []).map(entry => (
                    <tr key={`entry-${entry.id}`} style={{ borderBottom: `1px solid ${theme.colors.borderSoft}` }}>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: theme.colors.text }}>{entry.description}</td>
                      <td style={{ padding: '10px 16px' }}><Badge color="warm">Avulso</Badge></td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: theme.colors.textMuted }}>
                        {entry.entry_date ? new Date(entry.entry_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }} className="mono tnum">{fmtBRL(entry.amount, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detailModal?.status === 'pending' && (
              <div style={{ paddingTop: 14, borderTop: `1px solid ${theme.colors.border}` }}>
                <Field label="Comprovante (URL)">
                  <input value={proofUrl} onChange={e => setProofUrl(e.target.value)} placeholder="Link do comprovante…" style={inputStyle} />
                </Field>
                <button onClick={() => handlePayBatch(detailModal.id)} style={{ ...btnPrimary, marginTop: 12, background: theme.colors.mint, color: theme.colors.bg }}>
                  Confirmar pagamento ao editor
                </button>
              </div>
            )}
          </div>
        ) : <Spinner />}
      </Modal>

      {/* Entry creation modal */}
      <Modal open={showEntryModal} onClose={() => setShowEntryModal(false)} title="Lançamento avulso" subtitle="pagamento" width={460}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Valor (R$)">
            <input type="number" step="0.01" min="0" value={entryForm.amount} onChange={e => setEntryForm(f => ({ ...f, amount: e.target.value }))} placeholder="0,00" style={inputStyle} />
          </Field>
          <Field label="Descrição / motivo">
            <textarea value={entryForm.description} onChange={e => setEntryForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Descreva o motivo do lançamento…" style={{ ...inputStyle, resize: 'vertical', fontFamily: theme.fonts.ui }} />
          </Field>
          <Field label="Data (opcional)">
            <input type="date" value={entryForm.entry_date} onChange={e => setEntryForm(f => ({ ...f, entry_date: e.target.value }))} style={inputStyle} />
          </Field>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button style={btnSoft} onClick={() => setShowEntryModal(false)}>Cancelar</button>
          <button onClick={handleCreateEntry} style={btnPrimary} disabled={!entryForm.amount || !entryForm.description}>Registrar</button>
        </div>
      </Modal>
    </div>
  )
}
