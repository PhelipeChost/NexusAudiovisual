// src/components/ui.jsx
// Primitivos visuais reutilizáveis: Icon, Avatar, Badge, Sparkline, Spinner, LogoMark, Field
import React from 'react'
import theme from '../styles/theme'

/* ============================================================
   Icon — biblioteca interna inline
   ============================================================ */
const ICONS = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  clients: 'M16 11a4 4 0 100-8 4 4 0 000 8zM8 11a4 4 0 100-8 4 4 0 000 8zm0 2c-2.67 0-8 1.34-8 4v3h16v-3c0-2.66-5.33-4-8-4zm8 0c-.29 0-.62.02-.97.05A5.99 5.99 0 0118 17v3h6v-3c0-2.66-5.33-4-8-4z',
  team: 'M9 7c1.66 0 3-1.34 3-3S10.66 1 9 1 6 2.34 6 4s1.34 3 3 3zm6 0c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zM9 9c-2.33 0-7 1.17-7 3.5V15h14v-2.5C16 10.17 11.33 9 9 9zm6 0c-.29 0-.62.02-.97.05.02.01.03.03.04.04C16.32 10.62 17 12.45 17 12.5V15h5v-2.5C22 10.17 17.33 9 15 9z',
  financial: 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z',
  settings: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
  bell: 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
  search: 'M15.5 14h-.79l-.28-.27a6.5 6.5 0 001.48-5.34c-.47-2.78-2.79-5-5.59-5.34a6.505 6.505 0 00-7.27 7.27c.34 2.8 2.56 5.12 5.34 5.59a6.5 6.5 0 005.34-1.48l.27.28v.79l4.25 4.25c.41.41 1.08.41 1.49 0 .41-.41.41-1.08 0-1.49L15.5 14zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  x: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  check: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  chevronDown: 'M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z',
  chevronRight: 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
  chevronLeft: 'M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z',
  arrowRight: 'M5 13h11.17l-4.88 4.88c-.39.39-.39 1.03 0 1.42.39.39 1.02.39 1.41 0l6.59-6.59a.996.996 0 000-1.41l-6.58-6.6a.996.996 0 10-1.41 1.41L16.17 11H5c-.55 0-1 .45-1 1s.45 1 1 1z',
  arrowUp: 'M13 19V7.83l4.88 4.88c.39.39 1.03.39 1.42 0a.996.996 0 000-1.41l-6.59-6.59a.996.996 0 00-1.41 0L4.7 11.3a.996.996 0 000 1.41c.39.39 1.02.39 1.41 0L11 7.83V19c0 .55.45 1 1 1s1-.45 1-1z',
  arrowDown: 'M11 5v11.17l-4.88-4.88c-.39-.39-1.03-.39-1.42 0a.996.996 0 000 1.41l6.59 6.59c.39.39 1.02.39 1.41 0l6.59-6.59a.996.996 0 10-1.41-1.41L13 16.17V5c0-.55-.45-1-1-1s-1 .45-1 1z',
  logout: 'M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z',
  film: 'M18 4v1h-2V4c0-.55-.45-1-1-1H9c-.55 0-1 .45-1 1v1H6V4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v16c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h2v1c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-1h2v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1h-1c-.55 0-1 .45-1 1zM8 17H6v-2h2v2zm0-4H6v-2h2v2zm0-4H6V7h2v2zm10 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z',
  filter: 'M4.25 5.61C6.27 8.2 10 13 10 13v6c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-6s3.72-4.8 5.74-7.39A.998.998 0 0018.95 4H5.04c-.83 0-1.3.95-.79 1.61z',
  link: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',
  message: 'M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z',
  clock: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z',
  drive: 'M7.71 3.5L1.15 15l3.42 6h6.83L11.42 21 14.85 15 8.29 3.5h-.58z',
  briefcase: 'M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z',
  more: 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
  trash: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 000-1.41l-2.34-2.34a.996.996 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
}

export function Icon({ name, size = 18, stroke = false, color = 'currentColor', style }) {
  const path = ICONS[name]
  if (!path) return null
  if (stroke) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={style}>
        <path d={path} />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={style}>
      <path d={path} />
    </svg>
  )
}

/* ============================================================
   Avatar — disco com iniciais, cor estável por hash do nome
   ============================================================ */
function nameHue(name) {
  if (!name) return 195
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}

export function Avatar({ name, size = 32, square = false, hue, src }) {
  const letters = (name || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()
  const h = hue ?? nameHue(name)
  const bg = `oklch(0.32 0.08 ${h})`
  const fg = `oklch(0.88 0.10 ${h})`
  const borderR = square || size > 40 ? Math.max(6, size * 0.18) : '50%'
  if (src) {
    return (
      <img src={src} alt={name || ''} style={{
        width: size, height: size,
        borderRadius: borderR,
        objectFit: 'cover',
        flexShrink: 0,
        border: '1px solid rgba(255,255,255,0.04)',
      }} />
    )
  }
  return (
    <div style={{
      width: size, height: size,
      borderRadius: borderR,
      background: bg, color: fg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: theme.fonts.mono, fontWeight: 500,
      fontSize: size * 0.36, letterSpacing: '0.02em',
      flexShrink: 0,
      border: '1px solid rgba(255,255,255,0.04)',
    }}>
      {letters}
    </div>
  )
}

/* ============================================================
   LogoMark — marca do Nexus
   ============================================================ */
export function LogoMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect x="1" y="1" width="38" height="38" rx="9" stroke="#7fdbff" strokeOpacity="0.3" />
      <rect x="1" y="1" width="38" height="38" rx="9" fill="url(#nxLogo)" fillOpacity="0.12" />
      <defs>
        <linearGradient id="nxLogo" x1="0" y1="0" x2="40" y2="40">
          <stop offset="0" stopColor="#7fdbff" />
          <stop offset="1" stopColor="#ff8a6b" />
        </linearGradient>
      </defs>
      <path d="M12 28V12L28 28V12" stroke="#ecebe5" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="20" cy="20" r="2" fill="#7fdbff" />
    </svg>
  )
}

/* ============================================================
   Badge
   ============================================================ */
export function Badge({ children, color = 'accent', variant = 'soft' }) {
  const colorMap = {
    accent: { bg: 'var(--accent-soft)', fg: 'var(--accent)' },
    mint:   { bg: 'var(--mint-soft)', fg: 'var(--mint)' },
    gold:   { bg: 'var(--gold-soft)', fg: 'var(--gold)' },
    warm:   { bg: 'var(--warm-soft)', fg: 'var(--warm)' },
    rose:   { bg: 'var(--rose-soft)', fg: 'var(--rose)' },
    neutral:{ bg: 'var(--bg-2)', fg: 'var(--text-2)' },
  }
  const c = colorMap[color] || colorMap.accent
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 9px',
      borderRadius: 9999,
      background: variant === 'solid' ? c.fg : c.bg,
      color: variant === 'solid' ? '#0a0d13' : c.fg,
      fontFamily: theme.fonts.mono,
      fontSize: 10.5,
      fontWeight: 500,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
    }}>
      {children}
    </span>
  )
}

/* ============================================================
   Sparkline
   ============================================================ */
export function Sparkline({ data, color = '#7fdbff', height = 28, width = 100, fill = true }) {
  if (!data || data.length === 0) return null
  const max = Math.max(...data), min = Math.min(...data)
  const range = max - min || 1
  const stepX = data.length > 1 ? width / (data.length - 1) : width
  const points = data.map((v, i) => `${i * stepX},${height - ((v - min) / range) * (height - 4) - 2}`).join(' ')
  const fillPoints = `0,${height} ${points} ${width},${height}`
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {fill && <polygon points={fillPoints} fill={color} opacity="0.10" />}
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/* ============================================================
   Spinner
   ============================================================ */
export function Spinner({ size = 32 }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
      <div className="spin" style={{
        width: size, height: size,
        border: '3px solid var(--line)',
        borderTopColor: 'var(--accent)',
        borderRadius: '50%',
      }} />
    </div>
  )
}

/* ============================================================
   Eyebrow
   ============================================================ */
export function Eyebrow({ children, style }) {
  return <div className="eyebrow" style={style}>{children}</div>
}

/* ============================================================
   Field — wrapper de label + input
   ============================================================ */
export function Field({ label, required, hint, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6, fontWeight: 500 }}>
        {label}{required && <span style={{ color: 'var(--warm)', marginLeft: 4 }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

/* ============================================================
   Estilos compartilhados de input/botões para uso inline
   ============================================================ */
export const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  background: theme.colors.bg,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radius.md,
  color: theme.colors.text,
  fontSize: 13.5,
  fontFamily: theme.fonts.ui,
  outline: 'none',
  transition: 'border-color 0.15s',
}

export const btnPrimary = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '9px 16px',
  background: theme.colors.primary,
  color: theme.colors.primaryInk,
  border: 'none',
  borderRadius: theme.radius.md,
  fontSize: 13,
  fontFamily: theme.fonts.ui,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'background 0.15s',
}

export const btnGhost = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '9px 16px',
  background: 'transparent',
  color: theme.colors.text,
  border: `1px solid ${theme.colors.borderLight}`,
  borderRadius: theme.radius.md,
  fontSize: 13,
  fontFamily: theme.fonts.ui,
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

export const btnSoft = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '9px 16px',
  background: theme.colors.bgSecondary,
  color: theme.colors.text,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radius.md,
  fontSize: 13,
  fontFamily: theme.fonts.ui,
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

export const btnDanger = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '9px 16px',
  background: theme.colors.dangerMuted,
  color: theme.colors.danger,
  border: `1px solid rgba(244, 115, 131, 0.3)`,
  borderRadius: theme.radius.md,
  fontSize: 13,
  fontFamily: theme.fonts.ui,
  fontWeight: 600,
  cursor: 'pointer',
}

export const panelStyle = {
  background: theme.colors.panel,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radius.lg,
}

export const PRIORITY = {
  urgent: { label: 'Urgente', color: theme.colors.danger, soft: theme.colors.dangerMuted },
  high:   { label: 'Alta',    color: theme.colors.warm,   soft: theme.colors.warmMuted },
  normal: { label: 'Normal',  color: theme.colors.primary,soft: theme.colors.primaryMuted },
  low:    { label: 'Baixa',   color: theme.colors.textMuted, soft: 'rgba(138, 141, 150, 0.14)' },
}

export function fmtBRL(n, omitSymbol = false) {
  if (n == null || isNaN(n)) return '—'
  const v = Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return omitSymbol ? v : 'R$ ' + v
}

export function daysUntil(dateStr) {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0,0,0,0)
  const due = new Date(dateStr)
  due.setHours(0,0,0,0)
  return Math.round((due - today) / (1000 * 60 * 60 * 24))
}
