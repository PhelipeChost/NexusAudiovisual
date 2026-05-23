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
import AdminDashboard from './pages/AdminDashboard'
import LandingPage from './pages/LandingPage'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  // If token exists but user hasn't loaded yet (transient state), wait instead of redirecting
  const hasToken = !!localStorage.getItem('nexus_token')
  if (!user && hasToken) return null
  if (!user) return <Navigate to="/" />
  return children
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/" />
  if (user.role !== 'admin') return <Navigate to="/dashboard" />
  return children
}

function RoleDashboard() {
  const { user } = useAuth()
  if (user?.role === 'admin') return <AdminDashboard />
  if (user?.role === 'cliente') return <ClientDashboard />
  if (user?.role === 'editor') return <EditorDashboard />
  return <Dashboard />
}

export default function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0a0f' }}>
        <div style={{ width: 40, height: 40, border: '3px solid #232340', borderTopColor: '#6c5ce7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <Routes>
      {/* Landing page — always accessible (even when logged in) */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/landing" element={<Navigate to="/" />} />

      {/* Auth routes */}
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/invite/:token" element={<Invite />} />

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
        <Route path="admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* Catch-all: go to landing */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}
