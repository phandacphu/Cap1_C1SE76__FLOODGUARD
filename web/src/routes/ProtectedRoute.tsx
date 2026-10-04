import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../constants/roles'

/** Blocks a route group unless the user is logged in with one of the allowed roles. */
export default function ProtectedRoute({ allow }: { allow: Role[] }) {
  const { user } = useAuth()

  if (!user) return <Navigate to="/login" replace />
  if (!allow.includes(user.role)) return <Navigate to="/403" replace />

  return <Outlet />
}
