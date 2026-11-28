import { Icon } from "../ui/Icon";
import { formatClock, useClock } from "./useClock";
import { Link } from "react-router-dom";
import { useState } from "react";

interface AdminHeaderProps {
  /** Number of currently active flood alerts (shown on the bell). */
  alertCount?: number;
  /** Current page name in the breadcrumb (defaults to the dashboard). */
  title?: string;
}

/** Admin top bar: breadcrumb, 24/7 status, search, clock, bell. */
export function AdminHeader({ alertCount, title = "Tổng quan" }: AdminHeaderProps) {
  const now = useClock();
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  return (
    <>
      <nav
        aria-label="Đường dẫn"
        className="hidden min-w-0 items-center gap-2 text-sm text-muted md:flex"
      >
        <span className="truncate">Hệ thống Quản trị</span>
        <span>/</span>
        <span className="truncate font-medium text-text">{title}</span>
      </nav>

      <span className="hidden items-center gap-2 rounded-full border border-safe/40 bg-safe/10 px-3 py-1 font-mono text-[11px] tracking-wide text-safe xl:flex">
        <span className="h-2 w-2 rounded-full bg-safe" />
        HỆ THỐNG TRỰC BAN 24/7
      </span>

      <label className="relative ml-auto hidden max-w-sm flex-1 md:block">
        <span className="sr-only">Tìm kiếm</span>
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
          <Icon name="search" className="h-4 w-4" />
        </span>
        <input
          type="text"
          disabled
          title="Sắp ra mắt"
          placeholder="Tìm kiếm ca SOS, cảnh báo, nhân sự..."
          className="w-full cursor-not-allowed rounded-lg border border-border bg-card/60 py-2 pl-9 pr-3 text-sm text-muted placeholder:text-muted/70"
        />
      </label>

      <div className="ml-auto flex items-center gap-3 md:ml-0">
        <div className="hidden items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-1.5 font-mono text-sm sm:flex">
          <Icon name="clock" className="h-4 w-4 text-water" />
          <span>{formatClock(now)} ICT</span>
        </div>
        <div className="relative">
          <button type="button" aria-label="Mở thông báo" aria-expanded={notificationsOpen}
            aria-controls="admin-notifications" onClick={() => setNotificationsOpen((value) => !value)}
            className="relative rounded-lg p-2 text-muted hover:bg-card hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water">
            <Icon name="bell" className="h-5 w-5" />
            {alertCount !== undefined && alertCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-sos px-1 font-mono text-[10px] font-bold text-white">
                {alertCount}
              </span>
            )}
          </button>
          {notificationsOpen && <div id="admin-notifications" role="region" aria-label="Thông báo hệ thống"
            className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-border bg-card p-4 text-sm text-text shadow-xl">
            <h2 className="mb-2 font-semibold">Thông báo</h2>
            <p className="mb-3 text-xs text-muted">Chưa có danh sách thông báo riêng từ hệ thống. Bạn có thể kiểm tra các cảnh báo và yêu cầu SOS hiện tại.</p>
            <div className="flex flex-col gap-2">
              <Link to="/admin/flood-warnings" onClick={() => setNotificationsOpen(false)} className="text-water hover:underline">Xem cảnh báo lũ</Link>
              <Link to="/admin/sos" onClick={() => setNotificationsOpen(false)} className="text-water hover:underline">Xem yêu cầu SOS</Link>
            </div>
          </div>}
        </div>
        <Link
          to="/admin/profile"
          title="Hồ sơ quản trị viên"
          aria-label="Mở hồ sơ quản trị viên"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-water/20 text-water transition hover:bg-water/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water"
        >
          <Icon name="user" className="h-5 w-5" />
        </Link>
      </div>
    </>
  );
}
