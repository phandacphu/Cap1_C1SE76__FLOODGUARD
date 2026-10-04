import { Navigate, Route, Routes } from 'react-router-dom'
import { HOME_BY_ROLE, ROLES } from './constants/roles'
import { useAuth } from './context/AuthContext'
import AdminDashboardPage from './pages/AdminDashboardPage'
import ForbiddenPage from './pages/ForbiddenPage'
import LoginPage from './pages/LoginPage'
import RescueDashboardPage from './pages/RescueDashboardPage'
import ProtectedRoute from './routes/ProtectedRoute'

function HomeRedirect() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={HOME_BY_ROLE[user.role] ?? '/403'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/403" element={<ForbiddenPage />} />

      {/* Admin-only area. Add more admin pages as children here. */}
      <Route element={<ProtectedRoute allow={[ROLES.ADMIN]} />}>
        <Route path="/admin" element={<AdminDashboardPage />} />
      </Route>

      {/* Rescue Staff area. Add more rescue pages as children here. */}
      <Route element={<ProtectedRoute allow={[ROLES.RESCUE_STAFF]} />}>
        <Route path="/rescue" element={<RescueDashboardPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
