// src/components/OrderComments.jsx — reusable comment thread for orders (gestor, editor, client)
import { useState, useEffect, useRef } from 'react'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import theme from '../styles/theme'
import { Icon, Avatar, inputStyle, btnPrimary } from './ui'

export default function OrderComments({ orderId, maxHeight = 320 }) {
  const { user } = useAuth()
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [timestamp, setTimestamp] = useState('')
  const [sending, setSending] = useState(false)
  const [showTimestamp, setShowTimestamp] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!orderId) return
    setLoading(true)
    api.orders.getComments(orderId)
      .then(data => setComments(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [orderId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments.length])

  async function send() {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      const comment = await api.orders.addComment(orderId, {
        text: text.trim(),
        timestamp_mark: timestamp.trim() || null,
      })
      setComments(prev => [...prev, comment])
      setText('')
      setTimestamp('')
      setShowTimestamp(false)
    } catch (err) { alert(err.message) }
    setSending(false)
  }

  const roleColors = {
    gestor: theme.colors.primary,
    editor: theme.colors.mint,
    cliente: theme.colors.gold,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="message" size={14} color={theme.colors.textMuted} />
        <span className="eyebrow">Comentarios · {comments.length}</span>
      </div>

      {/* Messages */}
      <div style={{
        maxHeight,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        paddingRight: 4,
      }}>
        {loading && <div style={{ fontSize: 12, color: theme.colors.textMuted, padding: 12 }}>Carregando...</div>}
        {!loading && comments.length === 0 && (
          <div style={{ fontSize: 12, color: theme.colors.textFaint, padding: '16px 0', textAlign: 'center' }}>
            Nenhum comentario ainda. Inicie a conversa.
          </div>
        )}
        {comments.map(c => {
          const isMe = c.user_id === user?.id
          return (
            <div key={c.id} style={{ display: 'flex', gap: 10, flexDirection: isMe ? 'row-reverse' : 'row' }}>
              <Avatar name={c.user_name} size={28} src={c.user_avatar || undefined} />
              <div style={{
                flex: 1,
                maxWidth: '80%',
                padding: '10px 14px',
                background: isMe ? 'rgba(127, 219, 255, 0.06)' : theme.colors.bg,
                border: `1px solid ${isMe ? 'rgba(127, 219, 255, 0.15)' : theme.colors.border}`,
                borderRadius: isMe ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: theme.colors.text }}>{c.user_name}</span>
                  <span style={{
                    fontSize: 9, padding: '1px 5px', borderRadius: 3,
                    background: (roleColors[c.user_role] || theme.colors.textFaint) + '22',
                    color: roleColors[c.user_role] || theme.colors.textFaint,
                    fontFamily: theme.fonts.mono, fontWeight: 600, textTransform: 'uppercase',
                  }}>
                    {c.user_role}
                  </span>
                  {c.timestamp_mark && (
                    <span className="mono" style={{
                      padding: '1px 6px', background: theme.colors.goldMuted,
                      color: theme.colors.gold, fontSize: 10, borderRadius: 3,
                    }}>
                      {c.timestamp_mark}
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: theme.colors.textFaint }}>
                    {new Date(c.created_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: theme.colors.textSecondary, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {c.text}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        padding: '10px 12px',
        background: theme.colors.bgSecondary,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: 10,
      }}>
        {showTimestamp && (
          <input
            value={timestamp}
            onChange={e => setTimestamp(e.target.value)}
            placeholder="Timestamp (ex: 01:30)"
            style={{
              ...inputStyle, padding: '6px 10px', fontSize: 12,
              fontFamily: theme.fonts.mono, width: 160,
            }}
          />
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setShowTimestamp(s => !s)}
            title="Adicionar timestamp"
            style={{
              padding: '6px 8px', borderRadius: 6, border: 'none',
              background: showTimestamp ? theme.colors.goldMuted : 'transparent',
              color: showTimestamp ? theme.colors.gold : theme.colors.textMuted,
              cursor: 'pointer', display: 'flex', alignItems: 'center',
            }}
          >
            <Icon name="clock" size={14} />
          </button>
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Escreva um comentario..."
            style={{ ...inputStyle, flex: 1, padding: '8px 12px' }}
          />
          <button
            onClick={send}
            disabled={!text.trim() || sending}
            style={{
              ...btnPrimary,
              padding: '8px 14px',
              opacity: !text.trim() || sending ? 0.5 : 1,
            }}
          >
            <Icon name="arrowRight" size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
