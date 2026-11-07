import type { RiskArea } from "../adminStats";
import { AREA_TYPE_LABEL, AREA_TYPE_COLOR } from "../flood-area/floodAreaTypes";

export function RiskAreasPanel({ areas }: { areas: RiskArea[] }) {
  if (areas.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">Không có cảnh báo liên kết với các vùng trong lần tải gần nhất.</p>;
  }
  return (
    <ol className="space-y-4">
      {areas.map((area) => (
        <li key={area.id} className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0 truncate font-medium">{area.name}</span>
          <span className="shrink-0 text-xs text-muted">
            <span className="mr-1 inline-block h-2 w-2" style={{ backgroundColor: area.areaType === null ? "#94a3b8" : AREA_TYPE_COLOR[area.areaType] }} />
            {area.areaType === null ? "Chưa phân loại" : AREA_TYPE_LABEL[area.areaType]} · {area.alertCount} cảnh báo
          </span>
        </li>
      ))}
    </ol>
  );
}
