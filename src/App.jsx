import React, { useRef } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import ClientDetail from './pages/ClientDetail'
import Team from './pages/Team'
import Financial from './pages/Financial'
import Settings from './pages/Settings'
import Invite from './pages/Invite'
import ClientDashboard from './pages/ClientDashboard'
import EditorDashboard from './pages/EditorDashboard'
import EditorBoard from './pages/EditorBoard'
import Calendar from './pages/Calendar'
import EditorReport from './pages/EditorReport'
import EditorFinancial from './pages/EditorFinancial'
import EditorMyReport from './pages/EditorMyReport'
import Contracts from './pages/Contracts'
import ContractSign from './pages/ContractSign'
import GovBRResult from './pages/GovBRResult'
import AdminDashboard from './pages/AdminDashboard'
import PersonalFinance from './pages/PersonalFinance'
import LandingPage from './pages/LandingPage'

// ProtectedRoute — resilient to transient auth-state glitches during navigation.
// Uses a ref to remember the last known user so a momentary undefined/null
// during a React re-render never triggers a redirect.
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const lastUserRef = useRef(user)

  // Keep the ref updated whenever we have a valid user
  if (user) lastUserRef.current = user

  if (loading) return null

  if (!user) {
    // Token still in storage → auth is resolving, wait
    if (localStorage.getItem('nexus_token')) return null
    // We had a user before but token is gone → explicit logout happened
    if (lastUserRef.current) {
      lastUserRef.current = null
      return <Navigate to="/" replace />
    }
    // Never authenticated → redirect to landing
    return <Navigate to="/" replace />
  }

  return children
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/" replace />
  if (user.role !== 'admin') return <Navigate to="/dashboard" replace />
  return children
}

function RoleDashboard() {
  const { user } = useAuth()
  if (user?.role === 'admin') return <AdminDashboard />
  if (user?.role === 'cliente') return <ClientDashboard />
  if (user?.role === 'editor') return <EditorDashboard />
  return <Dashboard />
}

// Login page — redirects to dashboard if already authenticated
function LoginRoute() {
  const { user, loading } = useAuth()
  if (loading) return null
  return user ? <Navigate to="/dashboard" replace /> : <Login />
}

// Memoized route tree — prevents the entire route tree from re-rendering
// when auth context changes (e.g. during navigation). Only React Router's
// own location changes trigger re-evaluation of routes inside here.
const AppRoutes = React.memo(function AppRoutes() {
  return (
    <Routes>
      {/* Landing page — always accessible */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/landing" element={<Navigate to="/" replace />} />

      {/* Auth routes */}
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/register" element={<Register />} />
      <Route path="/invite/:token" element={<Invite />} />
      <Route path="/assinar/:token" element={<ContractSign />} />
      <Route path="/govbr/resultado" element={<GovBRResult />} />

      {/* Protected app routes */}
      <Route path="/dashboard" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<RoleDashboard />} />
        <Route path="board" element={<EditorBoard />} />
        <Route path="clients" element={<Clients />} />
        <Route path="clients/:id" element={<ClientDetail />} />
        <Route path="team" element={<Team />} />
        <Route path="financial" element={<Financial />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="reports" element={<EditorReport />} />
        <Route path="contracts" element={<Contracts />} />
        <Route path="personal-finance" element={<PersonalFinance />} />
        <Route path="editor-financial" element={<EditorFinancial />} />
        <Route path="editor-report" element={<EditorMyReport />} />
        <Route path="admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* Catch-all: go to landing */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
})

export default function App() {
  const { loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0a0f' }}>
        <div style={{ width: 40, height: 40, border: '3px solid #232340', borderTopColor: '#6c5ce7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return <AppRoutes />
}
