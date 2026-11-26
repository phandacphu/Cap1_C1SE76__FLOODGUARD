import type { ZoneBundle } from "./warningData";
export const ZONE_SOURCE_LABELS: Record<string, string> = {
  admin_area: "Vùng do Admin quản lý",
  historical_area: "Dữ liệu ngập lịch sử",
  radar: "Dữ liệu Radar",
};
export const ZONE_REASON_LABELS: Record<string, string> = {
  unclassified_area: "Chưa phân loại ngập hoặc vùng trũng",
  missing_geometry: "Chưa có ranh giới vùng",
  missing_outline: "Chưa có ranh giới vùng",
  invalid_geometry: "Ranh giới vùng chưa hợp lệ",
  source_unavailable: "Chưa tải được nguồn dữ liệu",
  duplicate_zone_id: "Trùng mã vùng cần kiểm tra",
};
export function coverageRows(bundle: ZoneBundle) {
  const names = new Map(
    bundle.geojson.features.map((feature) => [
      feature.properties.zoneId,
      feature.properties.name,
    ]),
  );
  return bundle.coverage.unassessableZones.map((item) => ({
    id: item.zoneId,
    name: item.zoneId
      ? names.get(item.zoneId) || "Vùng chưa có tên"
      : "Nguồn dữ liệu chưa tải được",
    source: ZONE_SOURCE_LABELS[item.sourceKind] || "Nguồn dữ liệu khác",
    reason: ZONE_REASON_LABELS[item.reason] || "Dữ liệu vùng cần được kiểm tra",
  }));
}
export function coverageSummary(bundle: ZoneBundle): string {
  const items = bundle.coverage.unassessableZones;
  const unclassified = items.filter(
    (item) => item.reason === "unclassified_area",
  ).length;
  const failures = items.filter(
    (item) => item.reason === "source_unavailable",
  ).length;
  if (bundle.coverage.status === "unavailable")
    return "Chưa đủ dữ liệu để hiển thị ranh giới vùng. Không thể xem đây là khu vực không có nguy cơ.";
  const parts = [];
  if (unclassified) parts.push(`${unclassified} vùng chưa được phân loại`);
  if (failures) parts.push(`${failures} nguồn dữ liệu chưa tải được`);
  const other = items.length - unclassified - failures;
  if (other) parts.push(`${other} vùng cần kiểm tra ranh giới hoặc dữ liệu`);
  return `${parts.length ? parts.join("; ") + ". " : "Một phần dữ liệu vùng cần kiểm tra. "}Các vùng có ranh giới hợp lệ vẫn được hiển thị.`;
}
