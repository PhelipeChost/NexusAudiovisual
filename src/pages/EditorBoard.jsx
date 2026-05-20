// src/pages/EditorBoard.jsx — kanban do editor com restrições de coluna
import { useState, useEffect, useRef } from 'react'
import api from '../api'
import theme from '../styles/theme'
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
    return orders.filter(o => o.column_id === colId)
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

  async function handleDrop(e, columnId, colName) {
    e.preventDefault()
    setDragOverCol(null)
    const order = dragItem.current
    if (!order || order.column_id === columnId) return
    if (isLocked(colName)) return

    // Optimistic update
    const prev = [...orders]
    const idx = orders.findIndex(o => o.id === order.id)
    if (idx >= 0) orders[idx] = { ...orders[idx], column_id: columnId }

    try {
      await api.orders.update(order.id, { column_id: columnId })
      loadData()
    } catch (err) {
      alert(err.message)
      loadData()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px - 28px - 48px)' }}>
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
      <div style={{ display: 'flex', gap: 14, flex: 1, overflowX: 'auto', paddingBottom: 8, minHeight: 0 }}>
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
                minWidth: 280, width: 280, flexShrink: 0,
                background: isOver ? theme.colors.surfaceHover : theme.colors.bgSecondary,
                border: `1px solid ${isOver ? column.color + '80' : theme.colors.border}`,
                borderRadius: 12,
                display: 'flex', flexDirection: 'column',
                maxHeight: '100%',
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

              <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {colOrders.map(order => (
                  <EditorOrderCard
                    key={order.id}
                    order={order}
                    locked={locked}
                    onDragStart={e => handleDragStart(e, order, column.name)}
                    onDragEnd={handleDragEnd}
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
    </div>
  )
}

function EditorOrderCard({ order, locked, onDragStart, onDragEnd }) {
  const d = daysUntil(order.due_date)
  const overdue = d != null && d < 0
  const today = d === 0

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
        <div style={{ fontSize: 13, color: theme.colors.text, lineHeight: 1.35, fontWeight: 500 }}>
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

      {order.editor_value > 0 && (
        <div style={{
          marginTop: 10, paddingTop: 8,
          borderTop: `1px solid ${theme.colors.borderSoft}`,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        }}>
          <span className="mono tnum" style={{ fontSize: 11, color: theme.colors.mint, fontWeight: 500 }}>
            {fmtBRL(order.editor_value)}
          </span>
        </div>
      )}
    </div>
  )
}
