import { useAuth } from "../../context/AuthContext";
import { Icon } from "../ui/Icon";
import { formatClock, useClock } from "./useClock";

interface RescueHeaderProps {
  loading: boolean;
  onRefresh: () => void;
  /** When the data was last loaded. */
  updatedAt: Date | null;
  /** Requests waiting for a rescuer (shown on the bell). */
  waitingCount: number;
}

/** Rescue Staff top bar: online status, clock, sync info, refresh, bell, user. */
export function RescueHeader({ loading, onRefresh, updatedAt, waitingCount }: RescueHeaderProps) {
  const now = useClock();
  const { user } = useAuth();

  return (
    <>
      <span className="flex items-center gap-2 font-mono text-xs font-semibold tracking-wide text-safe">
        <span className="h-2 w-2 rounded-full bg-safe" />
        TRỰC TUYẾN
      </span>
      <span className="hidden items-center gap-2 font-mono text-sm text-muted sm:flex">
        <Icon name="clock" className="h-4 w-4" />
        {formatClock(now)} UTC+7
      </span>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {updatedAt && (
          <span className="hidden font-mono text-[11px] text-muted xl:block">
            Cập nhật {formatClock(updatedAt)} · tự đồng bộ 15s
          </span>
        )}
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          title="Làm mới dữ liệu"
          aria-label="Làm mới dữ liệu"
          className="rounded-lg border border-border p-2 text-muted transition hover:text-text disabled:opacity-60"
        >
          <Icon name="refresh" className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
        </button>
        <div className="relative rounded-lg p-2 text-muted" title={`${waitingCount} SOS đang chờ`}>
          <Icon name="bell" className="h-5 w-5" />
          {waitingCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-sos px-1 font-mono text-[10px] font-bold text-white">
              {waitingCount}
            </span>
          )}
        </div>
        <div className="hidden text-right sm:block">
          <p className="max-w-40 truncate text-sm font-semibold leading-tight">
            {user?.fullName || user?.email || "Rescue Staff"}
          </p>
          <p className="font-mono text-[10px] tracking-widest text-safe">NHÂN VIÊN CỨU HỘ</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-safe/20 text-safe">
          <Icon name="user" className="h-5 w-5" />
        </div>
      </div>
    </>
  );
}
