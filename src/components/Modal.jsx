// src/components/Modal.jsx — modal desktop + bottom-sheet mobile
import { useEffect } from 'react'
import { Icon } from './ui'
import useIsMobile from '../hooks/useIsMobile'

export default function Modal({ open, onClose, title, subtitle, width = 520, children }) {
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!open) return
    const onEsc = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onEsc)
    // Prevent body scroll when modal is open on mobile
    if (isMobile) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', onEsc)
      document.body.style.overflow = ''
    }
  }, [open, onClose, isMobile])

  if (!open) return null

  // Mobile: full-screen bottom sheet
  if (isMobile) {
    return (
      <div
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(5, 7, 12, 0.7)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 1000,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          animation: 'fade-in 0.15s ease-out',
        }}
        onClick={onClose}
      >
        <div
          className="slide-up"
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--bg-1)',
            borderTop: '1px solid var(--line-strong)',
            borderRadius: '16px 16px 0 0',
            maxHeight: '92vh',
            display: 'flex', flexDirection: 'column',
            paddingBottom: 'env(safe-area-inset-bottom, 0)',
          }}
        >
          {/* Handle bar + header */}
          <div style={{ flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--line)' }} />
            </div>
            {(title || subtitle) && (
              <div style={{
                padding: '12px 20px 10px',
                borderBottom: '1px solid var(--line)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
              }}>
                <div>
                  {subtitle && <div className="eyebrow" style={{ marginBottom: 3 }}>{subtitle}</div>}
                  {title && <h2 className="display" style={{ fontSize: 20, lineHeight: 1.1, margin: 0 }}>{title}</h2>}
                </div>
                <button onClick={onClose} style={{
                  padding: 6, color: 'var(--text-2)', borderRadius: 6,
                  display: 'flex', alignItems: 'center',
                }}>
                  <Icon name="x" size={20} />
                </button>
              </div>
            )}
          </div>
          <div style={{
            padding: title ? '16px 16px 20px' : '16px',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            flex: 1,
          }}>
            {children}
          </div>
        </div>
      </div>
    )
  }

  // Desktop: centered modal
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
