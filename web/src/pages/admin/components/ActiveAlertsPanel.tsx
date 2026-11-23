import type { FloodWarning } from "../flood-warning/floodWarningTypes";
import { warningTime } from "../flood-warning/floodWarningTypes";

interface ActiveAlertsPanelProps {
  alerts: FloodWarning[];
}

export function ActiveAlertsPanel({ alerts }: ActiveAlertsPanelProps) {
  if (alerts.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">Hiện không có cảnh báo lũ nào đang hiệu lực.</p>;
  }

  return (
    <ul className="space-y-3">
      {alerts.slice(0, 5).map((alert) => (
        <li
          key={alert.id}
          className="rounded-xl border border-border border-l-4 border-l-water bg-bg/60 p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-muted">
              #{alert.id.slice(0, 8).toUpperCase()}
            </span>
            <span className="rounded bg-safe/15 px-1.5 py-0.5 text-[11px] font-semibold text-safe">
              Đang bật
            </span>
          </div>
          <p className="mt-1.5 text-sm font-semibold leading-snug">{alert.title}</p>
          <p className="mt-1 line-clamp-2 text-xs text-muted">{alert.content}</p>
          <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[10px] text-muted">
            <span className="truncate">Tất cả vùng công bố</span>
            <span className="shrink-0">Bắt đầu: {warningTime(alert.startAt)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
