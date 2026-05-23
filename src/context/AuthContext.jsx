import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react'
import api from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUserRaw] = useState(null)
  const [loading, setLoading] = useState(true)

  // Never allow undefined — coerce to null
  const setUser = useCallback((u) => setUserRaw(u ?? null), [])

  useEffect(() => {
    const token = localStorage.getItem('nexus_token')
    if (token) {
      api.auth.me()
        .then(data => setUser(data))
        .catch(() => localStorage.removeItem('nexus_token'))
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [setUser])

  const login = useCallback(async (email, password) => {
    const data = await api.auth.login(email, password)
    localStorage.setItem('nexus_token', data.token)
    setUser(data.user)
    return data
  }, [setUser])

  const register = useCallback(async (formData) => {
    const data = await api.auth.register(formData)
    localStorage.setItem('nexus_token', data.token)
    setUser(data.user)
    return data
  }, [setUser])

  const logout = useCallback(() => {
    localStorage.removeItem('nexus_token')
    setUser(null)
  }, [setUser])

  // Memoize context value — only changes when user or loading actually change
  // This prevents cascading re-renders through the entire component tree
  const value = useMemo(() => ({
    user, setUser, loading, login, register, logout,
  }), [user, setUser, loading, login, register, logout])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
