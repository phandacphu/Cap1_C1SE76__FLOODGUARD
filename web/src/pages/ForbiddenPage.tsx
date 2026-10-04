import { Link } from 'react-router-dom'

// Placeholder for the 403 screen (Figma S3).
export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="font-mono text-6xl font-bold text-sos">403</p>
      <h1 className="text-xl font-semibold">Bạn không có quyền truy cập chức năng này</h1>
      <Link to="/" className="rounded-lg bg-safe px-4 py-2 font-semibold text-bg">
        Về trang tổng quan
      </Link>
    </main>
  )
}
