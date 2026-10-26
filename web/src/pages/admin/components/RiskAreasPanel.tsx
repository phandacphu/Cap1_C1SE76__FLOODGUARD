import type { Severity } from "../../../types/admin";
import { SEVERITY_LABEL, SEVERITY_WEIGHT, type RiskArea } from "../adminStats";

const BAR: Record<Severity, string> = {
  critical: "bg-sos",
  high: "bg-warn",
  medium: "bg-water",
  low: "bg-safe",
};

export function RiskAreasPanel({ areas }: { areas: RiskArea[] }) {
  if (areas.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">Chưa có khu vực ngập đang hoạt động.</p>;
  }

  return (
    <ol className="space-y-4">
      {areas.map((area, index) => (
        <li key={area.id}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              <span className="mr-2 font-mono text-xs text-muted">
                {String(index + 1).padStart(2, "0")}.
              </span>
              <span className="font-medium">{area.name}</span>
            </span>
            <span className="shrink-0 font-mono text-xs text-muted">
              {area.alertCount} cảnh báo · {SEVERITY_LABEL[area.severity]}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-border">
            <div
              className={`h-full rounded-full ${BAR[area.severity]}`}
              style={{ width: `${(SEVERITY_WEIGHT[area.severity] / 4) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
