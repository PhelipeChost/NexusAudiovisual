// src/components/Modal.jsx — modal padrão da plataforma
import { useEffect } from 'react'
import { Icon } from './ui'

export default function Modal({ open, onClose, title, subtitle, width = 520, children }) {
  useEffect(() => {
    if (!open) return
    const onEsc = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width, maxWidth: '94vw' }} onClick={e => e.stopPropagation()}>
        {(title || subtitle) && (
          <div style={{
            padding: '20px 28px 14px',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            flexShrink: 0,
          }}>
            <div>
              {subtitle && <div className="eyebrow" style={{ marginBottom: 4 }}>{subtitle}</div>}
              {title && <h2 className="display" style={{ fontSize: 24, lineHeight: 1.1, margin: 0 }}>{title}</h2>}
            </div>
            <button onClick={onClose} style={{
              padding: 6, color: 'var(--text-2)', borderRadius: 6,
              display: 'flex', alignItems: 'center',
            }}>
              <Icon name="x" size={18} />
            </button>
          </div>
        )}
        <div style={{ padding: title ? '20px 28px 24px' : '28px', overflowY: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
