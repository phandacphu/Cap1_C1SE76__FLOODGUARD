import { Icon } from "../ui/Icon";
import { formatClock, useClock } from "./useClock";

interface AdminHeaderProps {
  /** Number of currently active flood alerts (shown on the bell). */
  alertCount?: number;
  /** Current page name in the breadcrumb (defaults to the dashboard). */
  title?: string;
}

/** Admin top bar: breadcrumb, 24/7 status, search, clock, bell. */
export function AdminHeader({ alertCount, title = "Tổng quan" }: AdminHeaderProps) {
  const now = useClock();

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
        <div
          className="relative rounded-lg p-2 text-muted"
          title={alertCount === undefined ? "Thông báo" : `${alertCount} cảnh báo đang hiệu lực`}
        >
          <Icon name="bell" className="h-5 w-5" />
          {alertCount !== undefined && alertCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-sos px-1 font-mono text-[10px] font-bold text-white">
              {alertCount}
            </span>
          )}
        </div>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full bg-water/20 text-water"
          title="Tài khoản quản trị"
        >
          <Icon name="user" className="h-5 w-5" />
        </div>
      </div>
    </>
  );
}