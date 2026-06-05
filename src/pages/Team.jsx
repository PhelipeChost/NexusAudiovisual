// src/pages/Team.jsx — gestão da equipe
import { useState, useEffect } from 'react'
import api from '../api'
import theme from '../styles/theme'
import Modal from '../components/Modal'
import {
  Icon, Avatar, Spinner, Field,
  inputStyle, btnPrimary, btnSoft, btnGhost, btnDanger,
  panelStyle,
} from '../components/ui'

export default function Team() {
  const [members, setMembers] = useState([])
  const [removed, setRemoved] = useState([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [showRemoved, setShowRemoved] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [inviteResult, setInviteResult] = useState(null)
  const [pendingInvites, setPendingInvites] = useState([])

  useEffect(() => { loadTeam(); loadInvites(); loadRemoved() }, [])

  async function loadTeam() {
    try {
      const data = await api.team.list()
      setMembers(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function loadRemoved() {
    try {
      const data = await api.team.listRemoved()
      setRemoved(data || [])
    } catch (err) { console.error(err) }
  }

  async function handleRestore(id) {
    try {
      await api.team.restore(id)
      loadTeam(); loadRemoved()
    } catch (err) { alert(err.message) }
  }

  async function loadInvites() {
    try {
      const data = await api.team.getInvites()
      setPendingInvites(data.filter(i => i.status === 'pending'))
    } catch (err) {
      console.error(err)
    }
  }

  async function handleInvite(e) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setSubmitting(true)
    setInviteResult(null)
    try {
      const result = await api.team.invite(inviteEmail.trim())
      setInviteResult(result)
      setInviteEmail('')
      loadInvites()
      loadTeam()
    } catch (err) {
      setInviteResult({ error: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 className="display" style={{ fontSize: 30, lineHeight: 1.1, color: theme.colors.text, margin: 0 }}>
            Sua equipe
          </h2>
          <p style={{ fontSize: 13, color: theme.colors.textMuted, marginTop: 6 }}>
            {members.length} membro{members.length !== 1 ? 's' : ''} ativo{members.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => { setShowInvite(true); setInviteEmail(''); setInviteResult(null) }} style={btnPrimary}>
          <Icon name="plus" size={14} />
          Convidar editor
        </button>
      </div>

      {/* Pending invites banner */}
      {pendingInvites.length > 0 && (
        <div style={{
          ...panelStyle,
          padding: '14px 20px',
          borderColor: theme.colors.primaryLine,
          background: theme.colors.primaryMuted,
        }}>
          <div className="eyebrow" style={{ marginBottom: 8, color: theme.colors.primary }}>Convites pendentes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pendingInvites.map(inv => (
              <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: theme.colors.text }}>
                  {inv.editor_name || inv.editor_email}
                  {!inv.editor_id && (
                    <span style={{ fontSize: 11, color: theme.colors.textMuted, marginLeft: 8 }}>(ainda não criou conta)</span>
                  )}
                </span>
                <span style={{ fontSize: 11, color: theme.colors.textMuted }}>
                  {new Date(inv.created_at).toLocaleDateString('pt-BR')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? <Spinner /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 14 }}>
          {members.map(m => <EditorCard key={m.id} member={m} onRefresh={() => { loadTeam(); loadRemoved() }} />)}

          <button onClick={() => { setShowInvite(true); setInviteEmail(''); setInviteResult(null) }} style={{
            padding: 20,
            border: `1px dashed ${theme.colors.borderLight}`,
            borderRadius: 14, background: 'transparent',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 10,
            minHeight: 180,
            color: theme.colors.textMuted,
            cursor: 'pointer', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = theme.colors.primaryLine; e.currentTarget.style.color = theme.colors.primary }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = theme.colors.borderLight; e.currentTarget.style.color = theme.colors.textMuted }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              border: '1px dashed currentColor',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="plus" size={18} />
            </div>
            <div style={{ fontSize: 13.5 }}>Convidar editor</div>
            <div style={{ fontSize: 11, color: theme.colors.textFaint, textAlign: 'center', maxWidth: 220 }}>
              Convide por email um editor que já tem conta no Nexus
            </div>
          </button>
        </div>
      )}

      {/* Editores removidos — histórico preservado */}
      {removed.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button onClick={() => setShowRemoved(s => !s)} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 8,
            background: theme.colors.bgSecondary,
            border: `1px solid ${theme.colors.border}`,
            color: theme.colors.textMuted, fontSize: 13,
            cursor: 'pointer',
          }}>
            <Icon name={showRemoved ? 'chevronDown' : 'chevronRight'} size={12} />
            <span>Editores removidos ({removed.length})</span>
            <span style={{ fontSize: 11, color: theme.colors.textFaint, marginLeft: 'auto' }}>
              historico preservado
            </span>
          </button>

          {showRemoved && (
            <div style={{
              marginTop: 10,
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10,
            }}>
              {removed.map(r => (
                <div key={r.id} style={{
                  ...panelStyle, padding: 14, opacity: 0.85,
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <Avatar name={r.name} src={r.avatar || undefined} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, color: theme.colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.name}
                    </div>
                    <div style={{ fontSize: 11, color: theme.colors.textMuted, fontFamily: theme.fonts.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.email || '—'}
                    </div>
                    {r.removed_at && (
                      <div className="eyebrow" style={{ marginTop: 2, fontSize: 9 }}>
                        removido {new Date(r.removed_at).toLocaleDateString('pt-BR')}
                      </div>
                    )}
                  </div>
                  <button onClick={() => handleRestore(r.id)} title="Restaurar"
                    style={{
                      padding: '6px 10px', fontSize: 11, fontWeight: 600,
                      background: theme.colors.primaryMuted, color: theme.colors.primary,
                      borderRadius: 6, cursor: 'pointer',
                    }}>
                    Restaurar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Modal open={showInvite} onClose={() => setShowInvite(false)} title="Convidar editor" subtitle="convite por email" width={480}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 13, color: theme.colors.textMuted, margin: 0, lineHeight: 1.5 }}>
            Digite o email de um editor. Se ele já tem conta no Nexus, receberá um convite nas notificações.
            Se ainda não tem conta, o convite ficará pendente até ele se registrar.
          </p>

          <form onSubmit={handleInvite} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <Field label="Email do editor" required>
                <input
                  value={inviteEmail}
                  onChange={e => { setInviteEmail(e.target.value); setInviteResult(null) }}
                  type="email" required autoFocus
                  placeholder="editor@email.com"
                  style={inputStyle}
                />
              </Field>
            </div>
            <button type="submit" style={{ ...btnPrimary, height: 42, flexShrink: 0 }} disabled={submitting}>
              {submitting ? 'Enviando…' : 'Convidar'}
            </button>
          </form>

          {inviteResult && !inviteResult.error && (
            <div style={{
              padding: '12px 16px', borderRadius: 8,
              background: theme.colors.successMuted,
              border: `1px solid rgba(124, 224, 184, 0.3)`,
              color: theme.colors.success, fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Icon name="check" size={16} />
              <span>{inviteResult.message}</span>
            </div>
          )}

          {inviteResult?.error && (
            <div style={{
              padding: '12px 16px', borderRadius: 8,
              background: theme.colors.dangerMuted,
              border: '1px solid rgba(244, 115, 131, 0.3)',
              color: theme.colors.danger, fontSize: 13,
            }}>
              {inviteResult.error}
            </div>
          )}

          <div style={{ borderTop: `1px solid ${theme.colors.border}`, paddingTop: 14, marginTop: 4 }}>
            <div style={{ fontSize: 12, color: theme.colors.textFaint, lineHeight: 1.5 }}>
              <strong style={{ color: theme.colors.textMuted }}>Como funciona:</strong><br />
              1. O editor cria uma conta em <span style={{ color: theme.colors.primary }}>/register</span> como "Editor"<br />
              2. Você convida pelo email dele aqui<br />
              3. Ele aceita o convite nas notificações<br />
              4. Pronto! Ele aparece na equipe e pode receber pedidos
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function EditorCard({ member, onRefresh }) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [removing, setRemoving] = useState(false)

  async function handleRemove() {
    setRemoving(true)
    try {
      await api.team.delete(member.id)
      onRefresh()
    } catch (err) { alert(err.message) }
    setRemoving(false)
    setShowConfirm(false)
  }

  const total = member.total_orders ?? 0
  const completed = member.completed_orders ?? 0
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  const isMembership = member.membership_type === 'membership'

  return (
    <div style={{ ...panelStyle, padding: 20, position: 'relative', overflow: 'hidden', transition: 'border-color 0.18s, background 0.18s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = theme.colors.borderLight; e.currentTarget.style.background = theme.colors.panelElev }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = theme.colors.border; e.currentTarget.style.background = theme.colors.panel }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: member.role === 'gestor' ? theme.colors.warm : theme.colors.primary,
      }} />

      {/* Confirmation overlay */}
      {showConfirm && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          background: 'rgba(10, 13, 19, 0.92)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: 24, gap: 14, borderRadius: 14,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: theme.colors.dangerMuted,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="trash" size={20} color={theme.colors.danger} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: theme.colors.text, marginBottom: 4 }}>
              Remover {member.name}?
            </div>
            <div style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 1.5 }}>
              {isMembership
                ? 'O editor sera desvinculado da sua equipe.'
                : 'O editor sera desativado da plataforma.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={() => setShowConfirm(false)} style={{ ...btnSoft, padding: '8px 18px', fontSize: 12.5 }} disabled={removing}>
              Cancelar
            </button>
            <button onClick={handleRemove} disabled={removing} style={{
              ...btnPrimary, padding: '8px 18px', fontSize: 12.5,
              background: theme.colors.danger, color: '#fff',
              opacity: removing ? 0.6 : 1,
            }}>
              <Icon name="trash" size={12} />
              {removing ? 'Removendo...' : 'Sim, remover'}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar name={member.name} size={44} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: theme.colors.text }}>
              {member.name}
              {isMembership && (
                <span style={{
                  marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 4,
                  background: theme.colors.primaryMuted, color: theme.colors.primary,
                }}>externo</span>
              )}
            </div>
            <div className="eyebrow" style={{ marginTop: 2 }}>{member.role} · ativo</div>
          </div>
        </div>
        {member.role !== 'gestor' && (
          <button onClick={() => setShowConfirm(true)} title="Remover" style={{ color: theme.colors.textFaint, padding: 6, cursor: 'pointer' }}>
            <Icon name="trash" size={14} />
          </button>
        )}
      </div>

      {member.email && (
        <div style={{ fontSize: 12, color: theme.colors.textMuted, marginBottom: 14, fontFamily: theme.fonts.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {member.email}
        </div>
      )}

      {total > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, padding: '14px 0', borderTop: `1px solid ${theme.colors.borderSoft}` }}>
            <div>
              <div className="eyebrow" style={{ fontSize: 9 }}>Em curso</div>
              <div className="display tnum" style={{ fontSize: 22, marginTop: 4, color: theme.colors.primary }}>
                {Math.max(0, total - completed)}
              </div>
            </div>
            <div style={{ borderLeft: `1px solid ${theme.colors.borderSoft}`, paddingLeft: 14 }}>
              <div className="eyebrow" style={{ fontSize: 9 }}>Concluidos</div>
              <div className="display tnum" style={{ fontSize: 22, marginTop: 4, color: theme.colors.text }}>{completed}</div>
            </div>
            <div style={{ borderLeft: `1px solid ${theme.colors.borderSoft}`, paddingLeft: 14 }}>
              <div className="eyebrow" style={{ fontSize: 9 }}>Taxa</div>
              <div className="display tnum" style={{
                fontSize: 22, marginTop: 4,
                color: pct >= 80 ? theme.colors.mint : pct >= 60 ? theme.colors.gold : theme.colors.warm,
              }}>{pct}%</div>
            </div>
          </div>
          <div style={{ height: 4, background: theme.colors.bg, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: theme.colors.primary }} />
          </div>
        </>
      )}
    </div>
  )
}
