import type { GeoPoint } from "../floodAreaTypes";

/** Draws the polygon from its real coordinates (scaled to fit). It is a shape preview, not a map. */
export function PolygonPreview({ points }: { points: GeoPoint[] }) {
  // Reject the preview as a whole: dropping a bad vertex could falsely imply a valid polygon.
  const valid = points.length >= 3 && points.every((p) =>
    Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90 &&
    Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180,
  );
  if (!valid) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border font-mono text-xs text-muted">
        Không thể xem trước: cần ít nhất 3 điểm và tất cả tọa độ phải hợp lệ.
      </div>
    );
  }
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const span = Math.max(maxLat - minLat, maxLng - minLng) || 1;
  const pad = 8, size = 100 - pad * 2;
  const toXY = (p: GeoPoint) => [
    pad + ((p.longitude - minLng) / span) * size,
    pad + ((maxLat - p.latitude) / span) * size,
  ];
  const coords = points.map(toXY);
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label="Xem trước hình dạng đa giác"
      className="h-48 w-full rounded-xl border border-border bg-bg/60"
    >
      <polygon
        points={coords.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1"
        className="text-water"
      />
      {coords.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="1.8" className="fill-water" />
          <text x={x + 2.5} y={y - 2} fontSize="4" className="fill-muted">
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}
