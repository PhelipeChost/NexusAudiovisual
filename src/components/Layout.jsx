// src/components/Layout.jsx — sidebar desktop + bottom-bar mobile + topbar + notificações
import { useState, useEffect, useRef, createContext, useContext } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api'
import theme from '../styles/theme'
import { Icon, Avatar, LogoMark } from './ui'
import useIsMobile from '../hooks/useIsMobile'

// Context to share sidebar state with child pages
export const SidebarContext = createContext({ collapsed: false })
export function useSidebar() { return useContext(SidebarContext) }

const ALL_NAV_ITEMS = [
  { path: '/dashboard', label: 'Panorama',      icon: 'dashboard', roles: ['gestor', 'editor', 'cliente', 'admin'], end: true },
  { path: '/dashboard/board', label: 'Mapa',     icon: 'film', roles: ['editor'] },
  { path: '/dashboard/editor-financial', label: 'Financeiro', icon: 'financial', roles: ['editor'] },
  { path: '/dashboard/editor-report', label: 'Relatorio', icon: 'briefcase', roles: ['editor'] },
  { path: '/dashboard/clients', label: 'Clientes', icon: 'clients', roles: ['gestor'] },
  { path: '/dashboard/team', label: 'Equipe',      icon: 'team', roles: ['gestor'] },
  { path: '/dashboard/financial', label: 'Financeiro', icon: 'financial', roles: ['gestor'] },
  { path: '/dashboard/contracts', label: 'Contratos', icon: 'briefcase', roles: ['gestor'] },
  { path: '/dashboard/calendar', label: 'Calendario', icon: 'calendar', roles: ['gestor'] },
  { path: '/dashboard/reports', label: 'Relatorios', icon: 'briefcase', roles: ['gestor'] },
  { path: '/dashboard/settings', label: 'Configuracoes', icon: 'settings', roles: ['gestor', 'editor', 'cliente'] },
]

// Bottom bar: primary 4 items per role, rest go in "Mais" sheet
const BOTTOM_BAR_ITEMS = {
  gestor: [
    { path: '/dashboard', label: 'Inicio', icon: 'dashboard', end: true },
    { path: '/dashboard/clients', label: 'Clientes', icon: 'clients' },
    { path: '/dashboard/financial', label: 'Financeiro', icon: 'financial' },
    { path: '/dashboard/contracts', label: 'Contratos', icon: 'briefcase' },
  ],
  editor: [
    { path: '/dashboard', label: 'Inicio', icon: 'dashboard', end: true },
    { path: '/dashboard/board', label: 'Mapa', icon: 'film' },
    { path: '/dashboard/editor-financial', label: 'Financeiro', icon: 'financial' },
    { path: '/dashboard/editor-report', label: 'Relatorio', icon: 'briefcase' },
  ],
  cliente: [
    { path: '/dashboard', label: 'Inicio', icon: 'dashboard', end: true },
    { path: '/dashboard/settings', label: 'Config', icon: 'settings' },
  ],
  admin: [
    { path: '/dashboard', label: 'Admin', icon: 'dashboard', end: true },
  ],
}

const PAGE_TITLES = {
  '/dashboard': 'Panorama',
  '/dashboard/board': 'Mapa',
  '/dashboard/clients': 'Clientes',
  '/dashboard/team': 'Equipe',
  '/dashboard/financial': 'Financeiro',
  '/dashboard/calendar': 'Calendario',
  '/dashboard/reports': 'Relatorios',
  '/dashboard/admin': 'Administracao',
  '/dashboard/settings': 'Configuracoes',
  '/dashboard/contracts': 'Contratos',
  '/dashboard/editor-financial': 'Financeiro',
  '/dashboard/editor-report': 'Relatorio',
}

const SIDEBAR_WIDTH = 232
const SIDEBAR_COLLAPSED_WIDTH = 62
const BOTTOM_BAR_HEIGHT = 64

export default function Layout() {
  const { user, logout, setUser } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [notifications, setNotifications] = useState({ notifications: [], unread: 0 })
  const [showNotifs, setShowNotifs] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const notifRef = useRef(null)
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('nexus_sidebar_collapsed') === '1' } catch { return false }
  })

  const [subscription, setSubscription] = useState(null)

  const NAV_ITEMS = ALL_NAV_ITEMS.filter(item => item.roles.includes(user?.role))
  const bottomItems = BOTTOM_BAR_ITEMS[user?.role] || BOTTOM_BAR_ITEMS.gestor
  const moreItems = NAV_ITEMS.filter(n => !bottomItems.some(b => b.path === n.path))

  // Load subscription info for gestors
  useEffect(() => {
    if (user?.role === 'gestor') {
      api.subscription.get().then(d => setSubscription(d)).catch(() => {})
    }
  }, [user?.role])

  function toggleSidebar() {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('nexus_sidebar_collapsed', next ? '1' : '0') } catch {}
      return next
    })
  }

  useEffect(() => {
    let cancelled = false
    const load = () => api.notifications.get().then(d => { if (!cancelled) setNotifications(d) }).catch(() => {})
    load()
    const id = setInterval(load, 30000)
    return () => { cancelled = true; clearInterval(id) }
  }, [user?.role])

  useEffect(() => {
    const onClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false)
    }
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === 'Escape') { setSearchOpen(false); setMoreOpen(false) }
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  // Close "more" menu on navigation
  useEffect(() => { setMoreOpen(false) }, [location.pathname])

  const currentTitle =
    PAGE_TITLES[location.pathname] ||
    (location.pathname.startsWith('/dashboard/clients/') ? 'Cliente' : '')

  const sidebarW = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH

  // ===== MOBILE LAYOUT =====
  if (isMobile) {
    return (
      <SidebarContext.Provider value={{ collapsed: false, isMobile: true }}>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {/* Mobile topbar */}
        <header style={{
          height: 52,
          padding: '0 16px',
          borderBottom: `1px solid ${theme.colors.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          background: 'rgba(10, 13, 19, 0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {user?.company_logo ? (
              <img src={user.company_logo} alt="" style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'cover' }} />
            ) : (
              <LogoMark size={26} />
            )}
            <h1 className="display" style={{ fontSize: 17, lineHeight: 1, margin: 0, color: theme.colors.text }}>
              {currentTitle}
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div ref={notifRef} style={{ position: 'relative' }}>
              <button
                onClick={() => {
                  setShowNotifs(o => !o)
                  if (!showNotifs && notifications.unread > 0) {
                    api.notifications.readAll().then(() => setNotifications(n => ({ ...n, unread: 0 })))
                  }
                }}
                style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: showNotifs ? theme.colors.surfaceHover : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: theme.colors.textSecondary, position: 'relative',
                }}
              >
                <Icon name="bell" size={18} stroke />
                {notifications.unread > 0 && (
                  <span style={{
                    position: 'absolute', top: 6, right: 6,
                    width: 7, height: 7, borderRadius: '50%',
                    background: theme.colors.warm,
                    border: `2px solid ${theme.colors.bg}`,
                  }} />
                )}
              </button>

              {showNotifs && (
                <div className="slide-up" style={{
                  position: 'fixed', top: 52, left: 0, right: 0,
                  maxHeight: 'calc(100vh - 52px - 64px)', overflowY: 'auto',
                  background: theme.colors.bgSecondary,
                  borderBottom: `1px solid ${theme.colors.borderLight}`,
                  boxShadow: theme.shadows.lg,
                  zIndex: 200,
                }}>
                  <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.colors.border}` }}>
                    <div className="display" style={{ fontSize: 16, color: theme.colors.text }}>Notificações</div>
                  </div>
                  {notifications.notifications.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: theme.colors.textMuted, fontSize: 13 }}>
                      Nenhuma notificação
                    </div>
                  ) : notifications.notifications.slice(0, 12).map(n => (
                    <NotifItem key={n.id} n={n} setNotifications={setNotifications} setUser={setUser} />
                  ))}
                </div>
              )}
            </div>

            <Avatar name={user?.name} size={30} src={user?.avatar || undefined} />
          </div>
        </header>

        {/* Subscription banner */}
        {subscription && user?.role === 'gestor' && (() => {
          const s = subscription
          if (s.status === 'trial') {
            const daysLeft = s.trial_ends_at ? Math.max(0, Math.ceil((new Date(s.trial_ends_at) - new Date()) / 86400000)) : 0
            return (
              <div style={{
                padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'rgba(127, 219, 255, 0.08)', borderBottom: `1px solid rgba(127, 219, 255, 0.15)`,
                fontSize: 12,
              }}>
                <span style={{ color: theme.colors.primary }}>
                  ⏱ Teste: <strong>{daysLeft} dias</strong>
                </span>
              </div>
            )
          }
          if (s.status === 'past_due') {
            return (
              <div style={{
                padding: '8px 16px', fontSize: 12, color: theme.colors.warning,
                background: 'rgba(217, 183, 112, 0.08)', borderBottom: `1px solid rgba(217, 183, 112, 0.15)`,
              }}>
                ⚠ Pagamento pendente
              </div>
            )
          }
          return null
        })()}

        {/* Page content */}
        <main style={{
          flex: 1,
          padding: '16px 12px',
          paddingBottom: BOTTOM_BAR_HEIGHT + 16,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}>
          <Outlet />
        </main>

        {/* "Mais" sheet */}
        {moreOpen && (
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 150,
              background: 'rgba(5, 7, 12, 0.6)',
              animation: 'fade-in 0.15s ease-out',
            }}
            onClick={() => setMoreOpen(false)}
          >
            <div
              className="slide-up"
              onClick={e => e.stopPropagation()}
              style={{
                position: 'absolute', bottom: BOTTOM_BAR_HEIGHT, left: 0, right: 0,
                background: theme.colors.bgSecondary,
                borderTop: `1px solid ${theme.colors.borderLight}`,
                borderRadius: '16px 16px 0 0',
                padding: '8px 0 12px',
                maxHeight: '60vh',
                overflowY: 'auto',
              }}
            >
              {/* Handle bar */}
              <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 12px' }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: theme.colors.border }} />
              </div>

              {moreItems.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  onClick={() => setMoreOpen(false)}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 24px',
                    color: isActive ? theme.colors.primary : theme.colors.text,
                    fontSize: 15, fontWeight: isActive ? 600 : 400,
                    textDecoration: 'none',
                    background: isActive ? theme.colors.primaryMuted : 'transparent',
                  })}
                >
                  <Icon name={item.icon} size={20} stroke />
                  <span>{item.label}</span>
                </NavLink>
              ))}

              {/* Logout */}
              <button
                onClick={() => { setMoreOpen(false); logout() }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 24px', width: '100%',
                  color: theme.colors.danger, fontSize: 15,
                  borderTop: `1px solid ${theme.colors.border}`,
                  marginTop: 4,
                }}
              >
                <Icon name="logout" size={20} stroke />
                <span>Sair</span>
              </button>
            </div>
          </div>
        )}

        {/* Bottom navigation bar */}
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          height: BOTTOM_BAR_HEIGHT,
          background: 'rgba(10, 13, 19, 0.92)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderTop: `1px solid ${theme.colors.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          zIndex: 100,
          paddingBottom: 'env(safe-area-inset-bottom, 0)',
        }}>
          {bottomItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              style={({ isActive }) => ({
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 3, padding: '6px 0',
                color: isActive ? theme.colors.primary : theme.colors.textMuted,
                textDecoration: 'none',
                minWidth: 56,
                position: 'relative',
              })}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span style={{
                      position: 'absolute', top: -1,
                      width: 20, height: 2, borderRadius: 1,
                      background: theme.colors.primary,
                    }} />
                  )}
                  <Icon name={item.icon} size={22} stroke={!isActive} color={isActive ? theme.colors.primary : theme.colors.textMuted} />
                  <span style={{ fontSize: 10, fontWeight: isActive ? 600 : 400 }}>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}

          {/* "Mais" button */}
          {moreItems.length > 0 && (
            <button
              onClick={() => setMoreOpen(o => !o)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 3, padding: '6px 0',
                color: moreOpen ? theme.colors.primary : theme.colors.textMuted,
                minWidth: 56,
              }}
            >
              <Icon name="more" size={22} stroke color={moreOpen ? theme.colors.primary : theme.colors.textMuted} />
              <span style={{ fontSize: 10, fontWeight: moreOpen ? 600 : 400 }}>Mais</span>
            </button>
          )}
        </nav>
      </div>
      </SidebarContext.Provider>
    )
  }

  // ===== DESKTOP LAYOUT =====
  return (
    <SidebarContext.Provider value={{ collapsed, isMobile: false }}>
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside style={{
        width: sidebarW,
        flexShrink: 0,
        background: 'transparent',
        borderRight: `1px solid ${theme.colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
        padding: collapsed ? '20px 8px' : '20px 14px',
        zIndex: 100,
        transition: 'width 0.2s ease, padding 0.2s ease',
        overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, minHeight: 36 }}>
          <button onClick={() => navigate('/dashboard')} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
            overflow: 'hidden', whiteSpace: 'nowrap',
          }}>
            {user?.company_logo ? (
              <img src={user.company_logo} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <LogoMark size={32} />
            )}
            {!collapsed && (
              <div>
                <div className="display" style={{ fontSize: 19, lineHeight: 1, letterSpacing: '-0.01em', color: theme.colors.text }}>
                  Nexus
                </div>
                <div className="eyebrow" style={{ marginTop: 3 }}>
                  {user?.company_name || 'Audiovisual'}
                </div>
              </div>
            )}
          </button>
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          {!collapsed && (
            <div className="eyebrow" style={{ padding: '6px 12px 8px' }}>
              {user?.role === 'cliente' ? 'Meu espaco' : user?.role === 'editor' ? 'Editor' : 'Operacao'}
            </div>
          )}
          {NAV_ITEMS.slice(0, NAV_ITEMS.length > 6 ? 6 : NAV_ITEMS.length).map(item => (
            <SidebarLink key={item.path} item={item} collapsed={collapsed} />
          ))}

          {NAV_ITEMS.length > 6 && (
            <>
              {!collapsed && <div className="eyebrow" style={{ padding: '20px 12px 8px' }}>Conta</div>}
              {collapsed && <div style={{ height: 16 }} />}
              {NAV_ITEMS.slice(6).map(item => (
                <SidebarLink key={item.path} item={item} collapsed={collapsed} />
              ))}
            </>
          )}
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={toggleSidebar}
          title={collapsed ? 'Expandir menu' : 'Minimizar menu'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, padding: '8px', marginBottom: 12,
            background: theme.colors.surfaceHover, border: `1px solid ${theme.colors.border}`,
            borderRadius: 8, cursor: 'pointer', color: theme.colors.textMuted,
            fontSize: 12, transition: 'all 0.15s',
          }}
        >
          <Icon name={collapsed ? 'arrowRight' : 'chevronLeft'} size={14} stroke />
          {!collapsed && <span>Minimizar</span>}
        </button>

        {/* User card */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px' }}>
            <Avatar name={user?.name} size={32} src={user?.avatar || undefined} />
            {!collapsed && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: theme.colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.name}
                </div>
                <div className="eyebrow" style={{ marginTop: 1, textTransform: 'capitalize', letterSpacing: '0.08em' }}>
                  {user?.role}
                </div>
              </div>
            )}
            {!collapsed && (
              <button onClick={logout} title="Sair" style={{
                padding: 6, color: theme.colors.textMuted, borderRadius: 6,
                display: 'flex', alignItems: 'center',
              }}>
                <Icon name="logout" size={16} stroke />
              </button>
            )}
          </div>
          {collapsed && (
            <button onClick={logout} title="Sair" style={{
              padding: 6, color: theme.colors.textMuted, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '100%', marginTop: 4,
            }}>
              <Icon name="logout" size={16} stroke />
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Topbar */}
        <header style={{
          height: 64,
          padding: '0 28px',
          borderBottom: `1px solid ${theme.colors.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
          background: 'rgba(10, 13, 19, 0.7)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}>
          <h1 className="display" style={{ fontSize: 22, lineHeight: 1.2, margin: 0, color: theme.colors.text }}>
            {currentTitle}
          </h1>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Search button (cmd+K) */}
            <button
              onClick={() => setSearchOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 12px 7px 10px',
                background: theme.colors.bgSecondary,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: 8,
                color: theme.colors.textMuted,
                fontSize: 12.5,
                minWidth: 220,
                cursor: 'pointer',
              }}
            >
              <Icon name="search" size={14} />
              <span>Buscar...</span>
              <span style={{ marginLeft: 'auto', fontFamily: theme.fonts.mono, fontSize: 10, padding: '2px 6px', background: theme.colors.surface, borderRadius: 4, color: theme.colors.textFaint }}>Ctrl+K</span>
            </button>

            <div ref={notifRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => {
                    setShowNotifs(o => !o)
                    if (!showNotifs && notifications.unread > 0) {
                      api.notifications.readAll().then(() => setNotifications(n => ({ ...n, unread: 0 })))
                    }
                  }}
                  style={{
                    width: 36, height: 36,
                    borderRadius: 8,
                    background: showNotifs ? theme.colors.surfaceHover : theme.colors.bgSecondary,
                    border: `1px solid ${theme.colors.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: theme.colors.textSecondary,
                    position: 'relative',
                    cursor: 'pointer',
                  }}
                >
                  <Icon name="bell" size={16} stroke />
                  {notifications.unread > 0 && (
                    <span style={{
                      position: 'absolute', top: 6, right: 6,
                      width: 7, height: 7, borderRadius: '50%',
                      background: theme.colors.warm,
                      border: `2px solid ${theme.colors.bg}`,
                      boxShadow: `0 0 8px ${theme.colors.warm}`,
                    }} />
                  )}
                </button>

                {showNotifs && (
                  <div className="slide-up" style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                    width: 380, maxHeight: 480, overflowY: 'auto',
                    background: theme.colors.bgSecondary,
                    border: `1px solid ${theme.colors.borderLight}`,
                    borderRadius: 12,
                    boxShadow: theme.shadows.lg,
                    zIndex: 200,
                  }}>
                    <div style={{ padding: '14px 18px', borderBottom: `1px solid ${theme.colors.border}` }}>
                      <div className="display" style={{ fontSize: 17, color: theme.colors.text }}>Notificacoes</div>
                    </div>
                    {notifications.notifications.length === 0 ? (
                      <div style={{ padding: 32, textAlign: 'center', color: theme.colors.textMuted, fontSize: 13 }}>
                        Nenhuma notificacao
                      </div>
                    ) : notifications.notifications.slice(0, 12).map(n => (
                      <NotifItem key={n.id} n={n} setNotifications={setNotifications} setUser={setUser} />
                    ))}
                  </div>
                )}
              </div>
          </div>
        </header>

        {/* Subscription banner for gestors */}
        {subscription && user?.role === 'gestor' && (() => {
          const s = subscription
          if (s.status === 'trial') {
            const daysLeft = s.trial_ends_at ? Math.max(0, Math.ceil((new Date(s.trial_ends_at) - new Date()) / 86400000)) : 0
            return (
              <div style={{
                padding: '10px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'rgba(127, 219, 255, 0.08)', borderBottom: `1px solid rgba(127, 219, 255, 0.15)`,
                fontSize: 13,
              }}>
                <span style={{ color: theme.colors.primary }}>
                  ⏱ Periodo de teste: <strong>{daysLeft} dias restantes</strong>
                </span>
                <span style={{ color: theme.colors.textMuted, fontSize: 12 }}>
                  Contate o suporte para ativar sua assinatura
                </span>
              </div>
            )
          }
          if (s.status === 'past_due') {
            return (
              <div style={{
                padding: '10px 28px', display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(217, 183, 112, 0.08)', borderBottom: `1px solid rgba(217, 183, 112, 0.15)`,
                fontSize: 13, color: theme.colors.warning,
              }}>
                ⚠ Pagamento pendente. Regularize sua assinatura para evitar interrupcoes.
              </div>
            )
          }
          return null
        })()}

        {/* Page content */}
        <main style={{ flex: 1, padding: '24px 20px 48px', overflowY: 'auto' }}>
          <Outlet />
        </main>
      </div>

      {/* Cmd+K palette */}
      {searchOpen && (
        <div className="modal-backdrop" onClick={() => setSearchOpen(false)}>
          <div className="modal" style={{ width: 580 }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '18px 20px', borderBottom: `1px solid ${theme.colors.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="search" size={16} color={theme.colors.textFaint} />
              <input autoFocus placeholder="Buscar pedidos, clientes, editores..." style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                fontSize: 15, color: theme.colors.text,
              }} />
              <span style={{ fontFamily: theme.fonts.mono, fontSize: 10, color: theme.colors.textFaint }}>esc</span>
            </div>
            <div style={{ padding: '8px 0', maxHeight: 360, overflowY: 'auto' }}>
              <div className="eyebrow" style={{ padding: '8px 20px 4px' }}>Atalhos</div>
              {NAV_ITEMS.map(item => (
                <div key={item.path}
                  onClick={() => { navigate(item.path); setSearchOpen(false) }}
                  className="row-hover"
                  style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <Icon name={item.icon} size={14} stroke color={theme.colors.textMuted} />
                  <span style={{ fontSize: 13.5, color: theme.colors.text }}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
    </SidebarContext.Provider>
  )
}

// Extracted notification item for reuse
function NotifItem({ n, setNotifications, setUser }) {
  return (
    <div style={{
      padding: '12px 18px',
      borderBottom: `1px solid ${theme.colors.borderSoft}`,
      display: 'flex', gap: 12,
      background: n.read ? 'transparent' : 'rgba(127, 219, 255, 0.03)',
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: n.read ? 'transparent' : n.type === 'team_invite' ? theme.colors.warm : theme.colors.primary,
        marginTop: 7, flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: theme.colors.text }}>{n.title}</div>
        <div style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 2 }}>{n.message}</div>
        {n.type === 'team_invite' && n.reference_type === 'team_invite' && !n.read && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={async (e) => {
                e.stopPropagation()
                try {
                  await api.team.acceptInvite(n.reference_id)
                  const d = await api.notifications.get()
                  setNotifications(d)
                  const me = await api.auth.me()
                  if (setUser) setUser(me)
                } catch (err) { alert(err.message) }
              }}
              style={{
                padding: '5px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                background: theme.colors.primary, color: theme.colors.bg,
              }}
            >
              Aceitar
            </button>
            <button
              onClick={async (e) => {
                e.stopPropagation()
                try {
                  await api.team.declineInvite(n.reference_id)
                  const d = await api.notifications.get()
                  setNotifications(d)
                } catch (err) { alert(err.message) }
              }}
              style={{
                padding: '5px 14px', fontSize: 12, fontWeight: 500, borderRadius: 6,
                background: theme.colors.surfaceHover, color: theme.colors.textMuted,
                border: `1px solid ${theme.colors.border}`,
              }}
            >
              Recusar
            </button>
          </div>
        )}
        <div className="eyebrow" style={{ marginTop: 6 }}>
          {new Date(n.created_at).toLocaleString('pt-BR')}
        </div>
      </div>
    </div>
  )
}

function SidebarLink({ item, collapsed }) {
  return (
    <NavLink
      to={item.path}
      end={item.end}
      title={collapsed ? item.label : undefined}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: 12,
        padding: collapsed ? '8px' : '8px 12px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: 8,
        color: isActive ? theme.colors.text : theme.colors.textMuted,
        background: isActive ? theme.colors.surfaceHover : 'transparent',
        fontSize: 13.5,
        fontWeight: isActive ? 500 : 400,
        textDecoration: 'none',
        position: 'relative',
        transition: 'background 0.12s, color 0.12s',
      })}
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed && (
            <span style={{
              position: 'absolute', left: collapsed ? -8 : -14, top: '50%', transform: 'translateY(-50%)',
              width: 2, height: 18, background: theme.colors.primary, borderRadius: 2,
            }} />
          )}
          <Icon name={item.icon} size={16} stroke color={isActive ? theme.colors.primary : 'currentColor'} />
          {!collapsed && <span>{item.label}</span>}
        </>
      )}
    </NavLink>
  )
}
