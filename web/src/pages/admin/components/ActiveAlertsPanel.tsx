import type { FloodAlert, Severity } from "../../../types/admin";
import { SEVERITY_LABEL, formatDateTime } from "../adminStats";

const BADGE: Record<Severity, string> = {
  critical: "bg-sos/15 text-sos",
  high: "bg-warn/15 text-warn",
  medium: "bg-water/15 text-water",
  low: "bg-safe/15 text-safe",
};

const BORDER: Record<Severity, string> = {
  critical: "border-l-sos",
  high: "border-l-warn",
  medium: "border-l-water",
  low: "border-l-safe",
};

interface ActiveAlertsPanelProps {
  alerts: FloodAlert[];
  areaNames: Map<string, string>;
}

export function ActiveAlertsPanel({ alerts, areaNames }: ActiveAlertsPanelProps) {
  if (alerts.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">Hiện không có cảnh báo lũ nào đang hiệu lực.</p>;
  }

  return (
    <ul className="space-y-3">
      {alerts.slice(0, 5).map((alert) => (
        <li
          key={alert.id}
          className={`rounded-xl border border-border border-l-4 bg-bg/60 p-3 ${BORDER[alert.severity]}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-muted">
              #{alert.id.slice(0, 8).toUpperCase()}
            </span>
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${BADGE[alert.severity]}`}>
              {SEVERITY_LABEL[alert.severity]}
            </span>
          </div>
          <p className="mt-1.5 text-sm font-semibold leading-snug">{alert.title}</p>
          <p className="mt-1 line-clamp-2 text-xs text-muted">{alert.content}</p>
          <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[10px] text-muted">
            <span className="truncate">{areaNames.get(alert.areaId) ?? "Khu vực chưa rõ"}</span>
            <span className="shrink-0">Đến: {formatDateTime(alert.endAt)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
