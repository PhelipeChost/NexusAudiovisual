// src/pages/EditorBoard.jsx — kanban do editor com restrições de coluna
import { useState, useEffect, useRef } from 'react'
import api from '../api'
import theme from '../styles/theme'
import Modal from '../components/Modal'
import VideoPlayer from '../components/VideoPlayer'
import OrderComments from '../components/OrderComments'
import {
  Icon, Avatar, Spinner,
  panelStyle, PRIORITY, fmtBRL, daysUntil,
} from '../components/ui'

const LOCKED_COLUMNS = ['nao iniciado', 'finalizado']

function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function isLocked(colName) {
  return LOCKED_COLUMNS.includes(normalize(colName))
}

export default function EditorBoard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedClient, setSelectedClient] = useState(null)
  const [dragOverCol, setDragOverCol] = useState(null)
  const [detailOrder, setDetailOrder] = useState(null)
  const dragItem = useRef(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const d = await api.editorPortal.getBoard()
      setData(d)
      if (d.clients?.length > 0 && !selectedClient) {
        setSelectedClient(d.clients[0].id)
      }
    } catch (err) { console.error(err) } finally { setLoading(false) }
  }

  if (loading) return <Spinner />

  const clients = data?.clients || []
  const activeClient = clients.find(c => c.id === selectedClient) || clients[0]

  if (clients.length === 0) {
    return (
      <div style={{ ...panelStyle, textAlign: 'center', padding: 60, color: theme.colors.textMuted }}>
        <div style={{ fontSize: 14, marginBottom: 8 }}>Nenhum pedido atribuido ainda.</div>
        <div style={{ fontSize: 12.5, color: theme.colors.textFaint }}>
          Quando um gestor atribuir pedidos a voce, o mapa aparecera aqui.
        </div>
      </div>
    )
  }

  const columns = activeClient?.columns || []
  const orders = activeClient?.orders || []

  function getOrdersByColumn(colId) {
    return orders
      .filter(o => o.column_id === colId)
      .sort((a, b) => {
        if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
        if (a.due_date && !b.due_date) return -1
        if (!a.due_date && b.due_date) return 1
        return 0
      })
  }

  function handleDragStart(e, order, colName) {
    if (isLocked(colName)) {
      e.preventDefault()
      return
    }
    dragItem.current = order
    e.dataTransfer.effectAllowed = 'move'
    e.currentTarget.style.opacity = '0.4'
  }

  function handleDragEnd(e) {
    e.currentTarget.style.opacity = '1'
    dragItem.current = null
    setDragOverCol(null)
  }

  function handleDragOver(e, colId, colName) {
    if (isLocked(colName)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverCol(colId)
  }

  async function handleDeliver(orderId, deliveryLink) {
    await api.editorPortal.deliver(orderId, { delivery_link: deliveryLink })
    loadData()
  }

  async function handleDrop(e, columnId, colName) {
    e.preventDefault()
    setDragOverCol(null)
    const order = dragItem.current
    if (!order || order.column_id === columnId) return
    if (isLocked(colName)) return

    // Optimistic update via setData so React re-renders immediately
    setData(prev => {
      if (!prev) return prev
      const updated = { ...prev, clients: prev.clients.map(c => {
        if (c.id !== selectedClient && c.id !== clients[0]?.id) return c
        return { ...c, orders: c.orders.map(o => o.id === order.id ? { ...o, column_id: columnId } : o) }
      })}
      return updated
    })

    try {
      await api.orders.update(order.id, { column_id: columnId })
      loadData()
    } catch (err) {
      alert(err.message)
      loadData()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 64px - 24px - 48px)' }}>
      {/* Client tabs */}
      {clients.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexShrink: 0, flexWrap: 'wrap' }}>
          {clients.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedClient(c.id)}
              style={{
                padding: '7px 16px', borderRadius: 8, fontSize: 13,
                background: selectedClient === c.id ? theme.colors.surfaceHover : 'transparent',
                color: selectedClient === c.id ? theme.colors.text : theme.colors.textMuted,
                border: `1px solid ${selectedClient === c.id ? theme.colors.borderLight : theme.colors.border}`,
                cursor: 'pointer', fontWeight: selectedClient === c.id ? 500 : 400,
              }}
            >
              {c.name}
              {c.company_name && (
                <span style={{ fontSize: 10, color: theme.colors.textFaint, marginLeft: 6 }}>
                  {c.company_name}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Kanban columns */}
      <div style={{ display: 'flex', gap: 10, flex: 1, overflowX: 'auto', paddingBottom: 8 }}>
        {columns.map(column => {
          const colOrders = getOrdersByColumn(column.id)
          const isOver = dragOverCol === column.id
          const locked = isLocked(column.name)
          return (
            <div
              key={column.id}
              onDragOver={e => handleDragOver(e, column.id, column.name)}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={e => handleDrop(e, column.id, column.name)}
              style={{
                minWidth: 0, width: 0, flexShrink: 0, flex: '1 1 0',
                background: isOver ? theme.colors.surfaceHover : theme.colors.bgSecondary,
                border: `1px solid ${isOver ? column.color + '80' : theme.colors.border}`,
                borderRadius: 12,
                display: 'flex', flexDirection: 'column',
                transition: 'border-color 0.12s, background 0.12s',
                opacity: locked ? 0.65 : 1,
              }}
            >
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
                {locked && (
                  <span style={{ fontSize: 9, color: theme.colors.textFaint, marginLeft: 2 }}>
                    (gestor)
                  </span>
                )}
                <span className="mono" style={{
                  marginLeft: 'auto', fontSize: 11,
                  color: theme.colors.textFaint,
                  padding: '2px 8px', background: theme.colors.bg,
                  borderRadius: 4,
                }}>
                  {colOrders.length}
                </span>
              </div>

              <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {colOrders.map(order => (
                  <EditorOrderCard
                    key={order.id}
                    order={{ ...order, column_name: column.name }}
                    locked={locked}
                    onDragStart={e => handleDragStart(e, order, column.name)}
                    onDragEnd={handleDragEnd}
                    onDeliver={handleDeliver}
                    onDetail={() => setDetailOrder({ ...order, column_name: column.name, column_color: column.color })}
                  />
                ))}
                {colOrders.length === 0 && !locked && (
                  <div style={{
                    padding: '24px 14px',
                    border: `1px dashed ${theme.colors.border}`,
                    borderRadius: 8, textAlign: 'center',
                    fontSize: 11.5, color: theme.colors.textFaint,
                  }}>
                    arraste cards aqui
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Order detail modal */}
      <Modal open={!!detailOrder} onClose={() => setDetailOrder(null)} width={580}>
        {detailOrder && <EditorOrderDetail order={detailOrder} />}
      </Modal>
    </div>
  )
}

function EditorOrderCard({ order, locked, onDragStart, onDragEnd, onDeliver, onDetail }) {
  const d = daysUntil(order.due_date)
  const overdue = d != null && d < 0
  const today = d === 0
  const [showDeliver, setShowDeliver] = useState(false)
  const [deliveryLink, setDeliveryLink] = useState('')
  const [delivering, setDelivering] = useState(false)

  // Show deliver button on columns that are editable (not locked) — typically "Para edição" or "Correção"
  const canDeliver = !locked && !['editado', 'finalizado', 'nao iniciado', 'liberado'].includes(
    (order.column_name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  )

  return (
    <div
      draggable={!locked}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        background: theme.colors.panel,
        border: `1px solid ${overdue ? 'rgba(244, 115, 131, 0.35)' : theme.colors.border}`,
        borderRadius: 10,
        padding: 12,
        cursor: locked ? 'default' : 'grab',
        transition: 'all 0.12s',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => { if (!locked) e.currentTarget.style.borderColor = overdue ? 'rgba(244, 115, 131, 0.5)' : theme.colors.borderLight }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = overdue ? 'rgba(244, 115, 131, 0.35)' : theme.colors.border }}
    >
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 2,
        background: PRIORITY[order.priority]?.color || theme.colors.primary,
        opacity: ['urgent', 'high'].includes(order.priority) ? 1 : 0.4,
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
        <div onClick={e => { e.stopPropagation(); onDetail && onDetail() }} style={{ fontSize: 13, color: theme.colors.text, lineHeight: 1.35, fontWeight: 500, cursor: 'pointer' }}>
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: theme.colors.textMuted, flexWrap: 'wrap' }}>
        {order.due_date && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: overdue ? theme.colors.danger : today ? theme.colors.warm : theme.colors.textMuted }}>
            <Icon name="clock" size={11} />
            <span className="mono tnum">
              {overdue ? `${Math.abs(d)}d atraso` : today ? 'hoje' : new Date(order.due_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            </span>
          </div>
        )}
        {order.drive_links && <Icon name="drive" size={11} color={theme.colors.textFaint} />}
      </div>

      <div style={{
        marginTop: 10, paddingTop: 8,
        borderTop: `1px solid ${theme.colors.borderSoft}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      }}>
        {canDeliver && !showDeliver && (
          <button
            onClick={e => { e.stopPropagation(); setShowDeliver(true) }}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              background: theme.colors.mint, color: '#0a0d13', border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <Icon name="check" size={11} />
            Entregar
          </button>
        )}
        {!canDeliver && <span />}
        {order.editor_value > 0 && (
          <span className="mono tnum" style={{ fontSize: 11, color: theme.colors.mint, fontWeight: 500, marginLeft: 'auto' }}>
            {fmtBRL(order.editor_value)}
          </span>
        )}
      </div>

      {/* Deliver modal inline */}
      {showDeliver && (
        <div style={{
          marginTop: 10, padding: 10, borderRadius: 8,
          background: theme.colors.bgSecondary, border: `1px solid ${theme.colors.border}`,
        }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: 11.5, color: theme.colors.textMuted, marginBottom: 6 }}>Link de entrega:</div>
          <input
            autoFocus
            value={deliveryLink}
            onChange={e => setDeliveryLink(e.target.value)}
            placeholder="https://drive.google.com/..."
            style={{
              width: '100%', padding: '6px 10px', background: theme.colors.bg,
              border: `1px solid ${theme.colors.border}`, borderRadius: 6,
              color: theme.colors.text, fontSize: 12, outline: 'none',
              fontFamily: theme.fonts.ui, marginBottom: 8,
            }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={async () => {
                setDelivering(true)
                try {
                  await onDeliver(order.id, deliveryLink)
                  setShowDeliver(false)
                  setDeliveryLink('')
                } catch (err) { alert(err.message) }
                setDelivering(false)
              }}
              disabled={delivering}
              style={{
                flex: 1, padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: theme.colors.mint, color: '#0a0d13', border: 'none',
                cursor: 'pointer', opacity: delivering ? 0.5 : 1,
              }}
            >
              {delivering ? 'Enviando...' : 'Confirmar entrega'}
            </button>
            <button
              onClick={() => { setShowDeliver(false); setDeliveryLink('') }}
              style={{
                padding: '6px 10px', borderRadius: 6, fontSize: 11,
                background: theme.colors.bg, color: theme.colors.textMuted,
                border: `1px solid ${theme.colors.border}`, cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function EditorOrderDetail({ order }) {
  const d = daysUntil(order.due_date)
  const overdue = d != null && d < 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <span className="eyebrow">pedido #{order.id}</span>
          {order.column_name && (
            <span style={{
              padding: '2px 8px', borderRadius: 4,
              background: (order.column_color || theme.colors.primary) + '22',
              color: order.column_color || theme.colors.primary,
              fontSize: 11, fontFamily: theme.fonts.mono, fontWeight: 500,
            }}>
              {order.column_name}
            </span>
          )}
          {order.source === 'client' && (
            <span style={{
              padding: '2px 8px', borderRadius: 4,
              background: 'rgba(217,183,112,0.14)', color: theme.colors.gold,
              fontSize: 10, fontFamily: theme.fonts.mono, fontWeight: 600,
              letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>
              solicitado pelo cliente
            </span>
          )}
        </div>
        <h2 className="display" style={{ fontSize: 26, lineHeight: 1.1, color: theme.colors.text, margin: 0 }}>
          {order.title}
        </h2>
      </div>

      {/* Info strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        padding: '12px 0',
        borderTop: `1px solid ${theme.colors.border}`,
        borderBottom: `1px solid ${theme.colors.border}`,
      }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Prazo</div>
          <div style={{ fontSize: 13, color: overdue ? theme.colors.danger : theme.colors.text }} className="tnum">
            {order.due_date ? new Date(order.due_date).toLocaleDateString('pt-BR') : '---'}
            {overdue && <span style={{ marginLeft: 4, fontSize: 10, color: theme.colors.danger }}>{Math.abs(d)}d</span>}
          </div>
        </div>
        <div style={{ paddingLeft: 14, borderLeft: `1px solid ${theme.colors.border}` }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Valor editor</div>
          <div className="mono tnum" style={{ fontSize: 14, fontWeight: 600, color: order.editor_value > 0 ? theme.colors.mint : theme.colors.textFaint }}>
            {order.editor_value > 0 ? fmtBRL(order.editor_value) : '---'}
          </div>
        </div>
        <div style={{ paddingLeft: 14, borderLeft: `1px solid ${theme.colors.border}` }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Prioridade</div>
          <span style={{
            padding: '2px 6px', borderRadius: 3,
            background: PRIORITY[order.priority]?.soft || theme.colors.bgSecondary,
            color: PRIORITY[order.priority]?.color || theme.colors.textMuted,
            fontSize: 10, fontFamily: theme.fonts.mono, fontWeight: 600, textTransform: 'uppercase',
          }}>
            {PRIORITY[order.priority]?.label || 'Normal'}
          </span>
        </div>
      </div>

      {/* Briefing / Description */}
      {order.briefing && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Briefing</div>
          <div style={{
            padding: 12, background: theme.colors.bg, border: `1px solid ${theme.colors.border}`,
            borderRadius: 8, fontSize: 13, color: theme.colors.textSecondary,
            lineHeight: 1.6, whiteSpace: 'pre-wrap',
          }}>
            {order.briefing}
          </div>
        </div>
      )}
      {order.description && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Descricao</div>
          <div style={{
            padding: 12, background: theme.colors.bg, border: `1px solid ${theme.colors.border}`,
            borderRadius: 8, fontSize: 13, color: theme.colors.textSecondary,
            lineHeight: 1.6, whiteSpace: 'pre-wrap',
          }}>
            {order.description}
          </div>
        </div>
      )}

      {/* Video player */}
      {order.delivery_link && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Video entregue</div>
          <VideoPlayer url={order.delivery_link} height={280} />
        </div>
      )}

      {/* Drive links */}
      {order.drive_links && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Links de material</div>
          {order.drive_links.split('\n').filter(Boolean).map((link, i) => (
            <a key={i} href={link} target="_blank" rel="noopener noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', background: theme.colors.bg,
              border: `1px solid ${theme.colors.border}`, borderRadius: 6,
              fontSize: 12, color: theme.colors.primary, wordBreak: 'break-all',
              marginBottom: 4,
            }}>
              <Icon name="link" size={11} stroke />
              <span style={{ flex: 1 }}>{link}</span>
            </a>
          ))}
        </div>
      )}

      {/* Comments */}
      <OrderComments orderId={order.id} maxHeight={260} />
    </div>
  )
}
