import type { HistoricalFeature, HistoricalFeatureCollection, HistoricalLayerKey } from '../admin/flood-area/historicalMapService';

const text = (value: unknown, fallback: string) => typeof value === 'string' && value.trim() ? value : fallback;
// Format separate flood events on new lines in the popup; never change stored metadata.
const descriptionForDisplay = (value: unknown) => text(value, 'Chưa có mô tả').replace(/;\s*(?=\S)/g, ';\n');
export const escapeHistoricalText = (value: string) => value.replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function validateHistoricalMetadata(data: HistoricalFeatureCollection, key: HistoricalLayerKey) {
  if (key !== 'points' && key !== 'areas') return data;
  const ids = new Set<string>();
  data.features.forEach(feature => {
    const p = feature.properties;
    if (!p || typeof p.id !== 'string' || !p.id.trim() || ids.has(p.id)) throw new Error('ID HIST thiếu hoặc trùng.');
    ids.add(p.id);
    if (['name', 'description', 'source'].some(field => p[field] != null && typeof p[field] !== 'string') ||
      (p.areaType != null && !['flood', 'low_lying'].includes(String(p.areaType)))) throw new Error('Metadata HIST không hợp lệ.');
  });
  return data;
}

export function historicalPointIndex(data?: HistoricalFeatureCollection) {
  return new Map((data?.features ?? []).filter(feature => feature.geometry.type === 'Point' && typeof feature.properties?.id === 'string')
    .map(feature => [feature.properties!.id as string, feature]));
}

export function historicalDetails(feature: HistoricalFeature, points: Map<string, HistoricalFeature>) {
  const p = feature.properties ?? {};
  const point = feature.geometry.type === 'Point' ? feature : typeof p.id === 'string' ? points.get(p.id) : undefined;
  const position = point?.geometry.coordinates as number[] | undefined;
  const rows: [string, string][] = [
    ['ID HIST', text(p.id, 'Chưa có ID')], ['Tên', text(p.name, 'Chưa có tên')],
    ['Mô tả', descriptionForDisplay(p.description)], ['Nguồn', text(p.source, 'Chưa có thông tin')],
    ['Phân loại', p.areaType === 'flood' ? 'Vùng ngập' : p.areaType === 'low_lying' ? 'Vùng trũng' : 'Chưa phân loại'],
    ['Tọa độ điểm HIST (vĩ độ, kinh độ)', position ? `${position[1]}, ${position[0]}` : 'Chưa có điểm tham chiếu cùng ID trong dữ liệu đã tải'],
  ];
  if (feature.geometry.type === 'Polygon') {
    const outer = (feature.geometry.coordinates as number[][][])[0];
    rows.push(['Đa giác', `${outer.length - 1} đỉnh (không tính đỉnh đóng vòng)`]);
    rows.push(['Đỉnh đầu đa giác (vĩ độ, kinh độ)', `${outer[0][1]}, ${outer[0][0]}`]);
  }
  return rows;
}

export function historicalPopupHtml(feature: HistoricalFeature, points: Map<string, HistoricalFeature>, stale: boolean, fetchedAt: number) {
  const fields = historicalDetails(feature, points).map(([label, value]) =>
    `<p><b>${escapeHistoricalText(label)}:</b> <span style="white-space:pre-wrap">${escapeHistoricalText(value)}</span></p>`).join('');
  return `<div>${fields}<p><b>Ngập lịch sử — chỉ tham khảo, không xác nhận ngập hiện tại.</b></p>` +
    `<p>API tải lúc: ${escapeHistoricalText(new Date(fetchedAt).toLocaleString('vi-VN'))}</p>` +
    (stale ? '<p>Dữ liệu có thể đã cũ; chưa cập nhật được lớp HIST.</p>' : '') + '</div>';
}
