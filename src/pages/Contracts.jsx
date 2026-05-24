// src/pages/Contracts.jsx — gestor contract management with clause builder
import { useState, useEffect } from 'react'
import api from '../api'
import theme from '../styles/theme'
import Modal from '../components/Modal'
import {
  Icon, Spinner, Field,
  inputStyle, btnPrimary, btnGhost, btnDanger, btnSoft,
  panelStyle, fmtBRL,
} from '../components/ui'

export default function Contracts() {
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [clients, setClients] = useState([])
  const [detailContract, setDetailContract] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const [c, cl] = await Promise.all([
        api.contracts.list(),
        api.clients.list(),
      ])
      setContracts(c)
      setClients(cl)
    } catch (err) { console.error(err) } finally { setLoading(false) }
  }

  async function openDetail(contract) {
    setDetailLoading(true)
    setDetailContract(contract)
    try {
      const full = await api.contracts.get(contract.id)
      setDetailContract(full)
    } catch (err) { console.error(err) } finally { setDetailLoading(false) }
  }

  function startEdit(contract) {
    setEditing(contract)
    setShowForm(true)
  }

  async function handleDelete(id) {
    if (!confirm('Excluir este contrato permanentemente?')) return
    try {
      await api.contracts.delete(id)
      setContracts(prev => prev.filter(c => c.id !== id))
      setDetailContract(null)
    } catch (err) { alert(err.message) }
  }

  if (loading) return <Spinner />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>gestao</div>
          <h2 className="display" style={{ fontSize: 32, color: theme.colors.text, margin: 0 }}>
            Contratos
          </h2>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true) }} style={btnPrimary}>
          <Icon name="plus" size={14} />
          Novo contrato
        </button>
      </div>

      {/* Contracts list */}
      {contracts.length === 0 ? (
        <div style={{ ...panelStyle, textAlign: 'center', padding: 60, color: theme.colors.textMuted }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>Nenhum contrato criado ainda.</div>
          <div style={{ fontSize: 12.5, color: theme.colors.textFaint }}>
            Crie contratos mensais para seus clientes com clausulas personalizadas.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {contracts.map(c => (
            <div key={c.id} style={{ ...panelStyle, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}
              onClick={() => openDetail(c)}
              className="row-hover"
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: theme.colors.text, marginBottom: 4 }}>
                  {c.title}
                </div>
                <div style={{ fontSize: 12, color: theme.colors.textMuted }}>
                  {c.client_name || 'Sem cliente'}
                  {c.start_date && ` · ${new Date(c.start_date).toLocaleDateString('pt-BR')} - ${c.end_date ? new Date(c.end_date).toLocaleDateString('pt-BR') : '...'}`}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {c.monthly_videos > 0 && (
                  <span className="mono tnum" style={{ fontSize: 12, color: theme.colors.primary }}>
                    {c.monthly_videos} videos/mes
                  </span>
                )}
                {c.monthly_value > 0 && (
                  <span className="mono tnum" style={{ fontSize: 13, color: theme.colors.mint, fontWeight: 500 }}>
                    {fmtBRL(c.monthly_value)}
                  </span>
                )}
                <span style={{
                  padding: '3px 10px', borderRadius: 6, fontSize: 10.5, fontWeight: 600,
                  fontFamily: theme.fonts.mono, textTransform: 'uppercase', letterSpacing: '0.05em',
                  background: c.status === 'active' ? 'rgba(124, 224, 184, 0.12)' : c.status === 'draft' ? theme.colors.bgSecondary : 'rgba(244, 115, 131, 0.12)',
                  color: c.status === 'active' ? theme.colors.mint : c.status === 'draft' ? theme.colors.textMuted : theme.colors.danger,
                }}>
                  {c.status === 'active' ? 'ativo' : c.status === 'draft' ? 'rascunho' : 'encerrado'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Contract form modal */}
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null) }} title={editing ? 'Editar contrato' : 'Novo contrato'} width={640}>
        <ContractForm
          editing={editing}
          clients={clients}
          onSave={() => { setShowForm(false); setEditing(null); load() }}
          onCancel={() => { setShowForm(false); setEditing(null) }}
        />
      </Modal>

      {/* Contract detail modal */}
      <Modal open={!!detailContract} onClose={() => setDetailContract(null)} title={detailContract?.title} subtitle="contrato" width={680}>
        {detailContract && (
          <ContractDetail
            contract={detailContract}
            loading={detailLoading}
            onEdit={() => { setDetailContract(null); startEdit(detailContract) }}
            onDelete={() => handleDelete(detailContract.id)}
          />
        )}
      </Modal>
    </div>
  )
}

function ContractForm({ editing, clients, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: editing?.title || '',
    client_id: editing?.client_id || '',
    status: editing?.status || 'active',
    start_date: editing?.start_date || '',
    end_date: editing?.end_date || '',
    monthly_videos: editing?.monthly_videos || '',
    monthly_value: editing?.monthly_value || '',
    notes: editing?.notes || '',
  })
  const [clauses, setClauses] = useState([])
  const [saving, setSaving] = useState(false)
  const [loadingClauses, setLoadingClauses] = useState(!!editing)

  useEffect(() => {
    if (editing) {
      api.contracts.get(editing.id).then(full => {
        setClauses(full.clauses || [])
        setLoadingClauses(false)
      }).catch(() => setLoadingClauses(false))
    }
  }, [editing])

  function addClause() {
    setClauses(prev => [...prev, { title: '', content: '', position: prev.length + 1 }])
  }

  function updateClause(idx, field, value) {
    setClauses(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c))
  }

  function removeClause(idx) {
    setClauses(prev => prev.filter((_, i) => i !== idx).map((c, i) => ({ ...c, position: i + 1 })))
  }

  function moveClause(idx, dir) {
    const newClauses = [...clauses]
    const target = idx + dir
    if (target < 0 || target >= newClauses.length) return
    ;[newClauses[idx], newClauses[target]] = [newClauses[target], newClauses[idx]]
    setClauses(newClauses.map((c, i) => ({ ...c, position: i + 1 })))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return alert('Titulo e obrigatorio')
    setSaving(true)
    try {
      const payload = {
        ...form,
        monthly_videos: form.monthly_videos ? Number(form.monthly_videos) : 0,
        monthly_value: form.monthly_value ? Number(form.monthly_value) : 0,
        client_id: form.client_id || null,
        clauses: clauses.map((c, i) => ({ title: c.title, content: c.content, position: i + 1 })),
      }
      if (editing) {
        await api.contracts.update(editing.id, payload)
      } else {
        await api.contracts.create(payload)
      }
      onSave()
    } catch (err) { alert(err.message) } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Titulo" required>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            style={inputStyle} placeholder="Contrato de producao mensal" />
        </Field>
        <Field label="Cliente">
          <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
            style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="">Selecionar cliente</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <Field label="Status">
          <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
            style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="active">Ativo</option>
            <option value="draft">Rascunho</option>
            <option value="ended">Encerrado</option>
          </select>
        </Field>
        <Field label="Inicio">
          <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
            style={inputStyle} />
        </Field>
        <Field label="Termino">
          <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
            style={inputStyle} />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Videos por mes">
          <input type="number" min="0" value={form.monthly_videos} onChange={e => setForm(f => ({ ...f, monthly_videos: e.target.value }))}
            style={inputStyle} placeholder="Ex: 8" />
        </Field>
        <Field label="Valor mensal (R$)">
          <input type="number" min="0" step="0.01" value={form.monthly_value} onChange={e => setForm(f => ({ ...f, monthly_value: e.target.value }))}
            style={inputStyle} placeholder="Ex: 5000" />
        </Field>
      </div>

      <Field label="Observacoes">
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} placeholder="Notas internas sobre o contrato..." />
      </Field>

      {/* Clauses section */}
      <div style={{ borderTop: `1px solid ${theme.colors.border}`, paddingTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div className="eyebrow">Clausulas ({clauses.length})</div>
          <button type="button" onClick={addClause} style={{ ...btnGhost, padding: '6px 12px', fontSize: 12 }}>
            <Icon name="plus" size={12} /> Adicionar clausula
          </button>
        </div>

        {loadingClauses ? <Spinner size={24} /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {clauses.map((clause, idx) => (
              <div key={idx} style={{
                padding: 14, background: theme.colors.bg,
                border: `1px solid ${theme.colors.border}`, borderRadius: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span className="mono" style={{ fontSize: 11, color: theme.colors.textFaint, minWidth: 28 }}>
                    {idx + 1}.
                  </span>
                  <input
                    value={clause.title}
                    onChange={e => updateClause(idx, 'title', e.target.value)}
                    placeholder="Titulo da clausula"
                    style={{ ...inputStyle, padding: '6px 10px', fontSize: 12.5, fontWeight: 500 }}
                  />
                  <button type="button" onClick={() => moveClause(idx, -1)} disabled={idx === 0}
                    style={{ padding: 4, border: 'none', background: 'transparent', color: theme.colors.textMuted, cursor: 'pointer', opacity: idx === 0 ? 0.3 : 1 }}>
                    <Icon name="arrowUp" size={12} />
                  </button>
                  <button type="button" onClick={() => moveClause(idx, 1)} disabled={idx === clauses.length - 1}
                    style={{ padding: 4, border: 'none', background: 'transparent', color: theme.colors.textMuted, cursor: 'pointer', opacity: idx === clauses.length - 1 ? 0.3 : 1 }}>
                    <Icon name="arrowDown" size={12} />
                  </button>
                  <button type="button" onClick={() => removeClause(idx)}
                    style={{ padding: 4, border: 'none', background: 'transparent', color: theme.colors.danger, cursor: 'pointer' }}>
                    <Icon name="x" size={12} />
                  </button>
                </div>
                <textarea
                  value={clause.content}
                  onChange={e => updateClause(idx, 'content', e.target.value)}
                  placeholder="Conteudo da clausula..."
                  rows={3}
                  style={{ ...inputStyle, fontSize: 12.5, resize: 'vertical', minHeight: 60 }}
                />
              </div>
            ))}
            {clauses.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: theme.colors.textFaint, fontSize: 12.5, border: `1px dashed ${theme.colors.border}`, borderRadius: 8 }}>
                Nenhuma clausula adicionada. Clique em "Adicionar clausula" acima.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 10, borderTop: `1px solid ${theme.colors.border}` }}>
        <button type="button" onClick={onCancel} style={btnGhost}>Cancelar</button>
        <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Salvando...' : editing ? 'Salvar alteracoes' : 'Criar contrato'}
        </button>
      </div>
    </form>
  )
}

function ContractDetail({ contract, loading, onEdit, onDelete }) {
  if (loading) return <Spinner />

  const clauses = contract.clauses || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Info grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Cliente</div>
          <div style={{ fontSize: 13.5, color: theme.colors.text }}>{contract.client_name || '---'}</div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Periodo</div>
          <div style={{ fontSize: 13, color: theme.colors.text }}>
            {contract.start_date ? new Date(contract.start_date).toLocaleDateString('pt-BR') : '---'}
            {' - '}
            {contract.end_date ? new Date(contract.end_date).toLocaleDateString('pt-BR') : '...'}
          </div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Status</div>
          <span style={{
            padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            fontFamily: theme.fonts.mono, textTransform: 'uppercase',
            background: contract.status === 'active' ? 'rgba(124,224,184,0.12)' : contract.status === 'draft' ? theme.colors.bgSecondary : 'rgba(244,115,131,0.12)',
            color: contract.status === 'active' ? theme.colors.mint : contract.status === 'draft' ? theme.colors.textMuted : theme.colors.danger,
          }}>
            {contract.status === 'active' ? 'ativo' : contract.status === 'draft' ? 'rascunho' : 'encerrado'}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ ...panelStyle, padding: 16, textAlign: 'center' }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Videos/mes</div>
          <div className="display tnum" style={{ fontSize: 28, color: theme.colors.primary }}>
            {contract.monthly_videos || 0}
          </div>
        </div>
        <div style={{ ...panelStyle, padding: 16, textAlign: 'center' }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Valor mensal</div>
          <div className="mono tnum" style={{ fontSize: 20, color: theme.colors.mint, fontWeight: 600 }}>
            {fmtBRL(contract.monthly_value || 0)}
          </div>
        </div>
      </div>

      {contract.notes && (
        <div style={{ padding: 14, background: theme.colors.bg, border: `1px solid ${theme.colors.border}`, borderRadius: 8 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Observacoes</div>
          <div style={{ fontSize: 13, color: theme.colors.textSecondary, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {contract.notes}
          </div>
        </div>
      )}

      {/* Clauses */}
      {clauses.length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Clausulas ({clauses.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {clauses.map((clause, idx) => (
              <div key={clause.id || idx} style={{
                padding: '14px 16px', background: theme.colors.bg,
                border: `1px solid ${theme.colors.border}`, borderRadius: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span className="mono" style={{ fontSize: 11, color: theme.colors.primary, fontWeight: 600 }}>
                    {clause.position || idx + 1}.
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: theme.colors.text }}>
                    {clause.title || 'Clausula sem titulo'}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: theme.colors.textSecondary, lineHeight: 1.6, whiteSpace: 'pre-wrap', paddingLeft: 24 }}>
                  {clause.content}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, paddingTop: 10, borderTop: `1px solid ${theme.colors.border}` }}>
        <button onClick={onEdit} style={btnSoft}>
          <Icon name="edit" size={13} /> Editar
        </button>
        <button onClick={onDelete} style={{ ...btnDanger, marginLeft: 'auto' }}>
          <Icon name="trash" size={13} /> Excluir
        </button>
      </div>
    </div>
  )
}
