// src/pages/Contracts.jsx — gestor contract management with clause builder (inspired by real contract PDF)
import { useState, useEffect } from 'react'
import api from '../api'
import theme from '../styles/theme'
import Modal from '../components/Modal'
import {
  Icon, Spinner, Field,
  inputStyle, btnPrimary, btnGhost, btnDanger, btnSoft,
  panelStyle, fmtBRL,
} from '../components/ui'

// CPF validation (algorithmic check digit validation)
function validateCPF(cpf) {
  cpf = cpf.replace(/\D/g, '')
  if (cpf.length !== 11) return false
  if (/^(\d)\1+$/.test(cpf)) return false // all same digits
  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i)
  let d1 = 11 - (sum % 11)
  if (d1 >= 10) d1 = 0
  if (parseInt(cpf[9]) !== d1) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i)
  let d2 = 11 - (sum % 11)
  if (d2 >= 10) d2 = 0
  return parseInt(cpf[10]) === d2
}

// CPF mask (000.000.000-00)
function maskCPF(v) {
  v = v.replace(/\D/g, '').slice(0, 11)
  if (v.length > 9) return v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4')
  if (v.length > 6) return v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3')
  if (v.length > 3) return v.replace(/(\d{3})(\d{1,3})/, '$1.$2')
  return v
}

// CNPJ mask (00.000.000/0001-00)
function maskCNPJ(v) {
  v = v.replace(/\D/g, '').slice(0, 14)
  if (v.length > 12) return v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, '$1.$2.$3/$4-$5')
  if (v.length > 8) return v.replace(/(\d{2})(\d{3})(\d{3})(\d{1,4})/, '$1.$2.$3/$4')
  if (v.length > 5) return v.replace(/(\d{2})(\d{3})(\d{1,3})/, '$1.$2.$3')
  if (v.length > 2) return v.replace(/(\d{2})(\d{1,3})/, '$1.$2')
  return v
}

const PARTY_TYPES = [
  { value: 'pj', label: 'Pessoa Juridica' },
  { value: 'mei', label: 'Microempreendedor (MEI)' },
  { value: 'pf', label: 'Pessoa Fisica' },
]

const STATUS_MAP = {
  active: { label: 'ativo', bg: 'rgba(124,224,184,0.12)', color: theme.colors.mint },
  draft: { label: 'rascunho', bg: theme.colors.bgSecondary, color: theme.colors.textMuted },
  expired: { label: 'expirado', bg: 'rgba(244,115,131,0.12)', color: theme.colors.danger },
  cancelled: { label: 'cancelado', bg: 'rgba(244,115,131,0.12)', color: theme.colors.danger },
}

export default function Contracts() {
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [clients, setClients] = useState([])
  const [detailContract, setDetailContract] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [previewContract, setPreviewContract] = useState(null)

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

  // Parse items_json — supports both old format (array of strings) and new format (array of {text, subtopics})
  function parseTopics(itemsJson) {
    if (!itemsJson) return []
    const parsed = typeof itemsJson === 'string' ? JSON.parse(itemsJson) : itemsJson
    if (!Array.isArray(parsed)) return []
    if (parsed.length > 0 && typeof parsed[0] === 'string') {
      return parsed.map(text => ({ text, subtopics: [] }))
    }
    return parsed.map(t => ({ text: t.text || '', subtopics: t.subtopics || [] }))
  }

  async function openDetail(contract) {
    setDetailLoading(true)
    setDetailContract(contract)
    try {
      const full = await api.contracts.get(contract.id)
      // Parse items_json in clauses to new 3-level format
      if (full.clauses) {
        full.clauses = full.clauses.map(cl => ({
          ...cl,
          topics: parseTopics(cl.items_json),
        }))
      }
      setDetailContract(full)
    } catch (err) { console.error(err) } finally { setDetailLoading(false) }
  }

  function startEdit(contract) {
    setEditing(contract)
    setDetailContract(null)
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
            Crie contratos de prestacao de servicos para seus clientes e editores.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {contracts.map(c => {
            const st = STATUS_MAP[c.status] || STATUS_MAP.draft
            return (
              <div key={c.id} style={{ ...panelStyle, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}
                onClick={() => openDetail(c)} className="row-hover"
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: theme.colors.text, marginBottom: 4 }}>
                    {c.title}
                  </div>
                  <div style={{ fontSize: 12, color: theme.colors.textMuted }}>
                    {c.client_name || 'Sem cliente vinculado'}
                    {c.start_date && ` · ${new Date(c.start_date).toLocaleDateString('pt-BR')} - ${c.end_date ? new Date(c.end_date).toLocaleDateString('pt-BR') : '...'}`}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {c.monthly_videos > 0 && (
                    <span className="mono tnum" style={{ fontSize: 12, color: theme.colors.primary }}>
                      {c.monthly_videos} videos/mes
                    </span>
                  )}
                  {(c.payment_value > 0 || c.monthly_value > 0) && (
                    <span className="mono tnum" style={{ fontSize: 13, color: theme.colors.mint, fontWeight: 500 }}>
                      {fmtBRL(c.payment_value || c.monthly_value)}
                    </span>
                  )}
                  <span style={{
                    padding: '3px 10px', borderRadius: 6, fontSize: 10.5, fontWeight: 600,
                    fontFamily: theme.fonts.mono, textTransform: 'uppercase', letterSpacing: '0.05em',
                    background: st.bg, color: st.color,
                  }}>
                    {st.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Contract form modal */}
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null) }} title={editing ? 'Editar contrato' : 'Novo contrato'} width={720}>
        <ContractForm
          editing={editing}
          clients={clients}
          onSave={() => { setShowForm(false); setEditing(null); load() }}
          onCancel={() => { setShowForm(false); setEditing(null) }}
        />
      </Modal>

      {/* Contract detail / preview modal */}
      <Modal open={!!detailContract} onClose={() => setDetailContract(null)} width={780}>
        {detailContract && (
          <ContractDetail
            contract={detailContract}
            loading={detailLoading}
            onEdit={() => startEdit(detailContract)}
            onDelete={() => handleDelete(detailContract.id)}
            onPreview={() => { setPreviewContract(detailContract); setDetailContract(null) }}
          />
        )}
      </Modal>

      {/* Document preview modal */}
      <Modal open={!!previewContract} onClose={() => setPreviewContract(null)} width={820}>
        {previewContract && <ContractDocPreview contract={previewContract} onClose={() => setPreviewContract(null)} />}
      </Modal>
    </div>
  )
}

/* ============================================================
   ContractForm — form with parties, payment, clauses with sub-items
   ============================================================ */
function ContractForm({ editing, clients, onSave, onCancel }) {
  const [tab, setTab] = useState('general')
  const [form, setForm] = useState({
    title: editing?.title || '',
    client_id: editing?.client_id || '',
    status: editing?.status || 'active',
    start_date: editing?.start_date || '',
    end_date: editing?.end_date || '',
    monthly_videos: editing?.monthly_videos || '',
    monthly_value: editing?.monthly_value || '',
    notes: editing?.notes || '',
    // Party data
    contratante_tipo: editing?.contratante_tipo || 'pf',
    contratante_nome: editing?.contratante_nome || '',
    contratante_cnpj: editing?.contratante_cnpj || '',
    contratante_cpf: editing?.contratante_cpf || '',
    contratante_doc: editing?.contratante_doc || '',
    contratante_endereco: editing?.contratante_endereco || '',
    contratado_tipo: editing?.contratado_tipo || 'pf',
    contratado_nome: editing?.contratado_nome || '',
    contratado_cnpj: editing?.contratado_cnpj || '',
    contratado_cpf: editing?.contratado_cpf || '',
    contratado_doc: editing?.contratado_doc || '',
    contratado_endereco: editing?.contratado_endereco || '',
    // Payment
    payment_value: editing?.payment_value || '',
    payment_date: editing?.payment_date || '',
    payment_details: editing?.payment_details || '',
    // Signature
    city: editing?.city || '',
    contract_date: editing?.contract_date || '',
  })
  const [clauses, setClauses] = useState([])
  const [cnpjLoading, setCnpjLoading] = useState(null) // 'contratante' | 'contratado' | null
  const [cnpjError, setCnpjError] = useState({})
  const [saving, setSaving] = useState(false)
  const [loadingClauses, setLoadingClauses] = useState(!!editing)

  // Parse items_json — supports both old format (array of strings) and new format (array of {text, subtopics})
  function parseClauseItems(itemsJson) {
    if (!itemsJson) return []
    const parsed = typeof itemsJson === 'string' ? JSON.parse(itemsJson) : itemsJson
    if (!Array.isArray(parsed)) return []
    // Migrate old format: if first element is a string, convert to new format
    if (parsed.length > 0 && typeof parsed[0] === 'string') {
      return parsed.map(text => ({ text, subtopics: [] }))
    }
    return parsed.map(t => ({ text: t.text || '', subtopics: t.subtopics || [] }))
  }

  useEffect(() => {
    if (editing) {
      api.contracts.get(editing.id).then(full => {
        const parsed = (full.clauses || []).map(cl => ({
          ...cl,
          topics: parseClauseItems(cl.items_json),
        }))
        setClauses(parsed)
        // Update form with full data
        setForm(f => ({
          ...f,
          contratante_tipo: full.contratante_tipo || f.contratante_tipo,
          contratante_nome: full.contratante_nome || f.contratante_nome,
          contratante_cnpj: full.contratante_cnpj || f.contratante_cnpj,
          contratante_cpf: full.contratante_cpf || f.contratante_cpf,
          contratante_doc: full.contratante_doc || f.contratante_doc,
          contratante_endereco: full.contratante_endereco || f.contratante_endereco,
          contratado_tipo: full.contratado_tipo || f.contratado_tipo,
          contratado_nome: full.contratado_nome || f.contratado_nome,
          contratado_cnpj: full.contratado_cnpj || f.contratado_cnpj,
          contratado_cpf: full.contratado_cpf || f.contratado_cpf,
          contratado_doc: full.contratado_doc || f.contratado_doc,
          contratado_endereco: full.contratado_endereco || f.contratado_endereco,
          payment_value: full.payment_value || f.payment_value,
          payment_date: full.payment_date || f.payment_date,
          payment_details: full.payment_details || f.payment_details,
          city: full.city || f.city,
          contract_date: full.contract_date || f.contract_date,
        }))
        setLoadingClauses(false)
      }).catch(() => setLoadingClauses(false))
    }
  }, [editing])

  function addClause() {
    setClauses(prev => [...prev, { title: '', content: '', topics: [], position: prev.length + 1 }])
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

  // Topics (1.1, 1.2, 1.3...)
  function addTopic(clauseIdx) {
    setClauses(prev => prev.map((c, i) => i === clauseIdx ? { ...c, topics: [...(c.topics || []), { text: '', subtopics: [] }] } : c))
  }
  function updateTopic(clauseIdx, topicIdx, value) {
    setClauses(prev => prev.map((c, i) => {
      if (i !== clauseIdx) return c
      const topics = [...(c.topics || [])]
      topics[topicIdx] = { ...topics[topicIdx], text: value }
      return { ...c, topics }
    }))
  }
  function removeTopic(clauseIdx, topicIdx) {
    setClauses(prev => prev.map((c, i) => {
      if (i !== clauseIdx) return c
      return { ...c, topics: (c.topics || []).filter((_, j) => j !== topicIdx) }
    }))
  }

  // Subtopics (bullets within a topic)
  function addSubtopic(clauseIdx, topicIdx) {
    setClauses(prev => prev.map((c, i) => {
      if (i !== clauseIdx) return c
      const topics = [...(c.topics || [])]
      topics[topicIdx] = { ...topics[topicIdx], subtopics: [...(topics[topicIdx].subtopics || []), ''] }
      return { ...c, topics }
    }))
  }
  function updateSubtopic(clauseIdx, topicIdx, subIdx, value) {
    setClauses(prev => prev.map((c, i) => {
      if (i !== clauseIdx) return c
      const topics = [...(c.topics || [])]
      const subtopics = [...(topics[topicIdx].subtopics || [])]
      subtopics[subIdx] = value
      topics[topicIdx] = { ...topics[topicIdx], subtopics }
      return { ...c, topics }
    }))
  }
  function removeSubtopic(clauseIdx, topicIdx, subIdx) {
    setClauses(prev => prev.map((c, i) => {
      if (i !== clauseIdx) return c
      const topics = [...(c.topics || [])]
      topics[topicIdx] = { ...topics[topicIdx], subtopics: (topics[topicIdx].subtopics || []).filter((_, j) => j !== subIdx) }
      return { ...c, topics }
    }))
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
        payment_value: form.payment_value ? Number(form.payment_value) : 0,
        client_id: form.client_id || null,
        clauses: clauses.map((c, i) => ({
          title: c.title,
          content: c.content || '',
          items: (c.topics || []).map(t => ({ text: t.text || '', subtopics: t.subtopics || [] })),
          position: i + 1,
        })),
      }
      if (editing) {
        await api.contracts.update(editing.id, payload)
      } else {
        await api.contracts.create(payload)
      }
      onSave()
    } catch (err) { alert(err.message) } finally { setSaving(false) }
  }

  const tabStyle = (id) => ({
    padding: '7px 14px', borderRadius: 6, fontSize: 12.5, border: 'none', cursor: 'pointer',
    background: tab === id ? theme.colors.surfaceHover : 'transparent',
    color: tab === id ? theme.colors.text : theme.colors.textMuted,
    fontWeight: tab === id ? 500 : 400,
  })

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: 2, background: theme.colors.bgSecondary, border: `1px solid ${theme.colors.border}`, borderRadius: 8, width: 'fit-content' }}>
        <button type="button" onClick={() => setTab('general')} style={tabStyle('general')}>Geral</button>
        <button type="button" onClick={() => setTab('parties')} style={tabStyle('parties')}>Partes</button>
        <button type="button" onClick={() => setTab('clauses')} style={tabStyle('clauses')}>Clausulas ({clauses.length})</button>
        <button type="button" onClick={() => setTab('payment')} style={tabStyle('payment')}>Pagamento</button>
      </div>

      {/* General tab */}
      {tab === 'general' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Titulo do contrato" required>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                style={inputStyle} placeholder="Contrato de prestacao de servicos profissionais" />
            </Field>
            <Field label="Cliente vinculado">
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
                <option value="expired">Expirado</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </Field>
            <Field label="Inicio da vigencia">
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="Termino">
              <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} style={inputStyle} />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Videos por mes" hint="Limite mensal para o portal do cliente">
              <input type="number" min="0" value={form.monthly_videos} onChange={e => setForm(f => ({ ...f, monthly_videos: e.target.value }))} style={inputStyle} placeholder="Ex: 8" />
            </Field>
            <Field label="Valor mensal (R$)">
              <input type="number" min="0" step="0.01" value={form.monthly_value} onChange={e => setForm(f => ({ ...f, monthly_value: e.target.value }))} style={inputStyle} placeholder="Ex: 5000" />
            </Field>
          </div>
          <Field label="Observacoes internas">
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} placeholder="Notas internas (nao aparecem no documento)..." />
          </Field>
        </div>
      )}

      {/* Parties tab */}
      {tab === 'parties' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <PartySection
            label="Contratante"
            color={theme.colors.primary}
            prefix="contratante"
            form={form}
            setForm={setForm}
            cnpjLoading={cnpjLoading}
            setCnpjLoading={setCnpjLoading}
            cnpjError={cnpjError}
            setCnpjError={setCnpjError}
          />
          <div style={{ borderTop: `1px solid ${theme.colors.border}`, paddingTop: 18 }}>
            <PartySection
              label="Contratado"
              color={theme.colors.mint}
              prefix="contratado"
              form={form}
              setForm={setForm}
              cnpjLoading={cnpjLoading}
              setCnpjLoading={setCnpjLoading}
              cnpjError={cnpjError}
              setCnpjError={setCnpjError}
            />
          </div>
        </div>
      )}

      {/* Clauses tab */}
      {tab === 'clauses' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: theme.colors.textMuted }}>
              Estrutura: Clausula &rarr; Topicos (1.1, 1.2) &rarr; Subtopicos (bullets)
            </span>
            <button type="button" onClick={addClause} style={{ ...btnGhost, padding: '6px 12px', fontSize: 12 }}>
              <Icon name="plus" size={12} /> Adicionar clausula
            </button>
          </div>

          {loadingClauses ? <Spinner size={24} /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 500, overflowY: 'auto', paddingRight: 4 }}>
              {clauses.map((clause, idx) => (
                <div key={idx} style={{
                  padding: 14, background: theme.colors.bg,
                  border: `1px solid ${theme.colors.border}`, borderRadius: 10,
                }}>
                  {/* Clause header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span className="mono" style={{ fontSize: 12, color: theme.colors.primary, fontWeight: 700, minWidth: 50 }}>
                      CL. {idx + 1}&#170;
                    </span>
                    <input
                      value={clause.title}
                      onChange={e => updateClause(idx, 'title', e.target.value)}
                      placeholder="Ex: OBJETO E VIGENCIA"
                      style={{ ...inputStyle, padding: '6px 10px', fontSize: 12.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}
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

                  {/* Clause body text (optional intro text) */}
                  <textarea
                    value={clause.content}
                    onChange={e => updateClause(idx, 'content', e.target.value)}
                    placeholder={`Texto introdutorio da clausula (opcional)...`}
                    rows={2}
                    style={{ ...inputStyle, fontSize: 12.5, resize: 'vertical', minHeight: 40, marginBottom: 10 }}
                  />

                  {/* Topics (numbered: 1.1, 1.2, 1.3...) */}
                  {(clause.topics || []).length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 8, paddingLeft: 12, borderLeft: `2px solid ${theme.colors.border}` }}>
                      {(clause.topics || []).map((topic, topicIdx) => (
                        <div key={topicIdx}>
                          {/* Topic row */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                            <span className="mono" style={{ fontSize: 11.5, color: theme.colors.gold, fontWeight: 700, marginTop: 8, minWidth: 30 }}>
                              {idx + 1}.{topicIdx + 1}
                            </span>
                            <textarea
                              value={topic.text}
                              onChange={e => updateTopic(idx, topicIdx, e.target.value)}
                              placeholder={`Topico ${idx + 1}.${topicIdx + 1} - texto...`}
                              rows={1}
                              style={{ ...inputStyle, flex: 1, fontSize: 12, padding: '6px 10px', resize: 'vertical', minHeight: 32 }}
                            />
                            <button type="button" onClick={() => removeTopic(idx, topicIdx)}
                              style={{ padding: 3, border: 'none', background: 'transparent', color: theme.colors.danger, cursor: 'pointer', marginTop: 5 }}>
                              <Icon name="x" size={11} />
                            </button>
                          </div>

                          {/* Subtopics (bullets within this topic) */}
                          {(topic.subtopics || []).length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, paddingLeft: 36 }}>
                              {topic.subtopics.map((sub, subIdx) => (
                                <div key={subIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                  <span style={{ fontSize: 13, color: theme.colors.textMuted, marginTop: 6, minWidth: 10 }}>*</span>
                                  <textarea
                                    value={sub}
                                    onChange={e => updateSubtopic(idx, topicIdx, subIdx, e.target.value)}
                                    placeholder="Subtopico (item da lista)..."
                                    rows={1}
                                    style={{ ...inputStyle, flex: 1, fontSize: 11.5, padding: '5px 9px', resize: 'vertical', minHeight: 28 }}
                                  />
                                  <button type="button" onClick={() => removeSubtopic(idx, topicIdx, subIdx)}
                                    style={{ padding: 2, border: 'none', background: 'transparent', color: theme.colors.danger, cursor: 'pointer', marginTop: 4 }}>
                                    <Icon name="x" size={9} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add subtopic button */}
                          <button type="button" onClick={() => addSubtopic(idx, topicIdx)}
                            style={{ fontSize: 10.5, color: theme.colors.textMuted, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 4px', marginLeft: 36, marginTop: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <Icon name="plus" size={9} /> subtopico
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add topic button */}
                  <button type="button" onClick={() => addTopic(idx)}
                    style={{ fontSize: 11, color: theme.colors.primary, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <Icon name="plus" size={10} /> Adicionar topico ({idx + 1}.{(clause.topics || []).length + 1})
                  </button>
                </div>
              ))}
              {clauses.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: theme.colors.textFaint, fontSize: 12.5, border: `1px dashed ${theme.colors.border}`, borderRadius: 8 }}>
                  Nenhuma clausula adicionada. Use o modelo abaixo ou crie do zero.
                </div>
              )}
            </div>
          )}

          {/* Quick template */}
          {clauses.length === 0 && (
            <button type="button" onClick={() => {
              setClauses([
                { title: 'OBJETO E VIGENCIA', content: '', topics: [
                  { text: 'O presente contrato tem por objeto a parceria entre o CONTRATANTE e o CONTRATADO para a prestacao de servico de edicao de video.', subtopics: [] },
                  { text: 'O pacote mensal contempla:', subtopics: [
                    'Ate 16 (dezesseis) videos mensais, sendo aproximadamente 4 (quatro) videos por semana;',
                    'Producao minima de 3 (tres) reels, shorts ou cortes virais derivados de cada video principal;',
                    'Adaptacao dos cortes para outras plataformas digitais quando necessario.',
                  ]},
                  { text: 'Ao final do periodo de vigencia, este contrato podera ser renovado em ate 60 (sessenta dias).', subtopics: [] },
                ], position: 1 },
                { title: 'RESPONSABILIDADES DO CONTRATANTE', content: 'O CONTRATANTE se responsabiliza por:', topics: [
                  { text: 'Fornecer todas as informacoes necessarias a realizacao dos servicos;', subtopics: [] },
                  { text: 'Efetuar o pagamento, nas datas e nos termos definidos neste contrato;', subtopics: [] },
                  { text: 'Comunicar imediatamente o CONTRATADO sobre eventuais reclamacoes;', subtopics: [] },
                ], position: 2 },
                { title: 'RESPONSABILIDADES DO CONTRATADO', content: 'O CONTRATADO se compromete a:', topics: [
                  { text: 'Prestar, com a devida dedicacao, os servicos descritos neste contrato;', subtopics: [] },
                  { text: 'Manter sigilosas as informacoes privilegiadas de qualquer natureza;', subtopics: [] },
                  { text: 'Providenciar os meios e equipamentos necessarios a correta execucao do servico;', subtopics: [] },
                  { text: 'Manter sigilo absoluto sobre quaisquer informacoes, materiais, videos, estrategias e dados sensiveis;', subtopics: [] },
                ], position: 3 },
                { title: 'REMUNERACAO', content: '', topics: [
                  { text: 'Pela prestacao dos servicos descritos neste contrato, a CONTRATANTE pagara ao CONTRATADO o valor acordado mensalmente.', subtopics: [] },
                  { text: 'Demandas adicionais nao previstas neste contrato poderao ser cobradas separadamente mediante aprovacao previa da CONTRATANTE.', subtopics: [] },
                  { text: 'Em caso de atraso no pagamento devera incidir multa de 10% sobre o valor devido.', subtopics: [] },
                ], position: 4 },
                { title: 'RESCISAO', content: '', topics: [
                  { text: 'A qualquer momento, poderao as partes rescindir este contrato, com antecedencia minima de 07 (sete) dias.', subtopics: [] },
                  { text: 'Em caso de rescisao, o pagamento devera ser feito proporcionalmente aos dias trabalhados.', subtopics: [] },
                ], position: 5 },
                { title: 'CONDICOES GERAIS', content: '', topics: [
                  { text: 'Este contrato podera ser alterado mediante acordo mutuo entre as partes, formalizado por escrito.', subtopics: [] },
                  { text: 'Este contrato tem natureza estritamente civil e nao gera vinculo empregaticio entre as partes.', subtopics: [] },
                ], position: 6 },
                { title: 'FORO', content: '', topics: [
                  { text: 'Fica eleito o foro central da Comarca para dirimir quaisquer duvidas ou litigios oriundos deste contrato.', subtopics: [] },
                ], position: 7 },
              ])
            }} style={{ ...btnSoft, alignSelf: 'center', fontSize: 12 }}>
              <Icon name="briefcase" size={13} /> Usar modelo padrao (baseado em contrato real)
            </button>
          )}
        </div>
      )}

      {/* Payment tab */}
      {tab === 'payment' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Valor do contrato (R$)">
              <input type="number" min="0" step="0.01" value={form.payment_value} onChange={e => setForm(f => ({ ...f, payment_value: e.target.value }))}
                style={inputStyle} placeholder="Ex: 1500.00" />
            </Field>
            <Field label="Data de pagamento">
              <input value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))}
                style={inputStyle} placeholder="Ex: dia 20 de cada mes" />
            </Field>
          </div>
          <Field label="Dados bancarios / forma de pagamento">
            <textarea value={form.payment_details} onChange={e => setForm(f => ({ ...f, payment_details: e.target.value }))}
              style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
              placeholder="Banco, agencia, conta, PIX..." />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, borderTop: `1px solid ${theme.colors.border}`, paddingTop: 14 }}>
            <Field label="Cidade (assinatura)">
              <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                style={inputStyle} placeholder="Ex: Sao Paulo" />
            </Field>
            <Field label="Data do contrato">
              <input value={form.contract_date} onChange={e => setForm(f => ({ ...f, contract_date: e.target.value }))}
                style={inputStyle} placeholder="Ex: 31 de marco de 2025" />
            </Field>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 12, borderTop: `1px solid ${theme.colors.border}` }}>
        <button type="button" onClick={onCancel} style={btnGhost}>Cancelar</button>
        <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Salvando...' : editing ? 'Salvar alteracoes' : 'Criar contrato'}
        </button>
      </div>
    </form>
  )
}

/* ============================================================
   PartySection — flexible party type (PJ / MEI / PF) with CNPJ lookup + CPF validation
   ============================================================ */
function PartySection({ label, color, prefix, form, setForm, cnpjLoading, setCnpjLoading, cnpjError, setCnpjError }) {
  const tipo = form[`${prefix}_tipo`]
  const showCnpj = tipo === 'pj' || tipo === 'mei'

  async function lookupCNPJ() {
    const cnpj = form[`${prefix}_cnpj`]?.replace(/\D/g, '')
    if (!cnpj || cnpj.length !== 14) {
      setCnpjError(prev => ({ ...prev, [prefix]: 'CNPJ deve ter 14 digitos' }))
      return
    }
    setCnpjLoading(prefix)
    setCnpjError(prev => ({ ...prev, [prefix]: null }))
    try {
      const data = await api.lookup.cnpj(cnpj)
      setForm(f => ({
        ...f,
        [`${prefix}_nome`]: data.razao_social || f[`${prefix}_nome`],
        [`${prefix}_endereco`]: data.endereco_completo || f[`${prefix}_endereco`],
      }))
    } catch (err) {
      setCnpjError(prev => ({ ...prev, [prefix]: err.message || 'CNPJ nao encontrado' }))
    } finally {
      setCnpjLoading(null)
    }
  }

  function handleCPFChange(value) {
    const masked = maskCPF(value)
    setForm(f => ({ ...f, [`${prefix}_cpf`]: masked }))
    // Validate when complete
    const raw = value.replace(/\D/g, '')
    if (raw.length === 11) {
      if (!validateCPF(raw)) {
        setCnpjError(prev => ({ ...prev, [`${prefix}_cpf`]: 'CPF invalido' }))
      } else {
        setCnpjError(prev => ({ ...prev, [`${prefix}_cpf`]: null }))
      }
    } else {
      setCnpjError(prev => ({ ...prev, [`${prefix}_cpf`]: null }))
    }
  }

  function handleCNPJChange(value) {
    setForm(f => ({ ...f, [`${prefix}_cnpj`]: maskCNPJ(value) }))
    setCnpjError(prev => ({ ...prev, [prefix]: null }))
  }

  const isLoadingThis = cnpjLoading === prefix

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 10, color }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Type selector */}
        <Field label="Tipo">
          <div style={{ display: 'flex', gap: 6 }}>
            {PARTY_TYPES.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setForm(f => ({ ...f, [`${prefix}_tipo`]: t.value }))}
                style={{
                  padding: '7px 14px', borderRadius: 6, fontSize: 12, border: `1px solid ${theme.colors.border}`,
                  cursor: 'pointer', transition: 'all .15s',
                  background: tipo === t.value ? `${color}18` : theme.colors.bg,
                  color: tipo === t.value ? color : theme.colors.textMuted,
                  fontWeight: tipo === t.value ? 600 : 400,
                  borderColor: tipo === t.value ? color : theme.colors.border,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Field>

        {/* CNPJ (shown for PJ/MEI) */}
        {showCnpj && (
          <Field label="CNPJ" hint={tipo === 'mei' ? 'CNPJ do MEI' : 'CNPJ da empresa'}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={form[`${prefix}_cnpj`] || ''}
                onChange={e => handleCNPJChange(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
                placeholder="00.000.000/0001-00"
                maxLength={18}
              />
              <button
                type="button"
                onClick={lookupCNPJ}
                disabled={isLoadingThis}
                style={{
                  ...btnSoft, padding: '8px 14px', fontSize: 11.5, whiteSpace: 'nowrap',
                  opacity: isLoadingThis ? 0.6 : 1,
                }}
              >
                {isLoadingThis ? 'Consultando...' : 'Consultar'}
              </button>
            </div>
            {cnpjError[prefix] && (
              <div style={{ fontSize: 11, color: theme.colors.danger, marginTop: 4 }}>{cnpjError[prefix]}</div>
            )}
          </Field>
        )}

        {/* CPF (always shown) */}
        <Field label="CPF" hint={showCnpj ? 'CPF do representante legal' : 'CPF'}>
          <input
            value={form[`${prefix}_cpf`] || ''}
            onChange={e => handleCPFChange(e.target.value)}
            style={{
              ...inputStyle,
              borderColor: cnpjError[`${prefix}_cpf`] ? theme.colors.danger : undefined,
            }}
            placeholder="000.000.000-00"
            maxLength={14}
          />
          {cnpjError[`${prefix}_cpf`] && (
            <div style={{ fontSize: 11, color: theme.colors.danger, marginTop: 4 }}>{cnpjError[`${prefix}_cpf`]}</div>
          )}
          {form[`${prefix}_cpf`]?.replace(/\D/g, '').length === 11 && !cnpjError[`${prefix}_cpf`] && (
            <div style={{ fontSize: 11, color: theme.colors.mint, marginTop: 4 }}>CPF valido</div>
          )}
        </Field>

        {/* Nome / Razao Social */}
        <Field label={showCnpj ? 'Razao Social' : 'Nome completo'}>
          <input
            value={form[`${prefix}_nome`] || ''}
            onChange={e => setForm(f => ({ ...f, [`${prefix}_nome`]: e.target.value }))}
            style={inputStyle}
            placeholder={showCnpj ? 'Preenchido automaticamente pela consulta CNPJ' : 'Nome completo'}
          />
        </Field>

        {/* Endereco */}
        <Field label="Endereco completo">
          <input
            value={form[`${prefix}_endereco`] || ''}
            onChange={e => setForm(f => ({ ...f, [`${prefix}_endereco`]: e.target.value }))}
            style={inputStyle}
            placeholder={showCnpj ? 'Preenchido automaticamente pela consulta CNPJ' : 'Rua..., n..., Bairro, Cidade - UF, CEP: 00000-000'}
          />
        </Field>
      </div>
    </div>
  )
}

/* ============================================================
   ContractDetail — summary view with actions
   ============================================================ */
function ContractDetail({ contract, loading, onEdit, onDelete, onPreview }) {
  if (loading) return <Spinner />

  const clauses = contract.clauses || []
  const st = STATUS_MAP[contract.status] || STATUS_MAP.draft

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Title & status */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>contrato</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 className="display" style={{ fontSize: 24, color: theme.colors.text, margin: 0, flex: 1 }}>
            {contract.title}
          </h2>
          <span style={{
            padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            fontFamily: theme.fonts.mono, textTransform: 'uppercase',
            background: st.bg, color: st.color,
          }}>
            {st.label}
          </span>
        </div>
      </div>

      {/* Info grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Cliente</div>
          <div style={{ fontSize: 13, color: theme.colors.text }}>{contract.client_name || '---'}</div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Vigencia</div>
          <div style={{ fontSize: 12.5, color: theme.colors.text }}>
            {contract.start_date ? new Date(contract.start_date).toLocaleDateString('pt-BR') : '---'}
            {' - '}
            {contract.end_date ? new Date(contract.end_date).toLocaleDateString('pt-BR') : '...'}
          </div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Valor</div>
          <div className="mono tnum" style={{ fontSize: 15, fontWeight: 600, color: theme.colors.mint }}>
            {fmtBRL(contract.payment_value || contract.monthly_value || 0)}
          </div>
        </div>
      </div>

      {/* Parties */}
      {(contract.contratante_nome || contract.contratado_nome) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {contract.contratante_nome && (
            <div style={{ padding: 12, background: theme.colors.bg, border: `1px solid ${theme.colors.border}`, borderRadius: 8 }}>
              <div className="eyebrow" style={{ marginBottom: 6, color: theme.colors.primary }}>Contratante</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: theme.colors.text, marginBottom: 2 }}>{contract.contratante_nome}</div>
              <div style={{ fontSize: 11, color: theme.colors.textMuted, marginBottom: 2 }}>
                {contract.contratante_tipo === 'pj' ? 'Pessoa Juridica' : contract.contratante_tipo === 'mei' ? 'MEI' : 'Pessoa Fisica'}
              </div>
              {contract.contratante_cnpj && <div style={{ fontSize: 11.5, color: theme.colors.textMuted }}>CNPJ: {contract.contratante_cnpj}</div>}
              {contract.contratante_cpf && <div style={{ fontSize: 11.5, color: theme.colors.textMuted }}>CPF: {contract.contratante_cpf}</div>}
            </div>
          )}
          {contract.contratado_nome && (
            <div style={{ padding: 12, background: theme.colors.bg, border: `1px solid ${theme.colors.border}`, borderRadius: 8 }}>
              <div className="eyebrow" style={{ marginBottom: 6, color: theme.colors.mint }}>Contratado</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: theme.colors.text, marginBottom: 2 }}>{contract.contratado_nome}</div>
              <div style={{ fontSize: 11, color: theme.colors.textMuted, marginBottom: 2 }}>
                {contract.contratado_tipo === 'pj' ? 'Pessoa Juridica' : contract.contratado_tipo === 'mei' ? 'MEI' : 'Pessoa Fisica'}
              </div>
              {contract.contratado_cnpj && <div style={{ fontSize: 11.5, color: theme.colors.textMuted }}>CNPJ: {contract.contratado_cnpj}</div>}
              {contract.contratado_cpf && <div style={{ fontSize: 11.5, color: theme.colors.textMuted }}>CPF: {contract.contratado_cpf}</div>}
            </div>
          )}
        </div>
      )}

      {/* Clauses summary */}
      {clauses.length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Clausulas ({clauses.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
            {clauses.map((clause, idx) => (
              <div key={clause.id || idx} style={{
                padding: '12px 14px', background: theme.colors.bg,
                border: `1px solid ${theme.colors.border}`, borderRadius: 8,
              }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: theme.colors.text, marginBottom: clause.content || (clause.topics && clause.topics.length > 0) ? 6 : 0 }}>
                  <span className="mono" style={{ color: theme.colors.primary, marginRight: 6 }}>{idx + 1}&#170;</span>
                  {clause.title}
                </div>
                {clause.content && (
                  <div style={{ fontSize: 12, color: theme.colors.textSecondary, lineHeight: 1.5, marginBottom: clause.topics?.length > 0 ? 6 : 0 }}>
                    {clause.content}
                  </div>
                )}
                {clause.topics && clause.topics.length > 0 && (
                  <div style={{ paddingLeft: 12 }}>
                    {clause.topics.map((topic, i) => (
                      <div key={i} style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 11.5, color: theme.colors.textSecondary, lineHeight: 1.5 }}>
                          <span className="mono" style={{ color: theme.colors.gold, marginRight: 6, fontWeight: 600 }}>{idx + 1}.{i + 1}</span>
                          {topic.text}
                        </div>
                        {topic.subtopics && topic.subtopics.length > 0 && (
                          <div style={{ paddingLeft: 28, marginTop: 2 }}>
                            {topic.subtopics.map((sub, si) => (
                              <div key={si} style={{ fontSize: 11, color: theme.colors.textMuted, lineHeight: 1.5 }}>
                                <span style={{ marginRight: 4 }}>*</span>{sub}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, paddingTop: 10, borderTop: `1px solid ${theme.colors.border}`, flexWrap: 'wrap' }}>
        <button onClick={onPreview} style={btnPrimary}>
          <Icon name="eye" size={13} /> Visualizar documento
        </button>
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

/* ============================================================
   ContractDocPreview — formatted document preview (print-style)
   ============================================================ */
function ContractDocPreview({ contract, onClose }) {
  const clauses = contract.clauses || []

  function formatPartyDoc(prefix) {
    const tipo = contract[`${prefix}_tipo`] || 'pf'
    const cnpj = contract[`${prefix}_cnpj`]
    const cpf = contract[`${prefix}_cpf`]
    const parts = []
    if (tipo === 'pj' || tipo === 'mei') {
      if (cnpj) parts.push(`inscrita no CNPJ sob o n. ${cnpj}`)
    }
    if (cpf) parts.push(`CPF n. ${cpf}`)
    return parts.join(', ')
  }

  function formatPartyIntro(prefix) {
    const tipo = contract[`${prefix}_tipo`] || 'pf'
    const endereco = contract[`${prefix}_endereco`]
    if (tipo === 'pj') {
      return endereco ? `, com sede na ${endereco}` : ''
    } else if (tipo === 'mei') {
      return endereco ? `, com endereco comercial na ${endereco}` : ''
    } else {
      return endereco ? `, residente e domiciliado(a) na ${endereco}` : ''
    }
  }

  function getPartyTypeLabel(prefix) {
    const tipo = contract[`${prefix}_tipo`] || 'pf'
    if (tipo === 'pj') return 'pessoa juridica de direito privado'
    if (tipo === 'mei') return 'microempreendedor individual'
    return 'pessoa fisica'
  }

  const docStyle = {
    background: '#fff', color: '#111', padding: '48px 56px',
    fontFamily: "'Inter', 'Times New Roman', serif",
    fontSize: 13.5, lineHeight: 1.7, borderRadius: 8,
    maxHeight: '70vh', overflowY: 'auto',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={docStyle}>
        {/* Title */}
        <h1 style={{ textAlign: 'center', fontSize: 16, fontWeight: 700, marginBottom: 28, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {contract.title || 'CONTRATO DE PRESTACAO DE SERVICOS PROFISSIONAIS'}
        </h1>

        {/* Parties */}
        {contract.contratante_nome && (
          <p style={{ marginBottom: 14, textAlign: 'justify' }}>
            <strong>CONTRATANTE: {contract.contratante_nome}</strong>
            {`, ${getPartyTypeLabel('contratante')}`}
            {formatPartyDoc('contratante') && `, ${formatPartyDoc('contratante')}`}
            {formatPartyIntro('contratante')}
            , doravante denominado(a) simplesmente "CONTRATANTE".
          </p>
        )}
        {contract.contratado_nome && (
          <p style={{ marginBottom: 14, textAlign: 'justify' }}>
            <strong>CONTRATADO: {contract.contratado_nome}</strong>
            {`, ${getPartyTypeLabel('contratado')}`}
            {formatPartyDoc('contratado') && `, ${formatPartyDoc('contratado')}`}
            {formatPartyIntro('contratado')}
            , doravante denominado(a) simplesmente "CONTRATADO".
          </p>
        )}

        {(contract.contratante_nome || contract.contratado_nome) && (
          <p style={{ marginBottom: 24, textAlign: 'justify' }}>
            As partes acima identificadas tem, entre si, justo e contratado o que segue:
          </p>
        )}

        {/* Clauses */}
        {clauses.map((clause, idx) => (
          <div key={idx} style={{ marginBottom: 22 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase' }}>
              CLAUSULA {idx + 1}&#170; &ndash; {clause.title}
            </h2>
            {clause.content && (
              <p style={{ marginBottom: 8, textAlign: 'justify' }}>
                {clause.content}
              </p>
            )}
            {clause.topics && clause.topics.length > 0 && (
              <div>
                {clause.topics.map((topic, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <p style={{ marginBottom: topic.subtopics?.length > 0 ? 4 : 0, textAlign: 'justify' }}>
                      <strong>{idx + 1}.{i + 1}</strong> &ndash; {topic.text}
                    </p>
                    {topic.subtopics && topic.subtopics.length > 0 && (
                      <div style={{ paddingLeft: 24 }}>
                        {topic.subtopics.map((sub, si) => (
                          <p key={si} style={{ marginBottom: 3, textAlign: 'justify' }}>
                            * {sub}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Signature block */}
        {(contract.city || contract.contract_date) && (
          <p style={{ textAlign: 'center', marginTop: 36, marginBottom: 48 }}>
            {contract.city || '_______________'}, {contract.contract_date || '__ de __________ de ____'}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 50, gap: 40 }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #333', paddingTop: 8, marginTop: 40 }}>
              <strong>CONTRATANTE</strong>
              {contract.contratante_nome && (
                <div style={{ fontSize: 12, marginTop: 4 }}>{contract.contratante_nome}</div>
              )}
              {contract.contratante_cpf && (
                <div style={{ fontSize: 11, marginTop: 2, color: '#555' }}>CPF: {contract.contratante_cpf}</div>
              )}
            </div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #333', paddingTop: 8, marginTop: 40 }}>
              <strong>CONTRATADO</strong>
              {contract.contratado_nome && (
                <div style={{ fontSize: 12, marginTop: 4 }}>{contract.contratado_nome}</div>
              )}
              {contract.contratado_cpf && (
                <div style={{ fontSize: 11, marginTop: 2, color: '#555' }}>CPF: {contract.contratado_cpf}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Actions below preview */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={() => window.print()} style={btnSoft}>
          <Icon name="link" size={13} /> Imprimir / PDF
        </button>
        <button onClick={onClose} style={btnGhost}>Fechar</button>
      </div>
    </div>
  )
}
