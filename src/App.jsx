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

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  return user ? children : <Navigate to="/login" />
}

function RoleDashboard() {
  const { user } = useAuth()
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
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" /> : <Register />} />
      <Route path="/invite/:token" element={<Invite />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<RoleDashboard />} />
        <Route path="board" element={<EditorBoard />} />
        <Route path="clients" element={<Clients />} />
        <Route path="clients/:id" element={<ClientDetail />} />
        <Route path="team" element={<Team />} />
        <Route path="financial" element={<Financial />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="reports" element={<EditorReport />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
