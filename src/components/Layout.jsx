// src/components/Layout.jsx — sidebar colapsavel + topbar + notificacoes
import { useState, useEffect, useRef, Fragment, createContext, useContext } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api'
import theme from '../styles/theme'
import { Icon, Avatar, LogoMark } from './ui'

// Context to share sidebar state with child pages
export const SidebarContext = createContext({ collapsed: false })
export function useSidebar() { return useContext(SidebarContext) }

const ALL_NAV_ITEMS = [
  { path: '/', label: 'Panorama',      icon: 'dashboard', roles: ['gestor', 'editor', 'cliente'], end: true },
  { path: '/board', label: 'Mapa',     icon: 'film', roles: ['editor'] },
  { path: '/clients', label: 'Clientes', icon: 'clients', roles: ['gestor'] },
  { path: '/team', label: 'Equipe',      icon: 'team', roles: ['gestor'] },
  { path: '/financial', label: 'Financeiro', icon: 'financial', roles: ['gestor'] },
  { path: '/settings', label: 'Configuracoes', icon: 'settings', roles: ['gestor', 'editor', 'cliente'] },
]

const PAGE_TITLES = {
  '/': 'Panorama',
  '/board': 'Mapa',
  '/clients': 'Clientes',
  '/team': 'Equipe',
  '/financial': 'Financeiro',
  '/settings': 'Configuracoes',
}

const SIDEBAR_WIDTH = 232
const SIDEBAR_COLLAPSED_WIDTH = 62

export default function Layout() {
  const { user, logout, setUser } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState({ notifications: [], unread: 0 })
  const [showNotifs, setShowNotifs] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const notifRef = useRef(null)
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('nexus_sidebar_collapsed') === '1' } catch { return false }
  })

  const NAV_ITEMS = ALL_NAV_ITEMS.filter(item => item.roles.includes(user?.role))

  function toggleSidebar() {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('nexus_sidebar_collapsed', next ? '1' : '0') } catch {}
      return next
    })
  }

  useEffect(() => {
    if (user?.role === 'cliente') return
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
      if (e.key === 'Escape') setSearchOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const currentTitle =
    PAGE_TITLES[location.pathname] ||
    (location.pathname.startsWith('/clients/') ? 'Cliente' : '')

  const sidebarW = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH

  return (
    <SidebarContext.Provider value={{ collapsed }}>
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
          <button onClick={() => navigate('/')} style={{
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
          {NAV_ITEMS.slice(0, NAV_ITEMS.length > 4 ? 4 : NAV_ITEMS.length).map(item => (
            <SidebarLink key={item.path} item={item} collapsed={collapsed} />
          ))}

          {NAV_ITEMS.length > 4 && (
            <>
              {!collapsed && <div className="eyebrow" style={{ padding: '20px 12px 8px' }}>Conta</div>}
              {collapsed && <div style={{ height: 16 }} />}
              {NAV_ITEMS.slice(4).map(item => (
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

            {user?.role !== 'cliente' && (
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
                      <div key={n.id} style={{
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
                          {/* Team invite action buttons */}
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
                                  cursor: 'pointer', border: 'none',
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
                                  cursor: 'pointer', border: `1px solid ${theme.colors.border}`,
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
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, padding: '24px 28px 48px', overflowY: 'auto' }}>
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
