import type { HourlyPoint } from "../adminStats";

interface SosTimelineChartProps {
  points: HourlyPoint[];
}

const W = 600;
const H = 240;
const PAD = { left: 36, right: 12, top: 12, bottom: 28 };

/** Axis maximum that splits into 4 whole-number steps (4, 8, 20, 40, 100, ...). */
function niceMax(value: number): number {
  const quarter = Math.max(1, Math.ceil(value / 4));
  const magnitude = 10 ** Math.floor(Math.log10(quarter));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (quarter <= candidate && Number.isInteger(candidate)) return candidate * 4;
  }
  return 10 * magnitude * 4;
}

/** Smooth path through the points (midpoint quadratic curves). */
function smoothPath(coords: Array<[number, number]>): string {
  if (coords.length === 0) return "";
  let d = `M ${coords[0][0]} ${coords[0][1]}`;
  for (let i = 1; i < coords.length; i += 1) {
    const [px, py] = coords[i - 1];
    const [cx, cy] = coords[i];
    const mx = (px + cx) / 2;
    const my = (py + cy) / 2;
    d += ` Q ${px} ${py} ${mx} ${my}`;
  }
  const last = coords[coords.length - 1];
  return `${d} T ${last[0]} ${last[1]}`;
}

export function SosTimelineChart({ points }: SosTimelineChartProps) {
  const max = niceMax(Math.max(1, ...points.map((p) => p.created)));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / Math.max(1, points.length - 1)) * innerW;
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  const created = points.map((p, i): [number, number] => [x(i), y(p.created)]);
  const assisted = points.map((p, i): [number, number] => [x(i), y(p.assisted)]);
  const baseline = PAD.top + innerH;
  const area = (coords: Array<[number, number]>) =>
    `${smoothPath(coords)} L ${coords[coords.length - 1][0]} ${baseline} L ${coords[0][0]} ${baseline} Z`;

  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Số ca SOS theo giờ trong 24 giờ gần nhất"
    >
      <defs>
        <linearGradient id="fg-created" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="fg-assisted" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#2ee88a" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#2ee88a" stopOpacity="0" />
        </linearGradient>
      </defs>

      {gridValues.map((value) => (
        <g key={value}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(value)}
            y2={y(value)}
            stroke="#1f2a3c"
            strokeDasharray="3 4"
          />
          <text x={PAD.left - 8} y={y(value) + 4} textAnchor="end" fontSize="12" fill="#94a3b8">
            {value}
          </text>
        </g>
      ))}

      <path d={area(created)} fill="url(#fg-created)" />
      <path d={area(assisted)} fill="url(#fg-assisted)" />
      <path d={smoothPath(created)} fill="none" stroke="#22d3ee" strokeWidth="2.5" />
      <path d={smoothPath(assisted)} fill="none" stroke="#2ee88a" strokeWidth="2.5" />

      {points.map((point, i) =>
        i % 4 === 0 || i === points.length - 1 ? (
          <text
            key={i}
            x={x(i)}
            y={H - 8}
            textAnchor={i === points.length - 1 ? "end" : "middle"}
            fontSize="12"
            fill="#94a3b8"
          >
            {i === points.length - 1 ? "Hiện tại" : `${String(point.hour).padStart(2, "0")}:00`}
          </text>
        ) : null,
      )}
    </svg>
  );
}
