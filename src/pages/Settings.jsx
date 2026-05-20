// src/pages/Settings.jsx — configuracoes da agencia
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api'
import theme from '../styles/theme'
import resizeImage from '../utils/resizeImage'
import {
  Icon, LogoMark, Spinner, Field,
  inputStyle, btnPrimary, btnSoft, panelStyle,
} from '../components/ui'

const tabs = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'columns', label: 'Etapas do kanban' },
  { id: 'account', label: 'Sua conta' },
]

export default function Settings() {
  const [tab, setTab] = useState('workspace')

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 32, maxWidth: 1100 }}>
      <aside>
        <div className="eyebrow" style={{ marginBottom: 12, padding: '0 8px' }}>configuracoes</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '8px 12px', borderRadius: 6, textAlign: 'left', fontSize: 13,
              color: tab === t.id ? theme.colors.text : theme.colors.textMuted,
              background: tab === t.id ? theme.colors.surfaceHover : 'transparent',
            }}>{t.label}</button>
          ))}
        </div>
      </aside>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {tab === 'workspace' && <WorkspaceSettings />}
        {tab === 'columns' && <ColumnsSettings />}
        {tab === 'account' && <AccountSettings />}
      </div>
    </div>
  )
}

function WorkspaceSettings() {
  const { user, setUser } = useAuth()
  const [settings, setSettings] = useState(null)
  const [saving, setSaving] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const logoRef = useRef(null)

  useEffect(() => {
    api.settings.get().then(data => {
      setSettings(data)
      setCompanyName(data?.name || '')
    }).catch(console.error)
  }, [])

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setSaving(true)
      const dataUrl = await resizeImage(file, 256, 0.85)
      const result = await api.settings.update({ logo: dataUrl })
      setSettings(result)
      const me = await api.auth.me()
      if (setUser) setUser(me)
    } catch (err) { alert(err.message) } finally { setSaving(false) }
  }

  async function handleSaveName() {
    if (!companyName.trim() || companyName === settings?.name) return
    try {
      setSaving(true)
      const result = await api.settings.update({ name: companyName })
      setSettings(result)
      const me = await api.auth.me()
      if (setUser) setUser(me)
    } catch (err) { alert(err.message) } finally { setSaving(false) }
  }

  return (
    <>
      <div>
        <h2 className="display" style={{ fontSize: 26, color: theme.colors.text, margin: 0 }}>Workspace</h2>
        <p style={{ fontSize: 13, color: theme.colors.textMuted, marginTop: 4 }}>
          Identidade da sua agencia dentro do Nexus.
        </p>
      </div>

      <Section title="Identidade">
        <Row label="Nome da agencia">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="nx-input"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={handleSaveName} style={btnSoft} disabled={saving}>
              Salvar
            </button>
          </div>
        </Row>
        <Row label="Logo" hint="PNG ou JPG, quadrado, max 2MB.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 12,
              background: theme.colors.bg, border: `1px solid ${theme.colors.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}>
              {settings?.logo ? (
                <img src={settings.logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <LogoMark size={40} />
              )}
            </div>
            <input
              ref={logoRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={handleLogoUpload}
              style={{ display: 'none' }}
            />
            <button onClick={() => logoRef.current?.click()} style={btnSoft} disabled={saving}>
              {saving ? 'Enviando...' : 'Trocar logo'}
            </button>
            {settings?.logo && (
              <button
                onClick={async () => {
                  try {
                    setSaving(true)
                    const result = await api.settings.update({ logo: '' })
                    setSettings(result)
                  } catch (err) { alert(err.message) } finally { setSaving(false) }
                }}
                style={{ ...btnSoft, color: theme.colors.danger, borderColor: 'rgba(244,115,131,0.3)' }}
              >
                Remover
              </button>
            )}
          </div>
        </Row>
      </Section>
    </>
  )
}

function ColumnsSettings() {
  const [clients, setClients] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [columns, setColumns] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.clients.list().then(setClients).catch(console.error)
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
    api.clients.getColumns(selectedId)
      .then(setColumns)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedId])

  return (
    <>
      <div>
        <h2 className="display" style={{ fontSize: 26, color: theme.colors.text, margin: 0 }}>Etapas do kanban</h2>
        <p style={{ fontSize: 13, color: theme.colors.textMuted, marginTop: 4 }}>
          Personalize o fluxo de producao para cada cliente.
        </p>
      </div>

      <div style={{ ...panelStyle, padding: 24 }}>
        <Field label="Cliente">
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer', maxWidth: 320 }}>
            <option value="">Selecione...</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>

        {loading ? <Spinner /> : columns.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
            {columns.map((col, i) => (
              <div key={col.id} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 14px',
                background: theme.colors.bg,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: 10,
              }}>
                <div className="mono" style={{ fontSize: 11, color: theme.colors.textFaint, width: 22 }}>
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: col.color, boxShadow: `0 0 8px ${col.color}88` }} />
                <span style={{ fontSize: 14, color: theme.colors.text, flex: 1 }}>{col.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function AccountSettings() {
  const { user, logout } = useAuth()
  return (
    <>
      <div>
        <h2 className="display" style={{ fontSize: 26, color: theme.colors.text, margin: 0 }}>Sua conta</h2>
        <p style={{ fontSize: 13, color: theme.colors.textMuted, marginTop: 4 }}>
          Informacoes pessoais e sessao.
        </p>
      </div>

      <Section title="Perfil">
        <Row label="Nome">
          <input className="nx-input" defaultValue={user?.name} style={inputStyle} />
        </Row>
        <Row label="Email">
          <input className="nx-input" defaultValue={user?.email} readOnly style={{ ...inputStyle, opacity: 0.7 }} />
        </Row>
        <Row label="Papel">
          <span style={{ fontSize: 13, color: theme.colors.text, textTransform: 'capitalize' }}>{user?.role}</span>
        </Row>
      </Section>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={logout} style={{
          ...btnSoft, color: theme.colors.danger,
          borderColor: 'rgba(244, 115, 131, 0.3)',
        }}>
          <Icon name="logout" size={13} stroke />
          Encerrar sessao
        </button>
      </div>
    </>
  )
}

function Section({ title, subtitle, children }) {
  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h3 className="display" style={{ fontSize: 18, color: theme.colors.text, margin: 0 }}>{title}</h3>
        {subtitle && <p style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 2 }}>{subtitle}</p>}
      </div>
      <div style={{ ...panelStyle, padding: '4px 24px', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  )
}

function Row({ label, hint, children }) {
  return (
    <div style={{
      padding: '18px 0',
      borderBottom: `1px solid ${theme.colors.borderSoft}`,
      display: 'grid', gridTemplateColumns: '180px 1fr', gap: 24, alignItems: 'start',
    }}>
      <div>
        <div style={{ fontSize: 13, color: theme.colors.text }}>{label}</div>
        {hint && <div style={{ fontSize: 11.5, color: theme.colors.textMuted, marginTop: 3, lineHeight: 1.4 }}>{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  )
}
