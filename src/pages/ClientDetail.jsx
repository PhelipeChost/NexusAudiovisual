// src/pages/ClientDetail.jsx — kanban + order detail modal
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api'
import theme from '../styles/theme'
import resizeImage from '../utils/resizeImage'
import Modal from '../components/Modal'
import {
  Icon, Avatar, Spinner, Field,
  inputStyle, btnPrimary, btnSoft, btnGhost, btnDanger,
  panelStyle, PRIORITY, fmtBRL, daysUntil,
} from '../components/ui'

export default function ClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [client, setClient] = useState(null)
  const [columns, setColumns] = useState([])
  const [orders, setOrders] = useState([])
  const [editors, setEditors] = useState([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [comments, setComments] = useState([])
  const [checklist, setChecklist] = useState([])
  const [newComment, setNewComment] = useState('')
  const [newCheckItem, setNewCheckItem] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [dragOverCol, setDragOverCol] = useState(null)
  const dragItem = useRef(null)
  const [inviteLink, setInviteLink] = useState(null)
  const [showDeleteClient, setShowDeleteClient] = useState(false)
  const [deletingClient, setDeletingClient] = useState(false)
  const logoInputRef = useRef(null)
  const [templates, setTemplates] = useState([])
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [form, setForm] = useState({
    title: '', description: '', briefing: '', drive_links: '',
    priority: 'normal', due_date: '', editor_id: '', value: '', editor_value: '',
  })

  useEffect(() => { loadData(); loadTemplates() }, [id, selectedMonth])

  async function loadTemplates() {
    try {
      const t = await api.templates.list()
      setTemplates(t)
    } catch {}
  }

  async function loadData() {
    try {
      const [clientData, columnsData, ordersData, teamData] = await Promise.all([
        api.clients.get(id),
        api.clients.getColumns(id),
        api.orders.listByClient(id, selectedMonth),
        api.team.list(),
      ])
      setClient(clientData)
      setColumns(columnsData)
      setOrders(ordersData)
      setEditors(teamData)
    } catch (err) { console.error(err) }
  }

  async function handleCreateOrder(e) {
    e.preventDefault()
    try {
      await api.orders.create(id, { ...form, editor_id: form.editor_id || null })
      setShowCreateModal(false)
      setForm({ title: '', description: '', briefing: '', drive_links: '', priority: 'normal', due_date: '', editor_id: '', value: '', editor_value: '' })
      loadData()
    } catch (err) { alert(err.message) }
  }

  async function handleDeleteClient() {
    setDeletingClient(true)
    try {
      await api.clients.delete(id)
      navigate('/dashboard/clients')
    } catch (err) {
      alert(err.message)
      setDeletingClient(false)
    }
  }

  async function handleDuplicateOrder() {
    if (!selectedOrder) return
    try {
      await api.orders.create(id, {
        title: selectedOrder.title + ' (cópia)',
        description: selectedOrder.description || '',
        briefing: selectedOrder.briefing || '',
        drive_links: selectedOrder.drive_links || '',
        priority: selectedOrder.priority || 'normal',
        due_date: '',
        editor_id: selectedOrder.editor_id || null,
        value: selectedOrder.value || '',
        editor_value: selectedOrder.editor_value || '',
      })
      setShowDetailModal(false)
      loadData()
    } catch (err) { alert(err.message) }
  }

  async function handleDeleteOrder() {
    if (!selectedOrder) return
    try {
      await api.orders.delete(selectedOrder.id)
      setShowDeleteConfirm(false)
      setShowDetailModal(false)
      setSelectedOrder(null)
      loadData()
    } catch (err) { alert(err.message) }
  }

  async function openOrderDetail(order) {
    setSelectedOrder(order)
    setShowDetailModal(true)
    setShowDeleteConfirm(false)
    try {
      const [commentsData, checklistData] = await Promise.all([
        api.orders.getComments(order.id),
        api.orders.getChecklist(order.id),
      ])
      setComments(commentsData)
      setChecklist(checklistData)
    } catch (err) { console.error(err) }
  }

  async function addComment() {
    if (!newComment.trim()) return
    try {
      const comment = await api.orders.addComment(selectedOrder.id, { text: newComment })
      setComments([...comments, comment])
      setNewComment('')
    } catch (err) { alert(err.message) }
  }

  async function addCheckItem() {
    if (!newCheckItem.trim()) return
    try {
      const item = await api.orders.addChecklistItem(selectedOrder.id, { text: newCheckItem })
      setChecklist([...checklist, item])
      setNewCheckItem('')
    } catch (err) { alert(err.message) }
  }

  async function toggleCheck(item) {
    try {
      await api.orders.toggleChecklistItem(item.id, !item.done)
      setChecklist(checklist.map(c => c.id === item.id ? { ...c, done: c.done ? 0 : 1 } : c))
    } catch (err) { alert(err.message) }
  }

  function handleDragStart(e, order) {
    dragItem.current = order
    e.dataTransfer.effectAllowed = 'move'
    e.currentTarget.style.opacity = '0.4'
  }
  function handleDragEnd(e) {
    e.currentTarget.style.opacity = '1'
    dragItem.current = null
    setDragOverCol(null)
  }
  function handleDragOver(e, colId) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverCol(colId)
  }
  async function handleDrop(e, columnId) {
    e.preventDefault()
    const order = dragItem.current
    setDragOverCol(null)
    if (!order || order.column_id === columnId) return
    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, column_id: columnId } : o))
    try {
      await api.orders.update(order.id, { column_id: columnId })
      loadData()
    } catch (err) { loadData() }
  }

  function getOrdersByColumn(colId) {
    return orders
      .filter(o => o.column_id === colId)
      .sort((a, b) => {
        // Orders with due dates first, sorted ascending; then without
        if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
        if (a.due_date && !b.due_date) return -1
        if (!a.due_date && b.due_date) return 1
        return 0
      })
  }

  if (!client) return <Spinner />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 64px - 24px - 48px)' }}>
      {/* Client header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <button onClick={() => navigate('/dashboard/clients')} style={{
            ...btnSoft, padding: '7px 10px',
          }} title="Voltar">
            <Icon name="chevronLeft" size={14} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ position: 'relative', cursor: 'pointer' }}
              onClick={() => logoInputRef.current?.click()}
              title="Trocar foto do cliente"
            >
              <Avatar name={client.name} size={44} src={client.logo || undefined} />
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: 0, transition: 'opacity 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0'}
              >
                <Icon name="edit" size={16} color="#fff" />
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  try {
                    const dataUrl = await resizeImage(file, 256, 0.85)
                    await api.clients.uploadLogo(id, dataUrl)
                    loadData()
                  } catch (err) { alert(err.message) }
                }}
              />
            </div>
            <div>
              <div className="display" style={{ fontSize: 26, lineHeight: 1.1, color: theme.colors.text }}>
                {client.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                {client.contact_name && (
                  <>
                    <span style={{ fontSize: 12, color: theme.colors.textMuted }}>{client.contact_name}</span>
                    <span style={{ color: theme.colors.textFaint }}>·</span>
                  </>
                )}
                <span style={{ fontSize: 12, color: theme.colors.textMuted }}>
                  {orders.length} pedido{orders.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setShowDeleteClient(true)}
            title="Excluir cliente"
            style={{ ...btnSoft, color: theme.colors.danger, borderColor: 'rgba(244,115,131,0.3)', padding: '7px 10px' }}
          >
            <Icon name="trash" size={13} />
          </button>
          <button
            onClick={async () => {
              try {
                const data = await api.clients.invite(id)
                const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
                const url = window.location.origin + base + data.url
                setInviteLink(url)
                navigator.clipboard.writeText(url).catch(() => {})
              } catch (err) { alert(err.message) }
            }}
            style={btnGhost}
          >
            <Icon name="link" size={13} stroke />
            {inviteLink ? 'Link copiado!' : 'Convidar cliente'}
          </button>
          <button onClick={() => setShowCreateModal(true)} style={btnPrimary}>
            <Icon name="plus" size={14} />
            Novo pedido
          </button>
        </div>
      </div>

      {/* Month selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexShrink: 0 }}>
        <button onClick={() => {
          const [y, m] = selectedMonth.split('-').map(Number)
          const d = new Date(y, m - 2, 1)
          setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
        }} style={{
          padding: '5px 8px', borderRadius: 6, background: theme.colors.bgSecondary,
          border: `1px solid ${theme.colors.border}`, color: theme.colors.textMuted, cursor: 'pointer',
        }}>
          <Icon name="chevronLeft" size={12} />
        </button>
        <span style={{
          fontSize: 13, fontWeight: 500, color: theme.colors.text, minWidth: 120, textAlign: 'center',
          textTransform: 'capitalize',
        }}>
          {new Date(selectedMonth + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
        </span>
        <button onClick={() => {
          const [y, m] = selectedMonth.split('-').map(Number)
          const d = new Date(y, m, 1)
          setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
        }} style={{
          padding: '5px 8px', borderRadius: 6, background: theme.colors.bgSecondary,
          border: `1px solid ${theme.colors.border}`, color: theme.colors.textMuted, cursor: 'pointer',
        }}>
          <Icon name="chevronRight" size={12} />
        </button>
        <span className="mono" style={{ fontSize: 11, color: theme.colors.textFaint, marginLeft: 8 }}>
          {orders.length} pedido{orders.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Columns */}
      <div style={{ display: 'flex', gap: 10, flex: 1, overflowX: 'auto', paddingBottom: 8 }}>
        {columns.map(column => {
          const colOrders = getOrdersByColumn(column.id)
          const isOver = dragOverCol === column.id
          return (
            <div key={column.id}
              onDragOver={e => handleDragOver(e, column.id)}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={e => handleDrop(e, column.id)}
              style={{
                minWidth: 0, width: 0, flexShrink: 0, flex: '1 1 0',
                background: isOver ? theme.colors.surfaceHover : theme.colors.bgSecondary,
                border: `1px solid ${isOver ? column.color + '80' : theme.colors.border}`,
                borderRadius: 12,
                display: 'flex', flexDirection: 'column',
                transition: 'border-color 0.12s, background 0.12s',
              }}>
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
                  <OrderCard key={order.id}
                    order={order}
                    onClick={() => openOrderDetail(order)}
                    onDragStart={e => handleDragStart(e, order)}
                    onDragEnd={handleDragEnd}
                  />
                ))}
                {colOrders.length === 0 && (
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

      {/* Create Modal */}
      <Modal open={showCreateModal} onClose={() => { setShowCreateModal(false); setShowSaveTemplate(false) }} title="Novo pedido" subtitle={client.name} width={620}>
        <form onSubmit={handleCreateOrder} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Template selector */}
          {templates.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: theme.colors.textMuted }}>Templates:</span>
              {templates.map(t => (
                <button key={t.id} type="button" onClick={() => setForm({
                  ...form,
                  description: t.description || '',
                  briefing: t.briefing || '',
                  priority: t.priority || 'normal',
                  drive_links: t.drive_links || '',
                })} style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 11,
                  background: theme.colors.bgSecondary, border: `1px solid ${theme.colors.border}`,
                  color: theme.colors.primary, cursor: 'pointer', fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  {t.name}
                </button>
              ))}
            </div>
          )}

          <Field label="Título do vídeo" required>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              required placeholder="Ex: Vídeo institucional" style={inputStyle} />
          </Field>
          <Field label="Descrição">
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Detalhes do pedido…" rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: theme.fonts.ui }} />
          </Field>
          <Field label="Briefing">
            <textarea value={form.briefing} onChange={e => setForm({ ...form, briefing: e.target.value })}
              placeholder="Instruções detalhadas para o editor…" rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: theme.fonts.ui }} />
          </Field>
          <Field label="Links do Drive">
            <input value={form.drive_links} onChange={e => setForm({ ...form, drive_links: e.target.value })}
              placeholder="https://drive.google.com/…" style={inputStyle} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            <Field label="Valor bruto (R$)">
              <input type="number" step="0.01" min="0"
                value={form.value} onChange={e => setForm({ ...form, value: e.target.value })}
                placeholder="0,00" style={inputStyle} />
            </Field>
            <Field label="Valor editor (R$)">
              <input type="number" step="0.01" min="0"
                value={form.editor_value} onChange={e => setForm({ ...form, editor_value: e.target.value })}
                placeholder="0,00" style={inputStyle} />
            </Field>
            <Field label="Prioridade">
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="low">Baixa</option>
                <option value="normal">Normal</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </Field>
            <Field label="Prazo">
              <input type="date" value={form.due_date}
                onChange={e => setForm({ ...form, due_date: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Editor">
              <select value={form.editor_id} onChange={e => setForm({ ...form, editor_id: e.target.value })}
                style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">Selecione…</option>
                {editors.map(ed => <option key={ed.id} value={ed.id}>{ed.name}{ed.role === 'gestor' ? ' (Gestor)' : ''}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 8 }}>
            <div>
              {!showSaveTemplate ? (
                <button type="button" style={{ ...btnGhost, fontSize: 12, padding: '7px 12px' }}
                  onClick={() => setShowSaveTemplate(true)}>
                  <Icon name="plus" size={11} />
                  Salvar como template
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    value={templateName}
                    onChange={e => setTemplateName(e.target.value)}
                    placeholder="Nome do template"
                    style={{ ...inputStyle, width: 180, padding: '6px 10px', fontSize: 12 }}
                  />
                  <button type="button" style={{ ...btnPrimary, padding: '6px 10px', fontSize: 11 }}
                    onClick={async () => {
                      if (!templateName.trim()) return
                      try {
                        await api.templates.create({
                          name: templateName,
                          description: form.description,
                          briefing: form.briefing,
                          priority: form.priority,
                          drive_links: form.drive_links,
                        })
                        setShowSaveTemplate(false)
                        setTemplateName('')
                        loadTemplates()
                      } catch (err) { alert(err.message) }
                    }}>Salvar</button>
                  <button type="button" style={{ ...btnSoft, padding: '6px 10px', fontSize: 11 }}
                    onClick={() => { setShowSaveTemplate(false); setTemplateName('') }}>X</button>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={btnSoft} onClick={() => setShowCreateModal(false)}>Cancelar</button>
              <button type="submit" style={btnPrimary}>Criar pedido</button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Delete client confirmation */}
      <Modal open={showDeleteClient} onClose={() => setShowDeleteClient(false)} title="Excluir cliente" width={460}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '8px 0' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: theme.colors.dangerMuted,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="trash" size={24} color={theme.colors.danger} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: theme.colors.text, marginBottom: 6 }}>
              Excluir {client?.name}?
            </div>
            <div style={{ fontSize: 13, color: theme.colors.textMuted, lineHeight: 1.5 }}>
              O cliente sera desativado e nao aparecera mais na lista.
              Os pedidos e dados serao mantidos no sistema.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={() => setShowDeleteClient(false)} style={{ ...btnSoft, padding: '10px 22px' }} disabled={deletingClient}>
              Cancelar
            </button>
            <button onClick={handleDeleteClient} disabled={deletingClient} style={{
              ...btnPrimary, padding: '10px 22px',
              background: theme.colors.danger, color: '#fff',
              opacity: deletingClient ? 0.6 : 1,
            }}>
              <Icon name="trash" size={13} />
              {deletingClient ? 'Excluindo...' : 'Sim, excluir'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal open={showDetailModal && !!selectedOrder} onClose={() => { setShowDetailModal(false); setShowDeleteConfirm(false) }} width={780}>
        {selectedOrder && (
          <OrderDetail
            order={selectedOrder}
            comments={comments}
            checklist={checklist}
            editors={editors}
            columns={columns}
            userRole={user?.role}
            newComment={newComment} setNewComment={setNewComment}
            newCheckItem={newCheckItem} setNewCheckItem={setNewCheckItem}
            addComment={addComment} addCheckItem={addCheckItem} toggleCheck={toggleCheck}
            showDeleteConfirm={showDeleteConfirm} setShowDeleteConfirm={setShowDeleteConfirm}
            handleDelete={handleDeleteOrder}
            handleDuplicate={handleDuplicateOrder}
            onClose={() => { setShowDetailModal(false); setShowDeleteConfirm(false) }}
            onUpdate={async (field, value) => {
              try {
                const updated = await api.orders.update(selectedOrder.id, { [field]: value })
                setSelectedOrder({ ...selectedOrder, ...updated })
                loadData()
              } catch (err) { alert(err.message) }
            }}
          />
        )}
      </Modal>
    </div>
  )
}

function OrderCard({ order, onClick, onDragStart, onDragEnd }) {
  const d = daysUntil(order.due_date)
  const overdue = d != null && d < 0
  const today = d === 0
  const [showPreview, setShowPreview] = useState(false)
  const [previewPos, setPreviewPos] = useState({ horizontal: 'right', vertical: 'top' })
  const hoverTimer = useRef(null)
  const cardRef = useRef(null)

  function onEnter() {
    hoverTimer.current = setTimeout(() => {
      if (cardRef.current) {
        const rect = cardRef.current.getBoundingClientRect()
        const vw = window.innerWidth
        const vh = window.innerHeight
        const horizontal = rect.right + 316 > vw ? 'left' : 'right'
        const vertical = rect.top + 300 > vh ? 'bottom' : 'top'
        setPreviewPos({ horizontal, vertical })
      }
      setShowPreview(true)
    }, 400)
  }
  function onLeave(e) {
    clearTimeout(hoverTimer.current)
    setShowPreview(false)
    e.currentTarget.style.borderColor = overdue ? 'rgba(244, 115, 131, 0.35)' : theme.colors.border
  }

  const previewStyle = {
    position: 'absolute', width: 300, padding: 14, zIndex: 999,
    background: theme.colors.panel, border: `1px solid ${theme.colors.borderLight}`,
    borderRadius: 10, boxShadow: theme.shadows.lg,
    pointerEvents: 'none',
    ...(previewPos.horizontal === 'right'
      ? { left: '100%', marginLeft: 8 }
      : { right: '100%', marginRight: 8 }),
    ...(previewPos.vertical === 'top'
      ? { top: 0 }
      : { bottom: 0 }),
  }

  return (
    <div
      ref={cardRef}
      draggable
      onDragStart={e => { clearTimeout(hoverTimer.current); setShowPreview(false); onDragStart(e) }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      style={{
        background: theme.colors.panel,
        border: `1px solid ${overdue ? 'rgba(244, 115, 131, 0.35)' : theme.colors.border}`,
        borderRadius: 10,
        padding: 12,
        cursor: 'grab',
        transition: 'all 0.12s',
        position: 'relative',
        overflow: 'visible',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = overdue ? 'rgba(244, 115, 131, 0.5)' : theme.colors.borderLight; onEnter() }}
      onMouseLeave={onLeave}
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

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, marginTop: 12, paddingTop: 10,
        borderTop: `1px solid ${theme.colors.borderSoft}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {order.editor_name && (
            <>
              <Avatar name={order.editor_name} size={20} />
              <span style={{ fontSize: 11.5, color: theme.colors.textSecondary }}>
                {order.editor_name.split(' ')[0]}
              </span>
            </>
          )}
        </div>
        {order.value > 0 && (
          <span className="mono tnum" style={{ fontSize: 11, color: theme.colors.mint, fontWeight: 500 }}>
            R$ {Number(order.value).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        )}
      </div>

      {/* Hover preview tooltip — posição adaptativa */}
      {showPreview && (
        <div style={previewStyle}>
          <div style={{ fontSize: 14, fontWeight: 600, color: theme.colors.text, marginBottom: 10 }}>{order.title}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: theme.colors.textFaint, minWidth: 70 }}>Prioridade:</span>
              <span style={{ color: PRIORITY[order.priority]?.color }}>{PRIORITY[order.priority]?.label}</span>
            </div>
            {order.editor_name && (
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: theme.colors.textFaint, minWidth: 70 }}>Editor:</span>
                <span style={{ color: theme.colors.text }}>{order.editor_name}</span>
              </div>
            )}
            {order.due_date && (
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: theme.colors.textFaint, minWidth: 70 }}>Prazo:</span>
                <span style={{ color: overdue ? theme.colors.danger : theme.colors.text }}>
                  {new Date(order.due_date).toLocaleDateString('pt-BR')}
                  {overdue && ` (${Math.abs(d)}d atraso)`}
                </span>
              </div>
            )}
            {order.value > 0 && (
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: theme.colors.textFaint, minWidth: 70 }}>Valor:</span>
                <span className="mono" style={{ color: theme.colors.mint }}>{fmtBRL(order.value)}</span>
              </div>
            )}
            {order.editor_value > 0 && (
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: theme.colors.textFaint, minWidth: 70 }}>Valor editor:</span>
                <span className="mono" style={{ color: theme.colors.primary }}>{fmtBRL(order.editor_value)}</span>
              </div>
            )}
            {order.description && (
              <div style={{ marginTop: 4 }}>
                <div style={{ color: theme.colors.textFaint, marginBottom: 3 }}>Descrição:</div>
                <div style={{ color: theme.colors.textSecondary, lineHeight: 1.4, whiteSpace: 'pre-wrap', maxHeight: 60, overflow: 'hidden' }}>
                  {order.description}
                </div>
              </div>
            )}
            {order.briefing && (
              <div style={{ marginTop: 4 }}>
                <div style={{ color: theme.colors.textFaint, marginBottom: 3 }}>Briefing:</div>
                <div style={{ color: theme.colors.textSecondary, lineHeight: 1.4, whiteSpace: 'pre-wrap', maxHeight: 60, overflow: 'hidden' }}>
                  {order.briefing}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function OrderDetail({
  order, comments, checklist, editors, columns, userRole,
  newComment, setNewComment, newCheckItem, setNewCheckItem,
  addComment, addCheckItem, toggleCheck,
  showDeleteConfirm, setShowDeleteConfirm, handleDelete, handleDuplicate,
  onUpdate, onClose,
}) {
  const isGestor = userRole === 'gestor'
  const d = daysUntil(order.due_date)
  const overdue = d != null && d < 0
  const column = columns.find(c => c.id === order.column_id)

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 22 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <span className="eyebrow">pedido #{order.id}</span>
            {column && (
              <>
                <span style={{ color: theme.colors.textFaint }}>·</span>
                <span style={{
                  padding: '2px 8px', borderRadius: 4,
                  background: (column.color || theme.colors.primary) + '22',
                  color: column.color || theme.colors.primary,
                  fontSize: 11, fontFamily: theme.fonts.mono, fontWeight: 500,
                }}>
                  {column.name}
                </span>
              </>
            )}
            <span style={{
              padding: '2px 8px',
              background: PRIORITY[order.priority]?.soft,
              color: PRIORITY[order.priority]?.color,
              fontSize: 9, fontFamily: theme.fonts.mono, fontWeight: 600,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              borderRadius: 3,
            }}>
              {PRIORITY[order.priority]?.label}
            </span>
          </div>
          <h2 className="display" style={{ fontSize: 30, lineHeight: 1.1, letterSpacing: '-0.015em', color: theme.colors.text, margin: 0 }}>
            {order.title}
          </h2>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onClose} style={{ ...btnSoft, padding: '8px 10px' }}><Icon name="x" size={14} /></button>
        </div>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div style={{
          padding: 16, marginBottom: 20, borderRadius: 8,
          background: theme.colors.dangerMuted,
          border: `1px solid rgba(244, 115, 131, 0.3)`,
        }}>
          <p style={{ fontSize: 13, color: theme.colors.danger, marginBottom: 12, fontWeight: 500 }}>
            Tem certeza que deseja excluir este pedido? Esta ação não pode ser desfeita.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleDelete} style={{ ...btnPrimary, background: theme.colors.danger, color: 'white' }}>
              Sim, excluir
            </button>
            <button onClick={() => setShowDeleteConfirm(false)} style={btnSoft}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Metadata strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
        padding: '14px 0', marginBottom: 22,
        borderTop: `1px solid ${theme.colors.border}`,
        borderBottom: `1px solid ${theme.colors.border}`,
      }}>
        {[
          { k: 'Prazo', v: order.due_date ? (
            <span style={{ color: overdue ? theme.colors.danger : theme.colors.text }} className="tnum">
              {new Date(order.due_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
              {overdue && <span style={{ marginLeft: 6, fontSize: 11, color: theme.colors.danger }}>{Math.abs(d)}d atraso</span>}
            </span>
          ) : isGestor ? (
            <input
              type="date"
              onChange={e => { if (e.target.value) onUpdate('due_date', e.target.value) }}
              style={{
                background: 'transparent', border: `1px dashed ${theme.colors.border}`,
                borderRadius: 4, outline: 'none', padding: '2px 6px',
                color: theme.colors.primary, fontSize: 12, cursor: 'pointer',
                fontFamily: theme.fonts.mono,
              }}
            />
          ) : <span style={{ color: theme.colors.textFaint }}>Sem prazo</span> },
          { k: 'Editor', v: (
            <select value={order.editor_id || ''}
              onChange={e => onUpdate('editor_id', Number(e.target.value) || null)}
              style={{
                background: 'transparent', border: 'none', outline: 'none',
                color: theme.colors.text, fontSize: 13.5, cursor: 'pointer', padding: 0,
              }}>
              <option value="">Sem editor</option>
              {editors.map(ed => <option key={ed.id} value={ed.id}>{ed.name}{ed.role === 'gestor' ? ' (Gestor)' : ''}</option>)}
            </select>
          ) },
          { k: 'Valor bruto', v: (
            <input
              type="number" step="0.01" min="0"
              defaultValue={order.value || ''}
              onBlur={e => {
                const v = parseFloat(e.target.value) || 0
                if (v !== (order.value || 0)) onUpdate('value', v)
              }}
              style={{
                background: 'transparent', border: 'none', outline: 'none',
                color: theme.colors.mint, fontSize: 13.5, fontFamily: theme.fonts.mono,
                width: '100%', padding: 0,
              }}
              placeholder="0,00"
            />
          )},
          { k: 'Valor editor', v: (
            <input
              type="number" step="0.01" min="0"
              defaultValue={order.editor_value || ''}
              onBlur={e => {
                const v = parseFloat(e.target.value) || 0
                if (v !== (order.editor_value || 0)) onUpdate('editor_value', v)
              }}
              style={{
                background: 'transparent', border: 'none', outline: 'none',
                color: theme.colors.primary, fontSize: 13.5, fontFamily: theme.fonts.mono,
                width: '100%', padding: 0,
              }}
              placeholder="0,00"
            />
          )},
          { k: '#', v: <span className="mono" style={{ color: theme.colors.textMuted, fontSize: 13.5 }}>{order.id}</span> },
        ].map((m, i) => (
          <div key={i} style={{
            paddingLeft: i > 0 ? 18 : 0,
            borderLeft: i > 0 ? `1px solid ${theme.colors.border}` : 'none',
          }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>{m.k}</div>
            <div style={{ fontSize: 13.5, color: theme.colors.text }}>{m.v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 28 }}>
        {/* Left col */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {(isGestor || order.description) && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Descrição</div>
              {isGestor ? (
                <textarea
                  defaultValue={order.description || ''}
                  onBlur={e => {
                    const v = e.target.value
                    if (v !== (order.description || '')) onUpdate('description', v)
                  }}
                  placeholder="Adicione uma descrição…"
                  rows={3}
                  style={{
                    width: '100%', padding: 14, background: theme.colors.bg,
                    border: `1px solid ${theme.colors.border}`, borderRadius: 8,
                    fontSize: 13.5, color: theme.colors.textSecondary, lineHeight: 1.6,
                    resize: 'vertical', fontFamily: theme.fonts.ui, outline: 'none',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => e.target.style.borderColor = theme.colors.primary}
                  onMouseLeave={e => { if (document.activeElement !== e.target) e.target.style.borderColor = theme.colors.border }}
                />
              ) : (
                <div style={{
                  padding: 14, background: theme.colors.bg, border: `1px solid ${theme.colors.border}`,
                  borderRadius: 8, fontSize: 13.5, color: theme.colors.textSecondary,
                  lineHeight: 1.6, whiteSpace: 'pre-wrap',
                }}>
                  {order.description}
                </div>
              )}
            </div>
          )}

          {(isGestor || order.briefing) && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Briefing</div>
              {isGestor ? (
                <textarea
                  defaultValue={order.briefing || ''}
                  onBlur={e => {
                    const v = e.target.value
                    if (v !== (order.briefing || '')) onUpdate('briefing', v)
                  }}
                  placeholder="Adicione o briefing…"
                  rows={3}
                  style={{
                    width: '100%', padding: 14, background: theme.colors.bg,
                    border: `1px solid ${theme.colors.border}`, borderRadius: 8,
                    fontSize: 13.5, color: theme.colors.textSecondary, lineHeight: 1.6,
                    resize: 'vertical', fontFamily: theme.fonts.ui, outline: 'none',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => e.target.style.borderColor = theme.colors.primary}
                  onMouseLeave={e => { if (document.activeElement !== e.target) e.target.style.borderColor = theme.colors.border }}
                />
              ) : (
                <div style={{
                  padding: 14, background: theme.colors.bg, border: `1px solid ${theme.colors.border}`,
                  borderRadius: 8, fontSize: 13.5, color: theme.colors.textSecondary,
                  lineHeight: 1.6, whiteSpace: 'pre-wrap',
                }}>
                  {order.briefing}
                </div>
              )}
            </div>
          )}

          {order.drive_links && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Links</div>
              <a href={order.drive_links} target="_blank" rel="noopener noreferrer" style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 12px', background: theme.colors.bg,
                border: `1px solid ${theme.colors.border}`, borderRadius: 8,
                fontSize: 12.5, color: theme.colors.primary, wordBreak: 'break-all',
              }}>
                <Icon name="drive" size={13} />
                <span style={{ flex: 1 }}>{order.drive_links}</span>
                <Icon name="arrowRight" size={11} stroke />
              </a>
            </div>
          )}

          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Comentários · {comments.length}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 280, overflowY: 'auto' }}>
              {comments.map(c => (
                <div key={c.id} style={{ display: 'flex', gap: 12 }}>
                  <Avatar name={c.user_name} size={26} />
                  <div style={{ flex: 1, padding: 12, background: theme.colors.bg, border: `1px solid ${theme.colors.border}`, borderRadius: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: theme.colors.text }}>{c.user_name}</span>
                      {c.timestamp_mark && (
                        <span className="mono" style={{
                          padding: '1px 6px', background: theme.colors.goldMuted,
                          color: theme.colors.gold, fontSize: 10, borderRadius: 3,
                        }}>
                          {c.timestamp_mark}
                        </span>
                      )}
                      <span className="eyebrow" style={{ marginLeft: 'auto' }}>
                        {new Date(c.created_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: theme.colors.textSecondary, lineHeight: 1.5 }}>{c.text}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input
                value={newComment} onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addComment())}
                placeholder="Escreva um comentário…" style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={addComment} style={btnPrimary}>Enviar</button>
            </div>
          </div>
        </div>

        {/* Right col */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Checklist · {checklist.filter(c => c.done).length}/{checklist.length}
            </div>
            {checklist.length > 0 && (
              <div style={{ height: 2, background: theme.colors.bg, borderRadius: 1, marginBottom: 12 }}>
                <div style={{
                  width: `${(checklist.filter(c => c.done).length / checklist.length) * 100}%`,
                  height: '100%', background: theme.colors.mint, borderRadius: 1,
                }} />
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {checklist.map(item => (
                <div key={item.id} onClick={() => toggleCheck(item)}
                  className="row-hover"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                  }}>
                  <span style={{
                    width: 16, height: 16, flexShrink: 0, borderRadius: 4,
                    border: item.done ? 'none' : `1.5px solid ${theme.colors.borderLight}`,
                    background: item.done ? theme.colors.mint : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#0a0d13',
                  }}>
                    {item.done ? <Icon name="check" size={11} /> : null}
                  </span>
                  <span style={{
                    fontSize: 12.5,
                    color: item.done ? theme.colors.textMuted : theme.colors.text,
                    textDecoration: item.done ? 'line-through' : 'none',
                  }}>{item.text}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input
                value={newCheckItem} onChange={e => setNewCheckItem(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCheckItem())}
                placeholder="Novo item…" style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={addCheckItem} style={{ ...btnSoft, padding: '8px 12px' }}>
                <Icon name="plus" size={13} />
              </button>
            </div>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: `1px solid ${theme.colors.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={handleDuplicate}
              style={{ ...btnSoft, width: '100%', justifyContent: 'center' }}
            >
              <Icon name="plus" size={13} />
              Duplicar pedido
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{ ...btnDanger, width: '100%', justifyContent: 'center' }}
            >
              <Icon name="trash" size={13} />
              Excluir pedido
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
