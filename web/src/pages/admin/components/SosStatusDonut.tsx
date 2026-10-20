import { formatNumber, type StatusCounts } from "../adminStats";

interface SosStatusDonutProps {
  counts: StatusCounts;
}

const R = 70;
const CIRCUMFERENCE = 2 * Math.PI * R;

export function SosStatusDonut({ counts }: SosStatusDonutProps) {
  const waiting = counts.submitted + counts.cancelled;
  const total = counts.assisted + counts.in_progress + counts.received + waiting;

  const segments = [
    { key: "assisted", label: "Đã hỗ trợ", value: counts.assisted, color: "#2ee88a" },
    { key: "in_progress", label: "Đang xử lý", value: counts.in_progress, color: "#f59e0b" },
    { key: "received", label: "Đã tiếp nhận", value: counts.received, color: "#22d3ee" },
    { key: "waiting", label: "Chờ xử lý / Đã hủy", value: waiting, color: "#94a3b8" },
  ];

  let offset = 0;

  return (
    <div>
      <div className="relative mx-auto h-48 w-48">
        <svg
          viewBox="0 0 180 180"
          className="h-full w-full -rotate-90"
          role="img"
          aria-label="Cơ cấu trạng thái SOS"
        >
          <circle cx="90" cy="90" r={R} fill="none" stroke="#1f2a3c" strokeWidth="18" />
          {total > 0 &&
            segments.map((segment) => {
              const length = (segment.value / total) * CIRCUMFERENCE;
              const circle = (
                <circle
                  key={segment.key}
                  cx="90"
                  cy="90"
                  r={R}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth="18"
                  strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += length;
              return circle;
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-3xl font-semibold">{formatNumber(total)}</span>
          <span className="font-mono text-[10px] tracking-widest text-muted">TỔNG CA SOS</span>
        </div>
      </div>

      <ul className="mt-5 space-y-2 text-sm">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: segment.color }} />
              {segment.label}
            </span>
            <span className="font-mono text-xs text-muted">
              {formatNumber(segment.value)} (
              {total > 0 ? ((segment.value / total) * 100).toFixed(1) : "0.0"}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
