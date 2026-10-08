import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  AuthError,
  FORBIDDEN_MESSAGE,
  homePathForRole,
  isWebRole,
  loginRequest,
} from '../api/authApi'
import logo from '../assets/floodguard-logo.png'

/**
 * CCF-38: UI khớp Figma frame "Đăng nhập - FLOODGUARD".
 * CCF-39: gọi POST /api/auth/login (xem src/api/authApi.ts), lưu phiên bằng AuthContext của nhóm.
 */

const ICON = {
  fill: 'none',
  viewBox: '0 0 24 24',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const FEATURES = [
  {
    title: 'Bản đồ vùng ngập',
    desc: 'Mô phỏng đo đạc thủy văn',
    tag: 'Giám sát 24/7',
    iconClass: 'text-water',
    tagClass: 'bg-water/10 text-water',
    icon: (
      <>
        <path d="M2 14c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" />
        <path d="M2 19c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" />
        <path d="M4 10c2-4 5-6 9-6 3 0 4 2 4 4" />
      </>
    ),
  },
  {
    title: 'Quản lý SOS',
    desc: 'Xử lý tín hiệu khẩn cấp',
    tag: 'Tác chiến tức thì',
    iconClass: 'text-sos',
    tagClass: 'bg-border/50 text-sos',
    icon: <path strokeWidth={3} d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" />,
  },
  {
    title: 'Điểm sơ tán',
    desc: 'Hành lang di dời dân cư',
    tag: 'Tuyến an toàn',
    iconClass: 'text-safe',
    tagClass: 'bg-safe/10 text-safe',
    icon: <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z" />,
  },
]

export function Login() {
  const { user, isAuthenticated, login } = useAuth()
  const navigate = useNavigate()

  // --- STATE ---
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [slow, setSlow] = useState(false)
  const [error, setError] = useState('')

  // Đã đăng nhập: chuyển thẳng tới dashboard đúng role.
  if (isAuthenticated && user) return <Navigate to={homePathForRole(user.role)} replace />

  // --- HANDLER ---
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (loading) return
    setError('')

    if (!email.trim() || !password) {
      setError('Vui lòng nhập email và mật khẩu')
      return
    }

    setLoading(true)
    // Máy chủ demo (Render free) có thể cần ~1 phút để khởi động lại.
    const slowTimer = window.setTimeout(() => setSlow(true), 6000)
    try {
      const result = await loginRequest(email.trim(), password)

      // Web chỉ dành cho Admin và Rescue Staff: không lưu phiên của tài khoản khác.
      if (!isWebRole(result.user.role)) {
        setError(FORBIDDEN_MESSAGE)
        return
      }

      login(result.token, result.user)
      navigate(homePathForRole(result.user.role), { replace: true })
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Đã xảy ra lỗi. Vui lòng thử lại.')
    } finally {
      window.clearTimeout(slowTimer)
      setSlow(false)
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-screen bg-bg text-text lg:grid-cols-2">
      {/* ================= LEFT: BRANDING ================= */}
      <section className="relative hidden flex-col justify-center gap-6 overflow-hidden p-12 lg:flex xl:px-24">
        {/* Nét cong trang trí */}
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 600 800"
          preserveAspectRatio="none"
          fill="none"
        >
          <path d="M215 0C190 120 230 260 245 380S230 640 250 800" stroke="#22d3ee" strokeOpacity=".35" strokeWidth="2" />
          <path d="M210 0C185 120 225 260 240 380S225 640 245 800" stroke="#22d3ee" strokeOpacity=".12" strokeWidth="8" />
          <path d="M240 260C330 300 420 330 600 420" stroke="#4ade80" strokeOpacity=".4" strokeWidth="1" strokeDasharray="4 5" />
        </svg>

        <div className="relative z-10 flex max-w-xl flex-col gap-6">
          {/* Status bar (2 dòng) */}
          <div className="space-y-1.5 rounded-lg bg-card px-4 py-3 font-mono text-[11px] tracking-widest">
            <p className="flex items-center gap-2 text-safe">
              <span className="h-2 w-2 rounded-full bg-safe" />
              TRẠM VỆ TINH HYD-04
            </p>
            <p className="text-muted">
              LAT: 16.0544° N <span className="mx-2 opacity-40">|</span> LON: 108.2022° E{' '}
              <span className="mx-2 opacity-40">|</span>
              <span className="text-water">MỰC NƯỚC: +3.82m</span>
            </p>
          </div>

          {/* Logo + brand */}
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-water/30 bg-card shadow-[0_0_20px_rgba(34,211,238,0.25)]">
              <img src={logo} alt="FloodGuard" className="h-11 w-11 object-contain" />
            </div>
            <div>
              <h1 className="text-4xl font-bold leading-none tracking-wide">
                FLOOD<span className="ml-1 text-water">GUARD</span>
              </h1>
              <p className="mt-1.5 text-sm text-water">HỆ THỐNG CẢNH BÁO LŨ &amp; HỖ TRỢ CỨU HỘ</p>
            </div>
          </div>

          <p className="text-base leading-relaxed text-muted">
            Nền tảng điều phối chỉ huy tác chiến, định vị điểm ngập lụt và hỗ trợ lực lượng cứu nạn khẩn cấp thời gian thực trên toàn lưu vực.
          </p>

          {/* Feature cards */}
          <div className="mt-2 space-y-3">
            <p className="font-mono text-[11px] tracking-widest text-muted">CHỨC NĂNG CHỈ HUY TRỌNG YẾU</p>
            <div className="grid grid-cols-3 gap-3">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="flex flex-col gap-2 rounded-xl bg-card p-4 transition-colors hover:ring-1 hover:ring-water/40"
                >
                  <div className="flex items-start gap-2">
                    <svg {...ICON} className={`h-6 w-6 shrink-0 ${f.iconClass}`}>
                      {f.icon}
                    </svg>
                    <span className={`rounded px-2 py-0.5 font-mono text-[11px] leading-tight ${f.tagClass}`}>
                      {f.tag}
                    </span>
                  </div>
                  <h4 className="mt-1 text-sm font-semibold">{f.title}</h4>
                  <p className="text-xs leading-snug text-muted">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom chips */}
          <div className="mt-4 flex flex-wrap items-center gap-4 font-mono text-[11px] tracking-widest">
            <span className="flex items-center gap-2 rounded-md bg-water/10 px-3 py-1.5 text-water">
              <svg {...ICON} className="h-3.5 w-3.5">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              DỮ LIỆU MÔ PHỎNG CHIẾN LƯỢC
            </span>
            <span className="flex items-center gap-2 text-muted">
              <span className="h-2 w-2 rounded-full bg-safe" />
              TRẠM TRUNG TÂM HOẠT ĐỘNG BÌNH THƯỜNG
            </span>
          </div>
        </div>
      </section>

      {/* ================= RIGHT: FORM ================= */}
      <section className="flex flex-col items-center justify-center gap-6 bg-card/40 p-8">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md space-y-5 rounded-2xl bg-card p-10 shadow-2xl"
          noValidate
        >
          {/* Header */}
          <div className="space-y-3">
            <span className="inline-flex items-center gap-2 rounded bg-bg/60 px-2.5 py-1.5 font-mono text-[11px] tracking-widest text-water">
              <svg {...ICON} className="h-3.5 w-3.5">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 018 0v3" />
              </svg>
              CỔNG TRUY CẬP ĐIỀU HÀNH TÁC CHIẾN
            </span>
            <h2 className="text-4xl font-bold">Đăng nhập</h2>
            <p className="text-sm leading-relaxed text-muted">
              Nhập thông tin tài khoản được cấp quyền để truy cập hệ thống chỉ huy cứu hộ.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div
              role="alert"
              className="flex items-center gap-3 rounded-lg bg-sos/15 px-4 py-3 text-sm text-sos"
            >
              <svg {...ICON} className="h-5 w-5 shrink-0">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4m0 4h.01" />
              </svg>
              <span className="flex-1">{error}</span>
              <button
                type="button"
                onClick={() => setError('')}
                aria-label="Đóng thông báo"
                className="shrink-0 opacity-70 hover:opacity-100"
              >
                <svg {...ICON} className="h-4 w-4">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          )}

          {/* Email */}
          <label className="block space-y-2">
            <span className="text-sm font-medium">Email công vụ</span>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-text">
                <svg {...ICON} className="h-5 w-5">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M3 7l9 6 9-6" />
                </svg>
              </div>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="canbo.cuuho@floodguard.gov.vn"
                className="w-full rounded-lg bg-bg py-3.5 pl-11 pr-3 text-sm outline-none ring-1 ring-transparent transition focus:ring-water"
              />
            </div>
          </label>

          {/* Password */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-sm font-medium">
                Mật khẩu
              </label>
              <a href="#" className="text-sm text-water underline-offset-2 hover:underline">
                Quên mật khẩu?
              </a>
            </div>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-text">
                <svg {...ICON} className="h-5 w-5">
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V8a4 4 0 018 0v3" />
                </svg>
              </div>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-lg bg-bg py-3.5 pl-11 pr-11 text-sm outline-none ring-1 ring-transparent transition focus:ring-water"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                className="absolute inset-y-0 right-3 flex items-center text-text/80 hover:text-text"
              >
                {showPassword ? (
                  <svg {...ICON} className="h-5 w-5">
                    <path d="M3 3l18 18" />
                    <path d="M10.6 6.1A9.8 9.8 0 0112 6c4.5 0 8.3 2.9 9.5 6a10 10 0 01-2.7 3.9M6.6 6.6A10 10 0 002.5 12c1.2 3.1 5 6 9.5 6 1.5 0 2.9-.3 4.1-.9" />
                    <path d="M9.9 9.9a3 3 0 004.2 4.2" />
                  </svg>
                ) : (
                  <svg {...ICON} className="h-5 w-5">
                    <path d="M2.5 12C3.8 8.4 7.5 6 12 6s8.2 2.4 9.5 6c-1.3 3.6-5 6-9.5 6s-8.2-2.4-9.5-6z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Remember (checkbox tô cyan) */}
          <label className="flex cursor-pointer items-center gap-3 text-sm text-muted transition-colors hover:text-text">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="peer sr-only"
            />
            <span className="flex h-5 w-5 items-center justify-center rounded bg-bg ring-1 ring-border transition peer-checked:bg-water peer-checked:ring-water peer-focus-visible:ring-2 peer-focus-visible:ring-water">
              <svg {...ICON} strokeWidth={3} className={`h-3.5 w-3.5 text-bg ${remember ? 'opacity-100' : 'opacity-0'}`}>
                <path d="M5 12l5 5 9-10" />
              </svg>
            </span>
            Ghi nhớ phiên làm việc trên thiết bị này
          </label>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-safe py-4 font-bold tracking-wide text-bg shadow-[0_8px_24px_rgba(74,222,128,0.25)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              'ĐANG ĐĂNG NHẬP…'
            ) : (
              <>
                <svg {...ICON} className="h-5 w-5">
                  <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
                ĐĂNG NHẬP HỆ THỐNG
              </>
            )}
          </button>

          {loading && slow && (
            <p role="status" className="text-center text-xs text-muted">
              Máy chủ demo đang khởi động, vui lòng chờ khoảng 1 phút…
            </p>
          )}

          {/* Footer */}
          <div className="space-y-3 pt-2">
            <p className="flex items-center gap-2 text-sm text-muted">
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-water" fill="currentColor">
                <path d="M12 2l8 3v7c0 4.6-3.4 8.4-8 10-4.6-1.6-8-5.4-8-10V5l8-3z" opacity=".9" />
                <path d="M12 2v20c4.6-1.6 8-5.4 8-10V5l-8-3z" fill="#fff" opacity=".35" />
              </svg>
              Chỉ dành cho Lực lượng cứu nạn &amp; Quản trị viên điều phối
            </p>
            <p className="flex flex-wrap items-center gap-2 font-mono text-[11px] tracking-wider text-muted">
              <span className="rounded bg-border/40 px-2 py-1">XÁC THỰC 2FA BẮT BUỘC</span>
              <span className="opacity-50">•</span>
              <span className="rounded bg-border/40 px-2 py-1">MÃ HÓA CẤP BỘ CỨU NẠN</span>
            </p>
          </div>
        </form>

        <p className="font-mono text-[11px] tracking-widest text-muted">
          FLOODGUARD C4I SECURE GATEWAY v3.2.8 // VIETNAM
        </p>
      </section>
    </div>
  )
}
