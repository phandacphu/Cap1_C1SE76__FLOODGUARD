import { useAuth } from '../context/AuthContext'

// Placeholder: replace with the real Admin dashboard (Figma A1).
export default function AdminDashboardPage() {
  const { user, logout } = useAuth()
  return (
    <main className="space-y-4 p-8">
      <h1 className="text-2xl font-bold">Tổng quan hệ thống (Admin)</h1>
      <p className="text-muted">Xin chào, {user?.fullName ?? user?.email}</p>
      <button onClick={logout} className="rounded-lg border border-border px-4 py-2">
        Đăng xuất
      </button>
    </main>
  )
}
