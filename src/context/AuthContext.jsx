import { createContext, useContext, useState, useEffect } from 'react'
import api from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('nexus_token')
    if (token) {
      console.log('[Auth] Token found, calling /auth/me...')
      api.auth.me()
        .then(u => { console.log('[Auth] /auth/me success:', u?.email, u?.role); setUser(u) })
        .catch(err => { console.error('[Auth] /auth/me FAILED:', err.message); localStorage.removeItem('nexus_token') })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  async function login(email, password) {
    const data = await api.auth.login(email, password)
    localStorage.setItem('nexus_token', data.token)
    setUser(data.user)
    return data
  }

  async function register(formData) {
    const data = await api.auth.register(formData)
    localStorage.setItem('nexus_token', data.token)
    setUser(data.user)
    return data
  }

  function logout() {
    localStorage.removeItem('nexus_token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
