// src/pages/Clients.jsx — lista de clientes com cards + busca + criar
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import theme from '../styles/theme'
import Modal from '../components/Modal'
import {
  Icon, Avatar, Spinner, Field,
  inputStyle, btnPrimary, btnSoft, panelStyle, fmtBRL,
} from '../components/ui'
import useIsMobile from '../hooks/useIsMobile'

export default function Clients() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [view, setView] = useState('grid')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ name: '', contact_name: '', email: '', phone: '', notes: '' })

  useEffect(() => { loadClients() }, [])

  async function loadClients() {
    try {
      const data = await api.clients.list()
      setClients(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    try {
      await api.clients.create(form)
      setShowModal(false)
      setForm({ name: '', contact_name: '', email: '', phone: '', notes: '' })
      loadClients()
    } catch (err) {
      alert(err.message)
    }
  }

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header / toolbar */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', gap: isMobile ? 10 : 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flex: 1,
            padding: '4px 12px 4px 4px',
            background: theme.colors.bgSecondary,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: 8,
          }}>
            <Icon name="search" size={14} color={theme.colors.textFaint} style={{ marginLeft: 8 }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cliente…"
              style={{
                background: 'transparent', border: 'none', outline: 'none',
                padding: '8px 0', fontSize: 13, color: theme.colors.text, width: isMobile ? '100%' : 220,
                minWidth: 0,
              }}
            />
          </div>
          {!isMobile && (
            <span style={{ fontSize: 12, color: theme.colors.textMuted }}>
              {clients.length} cliente{clients.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!isMobile && (
            <div style={{
              display: 'flex', padding: 2,
              background: theme.colors.bgSecondary,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: 8,
            }}>
              {[{ v: 'grid', l: 'Cards' }, { v: 'list', l: 'Tabela' }].map(opt => (
                <button key={opt.v} onClick={() => setView(opt.v)}
                  style={{
                    padding: '5px 12px', fontSize: 12, borderRadius: 6,
                    color: view === opt.v ? theme.colors.text : theme.colors.textMuted,
                    background: view === opt.v ? theme.colors.surfaceHover : 'transparent',
                  }}>
                  {opt.l}
                </button>
              ))}
            </div>
          )}
          <button style={{ ...btnPrimary, ...(isMobile ? { flex: 1, justifyContent: 'center' } : {}) }} onClick={() => setShowModal(true)}>
            <Icon name="plus" size={14} />
            Novo cliente
          </button>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <div style={{
          ...panelStyle,
          textAlign: 'center', padding: 60,
        }}>
          <h3 className="display" style={{ fontSize: 22, color: theme.colors.text, marginBottom: 8 }}>
            {search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
          </h3>
          <p style={{ fontSize: 13, color: theme.colors.textMuted, marginBottom: 24 }}>
            {search ? 'Tente buscar por outro termo' : 'Comece cadastrando seu primeiro cliente'}
          </p>
          {!search && (
            <button style={btnPrimary} onClick={() => setShowModal(true)}>
              <Icon name="plus" size={14} />
              Cadastrar cliente
            </button>
          )}
        </div>
      ) : (isMobile || view === 'grid') ? (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(312px, 1fr))', gap: isMobile ? 8 : 14 }}>
          {filtered.map(client => (
            <ClientCard key={client.id} client={client} onClick={() => navigate(`/dashboard/clients/${client.id}`)} />
          ))}
        </div>
      ) : (
        <div style={{ ...panelStyle, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: theme.colors.bgSecondary }}>
                {['Cliente', 'Contato', 'Pedidos', 'Em curso', 'Concluídos'].map(h => (
                  <th key={h} className="eyebrow" style={{
                    padding: '12px 16px', textAlign: 'left',
                    borderBottom: `1px solid ${theme.colors.border}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} onClick={() => navigate(`/dashboard/clients/${c.id}`)}
                  className="row-hover"
                  style={{ cursor: 'pointer', borderBottom: `1px solid ${theme.colors.borderSoft}` }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Avatar name={c.name} size={26} src={c.logo || undefined} />
                      <span style={{ fontSize: 13.5, color: theme.colors.text }}>{c.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: theme.colors.textMuted }}>
                    {c.contact_name || '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }} className="mono tnum">{c.order_count || 0}</td>
                  <td style={{ padding: '12px 16px' }} className="mono tnum">
                    <span style={{ color: (c.in_progress_count || 0) > 0 ? theme.colors.primary : theme.colors.textMuted }}>
                      {c.in_progress_count || 0}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }} className="mono tnum">
                    <span style={{ color: theme.colors.mint }}>{c.completed_count || 0}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New client modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Novo cliente" subtitle="cadastro" width={520}>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Nome do cliente" required>
            <input
              value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              required placeholder="Ex: Estúdio Lume" style={inputStyle}
            />
          </Field>
          <Field label="Nome do contato">
            <input
              value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })}
              placeholder="Ex: Helena Vasques" style={inputStyle}
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <Field label="Email">
              <input
                type="email" value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="contato@cliente.com" style={inputStyle}
              />
            </Field>
            <Field label="Telefone">
              <input
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="(11) 99999-9999" style={inputStyle}
              />
            </Field>
          </div>
          <Field label="Observações">
            <textarea
              value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="Notas internas, preferências…" rows={3}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 80, fontFamily: theme.fonts.ui }}
            />
          </Field>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" style={btnSoft} onClick={() => setShowModal(false)}>Cancelar</button>
            <button type="submit" style={btnPrimary}>Criar cliente</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function ClientCard({ client, onClick }) {
  return (
    <div onClick={onClick}
      style={{
        ...panelStyle,
        padding: 20,
        cursor: 'pointer',
        transition: 'border-color 0.18s, background 0.18s, transform 0.18s',
        position: 'relative', overflow: 'hidden',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = theme.colors.borderLight
        e.currentTarget.style.background = theme.colors.panelElev
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = theme.colors.border
        e.currentTarget.style.background = theme.colors.panel
      }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${theme.colors.primary}, ${theme.colors.primary} 30%, transparent)`,
      }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <Avatar name={client.name} size={42} src={client.logo || undefined} />
        <button onClick={e => e.stopPropagation()} style={{ color: theme.colors.textFaint, padding: 4 }}>
          <Icon name="more" size={16} />
        </button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15.5, fontWeight: 500, color: theme.colors.text, letterSpacing: '-0.005em' }}>
          {client.name}
        </div>
        {client.contact_name && (
          <div style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 2 }}>{client.contact_name}</div>
        )}
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
        borderTop: `1px solid ${theme.colors.borderSoft}`, paddingTop: 14,
      }}>
        <div>
          <div className="eyebrow" style={{ fontSize: 9 }}>Pedidos</div>
          <div className="display tnum" style={{ fontSize: 20, marginTop: 2, color: theme.colors.text }}>
            {client.order_count || 0}
          </div>
        </div>
        <div>
          <div className="eyebrow" style={{ fontSize: 9 }}>Em curso</div>
          <div className="display tnum" style={{
            fontSize: 20, marginTop: 2,
            color: (client.in_progress_count || 0) > 0 ? theme.colors.primary : theme.colors.textMuted,
          }}>
            {client.in_progress_count || 0}
          </div>
        </div>
        <div>
          <div className="eyebrow" style={{ fontSize: 9 }}>Concluídos</div>
          <div className="display tnum" style={{
            fontSize: 20, marginTop: 2,
            color: (client.completed_count || 0) > 0 ? theme.colors.mint : theme.colors.textMuted,
          }}>
            {client.completed_count || 0}
          </div>
        </div>
      </div>
    </div>
  )
}
