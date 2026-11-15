export const TYPE_LABEL = {
  shelter: 'Điểm tránh trú', school: 'Trường học', hospital: 'Bệnh viện',
  community_center: 'Nhà sinh hoạt cộng đồng', other: 'Khác',
} as const;
export interface Coordinates { latitude: number; longitude: number }
export interface SafeLocation {
  id: string; name: string; address: string; location: Coordinates;
  type: keyof typeof TYPE_LABEL; description: string | null; distanceKm: number | null;
}
export interface CatalogSource {
  list(origin: Coordinates | null, signal: AbortSignal): Promise<SafeLocation[]>;
  detail(id: string, origin: Coordinates | null, signal: AbortSignal): Promise<SafeLocation>;
}
export class CatalogError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export function validCoordinates(value: unknown): value is Coordinates {
  if (!value || typeof value !== 'object') return false;
  const p = value as Coordinates;
  return typeof p.latitude === 'number' && Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90 &&
    typeof p.longitude === 'number' && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180;
}
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
export function parseLocation(value: unknown, gps: boolean): SafeLocation {
  if (!record(value) || !['id','name','address'].every(key => typeof value[key] === 'string' && (value[key] as string).trim()) ||
    !validCoordinates(value.location) || typeof value.type !== 'string' || !Object.hasOwn(TYPE_LABEL, value.type) ||
    !(value.description === null || typeof value.description === 'string') ||
    !(gps ? typeof value.distanceKm === 'number' && Number.isFinite(value.distanceKm) && value.distanceKm >= 0 : value.distanceKm === null)) {
    throw new CatalogError('Dữ liệu điểm tránh trú không đúng cấu trúc API.', 200);
  }
  return { id: value.id as string, name: value.name as string, address: value.address as string,
    location: { ...value.location }, type: value.type as SafeLocation['type'],
    description: value.description as string | null, distanceKm: value.distanceKm as number | null };
}
export function parseCatalog(body: unknown, gps: boolean): SafeLocation[] {
  if (!record(body) || body.success !== true || !record(body.data) || !Array.isArray(body.data.safeLocations)) throw new CatalogError('Phản hồi danh sách không hợp lệ.',200);
  const items = body.data.safeLocations.map(value => parseLocation(value,gps));
  if (new Set(items.map(item => item.id)).size !== items.length) throw new CatalogError('Danh sách có ID trùng.',200);
  return sortLocations(items);
}
export function parseDetail(body: unknown, id: string, gps: boolean): SafeLocation {
  if (!record(body) || body.success !== true || !record(body.data)) throw new CatalogError('Phản hồi chi tiết không hợp lệ.',200);
  const item = parseLocation(body.data.safeLocation,gps);
  if (item.id !== id) throw new CatalogError('Chi tiết trả về không đúng ID.',200);
  return item;
}
export function sortLocations(items: SafeLocation[]): SafeLocation[] {
  return [...items].sort((a,b) => a.distanceKm !== null && b.distanceKm !== null
    ? a.distanceKm - b.distanceKm || a.id.localeCompare(b.id)
    : a.name.localeCompare(b.name,'vi') || a.id.localeCompare(b.id));
}
export function filterLocations(items: SafeLocation[], search: string, type: string): SafeLocation[] {
  const term = search.trim().toLocaleLowerCase('vi');
  return items.filter(item => (type === 'all' || item.type === type) && `${item.name} ${item.address}`.toLocaleLowerCase('vi').includes(term));
}
export const distanceLabel = (distance: number | null) => distance === null ? null : `Cách bạn khoảng ${distance.toLocaleString('vi-VN',{maximumFractionDigits:2})} km`;
export const mapsUrl = (point: Coordinates) => `https://www.google.com/maps/dir/?api=1&destination=${point.latitude},${point.longitude}`;
export const sameOrigin = (a: Coordinates | null,b: Coordinates | null) => a === b || Boolean(a && b && a.latitude === b.latitude && a.longitude === b.longitude);
