import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { logoutRequest } from "../../../api/authApi";
import { Icon } from "../../../components/ui/Icon";
import { useAuth } from "../../../context/AuthContext";
import { AdminUiPreview, PreviewPanel, previewSecondaryButton } from "../ui-preview/AdminUiPreview";

type SettingsTab = "display" | "notifications" | "security";
const linkClass = "inline-flex items-center rounded-lg border border-border px-3 py-2 text-sm font-medium text-water transition hover:border-water/50 hover:bg-water/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-water";

function SettingsLink({ title, description, to, action }: { title: string; description: string; to: string; action: string }) {
  return <div className="flex flex-wrap items-center justify-between gap-4 py-5">
    <div><h3 className="text-sm font-semibold text-white">{title}</h3><p className="mt-1 text-xs text-slate-400">{description}</p></div>
    <Link className={linkClass} to={to}>{action}</Link>
  </div>;
}

export default function AdminSettingsUiScreen() {
  const [tab, setTab] = useState<SettingsTab>("display");
  const [signingOut, setSigningOut] = useState(false);
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      if (token) await logoutRequest(token);
    } finally {
      logout();
      navigate("/login", { replace: true });
    }
  }

  return <AdminUiPreview preview={false} title="Cài đặt hệ thống" subtitle="Thông tin hiển thị và các tùy chọn quản trị.">
    <div className="grid items-start gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
      <nav aria-label="Nhóm cài đặt" className="space-y-2 rounded-2xl border border-border bg-card p-3">
        {([
          ["display", "Giao diện", "settings"],
          ["notifications", "Thông báo", "bell"],
          ["security", "Bảo mật & tài khoản", "shield"],
        ] as const).map(([value, label, icon]) => <button key={value} type="button" onClick={() => setTab(value)}
          aria-current={tab === value ? "page" : undefined}
          className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-medium transition ${tab === value ? "bg-water/15 text-water" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
          <Icon name={icon} className="h-4 w-4" /> {label}
        </button>)}
      </nav>

      {tab === "display" && <PreviewPanel title="Giao diện">
        <dl className="divide-y divide-border/80 px-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 py-5"><dt className="text-sm font-semibold text-white">Ngôn ngữ</dt><dd className="text-sm text-slate-300">Tiếng Việt</dd></div>
          <div className="flex flex-wrap items-center justify-between gap-3 py-5"><dt className="text-sm font-semibold text-white">Múi giờ</dt><dd className="text-sm text-slate-300">Việt Nam (UTC+7)</dd></div>
        </dl>
      </PreviewPanel>}

      {tab === "notifications" && <PreviewPanel title="Thông báo và cảnh báo">
        <div className="divide-y divide-border/80 px-5 sm:px-6">
          <SettingsLink title="Yêu cầu SOS" description="Theo dõi các yêu cầu cứu hộ." to="/admin/sos" action="Xem SOS" />
          <SettingsLink title="Cảnh báo mưa lớn và nguy cơ ngập" description="Quản lý các bản tin cảnh báo." to="/admin/flood-warnings" action="Xem cảnh báo" />
        </div>
      </PreviewPanel>}

      {tab === "security" && <PreviewPanel title="Bảo mật & tài khoản">
        <div className="divide-y divide-border/80 px-5 sm:px-6">
          <div className="space-y-3 py-5">
            <h3 className="text-sm font-semibold text-white">Tài khoản đang đăng nhập</h3>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-slate-400">Họ tên</dt><dd className="mt-1 break-words text-white">{user?.fullName || "—"}</dd></div>
              <div><dt className="text-xs text-slate-400">Email</dt><dd className="mt-1 break-all text-white">{user?.email || "—"}</dd></div>
              <div><dt className="text-xs text-slate-400">Vai trò</dt><dd className="mt-1 text-white">{user?.role === "ADMIN" ? "Quản trị viên" : "—"}</dd></div>
              <div><dt className="text-xs text-slate-400">Mã tài khoản</dt><dd className="mt-1 break-all text-white">{user?.id || "—"}</dd></div>
            </dl>
          </div>
          <SettingsLink title="Quản lý người dùng" description="Xem tài khoản và quyền truy cập." to="/admin/users" action="Mở quản lý" />
          <div className="flex flex-wrap items-center justify-between gap-3 py-5">
            <div><h3 className="text-sm font-semibold text-white">Đăng xuất</h3></div>
            <button type="button" disabled={signingOut} onClick={() => void signOut()} className={previewSecondaryButton}>{signingOut ? "Đang đăng xuất…" : "Đăng xuất"}</button>
          </div>
        </div>
      </PreviewPanel>}
    </div>
  </AdminUiPreview>;
}
