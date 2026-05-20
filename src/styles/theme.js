// src/styles/theme.js
// Atelier — direção redesenhada do Audiovisual Nexus.
// Tokens em formato compatível com a estrutura anterior (theme.colors, theme.fonts, etc).

const theme = {
  colors: {
    // Superfícies — navy editorial profundo
    bg:           '#0a0d13',
    bgSecondary:  '#0f131c',
    surface:      '#0f131c',
    surfaceHover: '#141925',
    card:         '#0f131c',
    cardHover:    '#141925',
    panel:        '#0f131c',
    panelElev:    '#141925',

    // Linhas
    border:       '#1d2230',
    borderLight:  '#2a3142',
    borderSoft:   '#161b27',

    // Texto
    text:           '#ecebe5',
    textSecondary:  '#c8c9c4',
    textMuted:      '#8a8d96',
    textFaint:      '#555864',

    // Cores funcionais
    primary:        '#7fdbff',
    primaryHover:   '#a5e6ff',
    primaryMuted:   'rgba(127, 219, 255, 0.12)',
    primaryLine:    'rgba(127, 219, 255, 0.25)',
    primaryInk:     '#0a0d13', // texto sobre fundo accent

    secondary:      '#a5e6ff',
    secondaryMuted: 'rgba(127, 219, 255, 0.10)',

    success:        '#7ce0b8',
    successMuted:   'rgba(124, 224, 184, 0.14)',
    warning:        '#d9b770',
    warningMuted:   'rgba(217, 183, 112, 0.14)',
    danger:         '#f47383',
    dangerMuted:    'rgba(244, 115, 131, 0.14)',
    warm:           '#ff8a6b',
    warmMuted:      'rgba(255, 138, 107, 0.14)',
    gold:           '#d9b770',
    goldMuted:      'rgba(217, 183, 112, 0.14)',
    mint:           '#7ce0b8',
    mintMuted:      'rgba(124, 224, 184, 0.14)',

    white: '#ffffff',
    black: '#000000',
  },

  fonts: {
    body:    "'Inter', system-ui, -apple-system, sans-serif",
    ui:      "'Inter', system-ui, -apple-system, sans-serif",
    display: "'Inter', system-ui, -apple-system, sans-serif",
    mono:    "'Inter', system-ui, -apple-system, sans-serif",
  },

  radius: {
    xs: '4px',
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    xxl: '20px',
    full: '9999px',
  },

  shadows: {
    sm:   '0 1px 2px rgba(0,0,0,0.35)',
    md:   '0 8px 24px rgba(0,0,0,0.45)',
    lg:   '0 20px 60px rgba(0,0,0,0.55)',
    glow: '0 0 0 1px rgba(127, 219, 255, 0.15)',
  },

  transitions: {
    fast:   '0.15s ease',
    normal: '0.22s ease',
    slow:   '0.4s ease',
  },

  spacing: {
    xs:  '4px',
    sm:  '8px',
    md:  '16px',
    lg:  '24px',
    xl:  '32px',
    xxl: '48px',
  },
}

export default theme
