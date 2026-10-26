import type { RescueRequest, UrgencyLevel } from "../../../types/rescue";
import { URGENCY_LABEL, isOpen, sosCode } from "../rescueStats";

const COLOR: Record<UrgencyLevel, string> = {
  critical: "#ff3b3b",
  high: "#fb923c",
  medium: "#22d3ee",
  low: "#2ee88a",
};

const W = 640;
const H = 340;
const PAD = 36;

interface Props {
  requests: RescueRequest[];
}

/**
 * Schematic plot of the open SOS positions (latitude/longitude only).
 * The real Google Map replaces this frame in CCF-105.
 */
export function SosScatterMap({ requests }: Props) {
  const open = requests.filter((r) => isOpen(r.status));

  if (open.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-border font-mono text-xs text-muted">
        Không có SOS đang mở để hiển thị.
      </div>
    );
  }

  const lats = open.map((r) => r.location.latitude);
  const lngs = open.map((r) => r.location.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = Math.max(maxLat - minLat, 0.005);
  const spanLng = Math.max(maxLng - minLng, 0.005);

  const x = (lng: number) => PAD + ((lng - minLng) / spanLng) * (W - PAD * 2);
  const y = (lat: number) => H - PAD - ((lat - minLat) / spanLat) * (H - PAD * 2);

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Sơ đồ vị trí các SOS đang mở"
        className="w-full rounded-xl border border-border bg-bg"
      >
        {[1, 2, 3].map((i) => (
          <g key={i} stroke="#1f2a3c" strokeWidth="1">
            <line x1={PAD} x2={W - PAD} y1={(H / 4) * i} y2={(H / 4) * i} />
            <line x1={(W / 4) * i} x2={(W / 4) * i} y1={PAD} y2={H - PAD} />
          </g>
        ))}
        {open.map((r) => (
          <g key={r.id}>
            <title>{`${sosCode(r.id)} · ${URGENCY_LABEL[r.urgency]} · ${r.numberOfPeople} người`}</title>
            {r.urgency === "critical" && r.status === "submitted" && (
              <circle
                cx={x(r.location.longitude)}
                cy={y(r.location.latitude)}
                r="13"
                fill={COLOR.critical}
                opacity="0.2"
              />
            )}
            <circle
              cx={x(r.location.longitude)}
              cy={y(r.location.latitude)}
              r="6"
              fill={COLOR[r.urgency]}
              stroke="#0a0f1a"
              strokeWidth="2"
            />
          </g>
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted">
        {(Object.keys(COLOR) as UrgencyLevel[]).map((u) => (
          <span key={u} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR[u] }} />
            {URGENCY_LABEL[u]}
          </span>
        ))}
        <span className="ml-auto">{open.length} SOS đang mở</span>
      </div>
    </div>
  );
}
