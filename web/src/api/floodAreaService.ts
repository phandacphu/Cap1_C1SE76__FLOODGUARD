import { API_URL } from './authApi';
import { ApiError } from './http';
import type { FloodArea, FloodAlert } from '../types/floodArea';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isValidFloodArea(value: unknown): value is FloodArea {
  if (!record(value) || typeof value.id !== 'string' || !value.id.trim() ||
      typeof value.name !== 'string' || !value.name.trim() ||
      !(value.areaType == null || ['flood', 'low_lying'].includes(String(value.areaType))) ||
      ![value.source, value.description].every(v => v == null || typeof v === 'string')) return false;
  const geometry = value.geometry;
  if (!record(geometry) || geometry.type !== 'polygon' || !Array.isArray(geometry.points) || geometry.points.length < 3) return false;
  if (!geometry.points.every(pt => record(pt) && typeof pt.latitude === 'number' && typeof pt.longitude === 'number' &&
      Number.isFinite(pt.latitude) && Math.abs(pt.latitude) <= 90 && Number.isFinite(pt.longitude) && Math.abs(pt.longitude) <= 180)) return false;
  return new Set(geometry.points.map(pt => `${pt.latitude},${pt.longitude}`)).size >= 3;
}

async function publicGet(path: string): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 70_000);
  try {
    const response = await fetch(`${API_URL}${path}`, { signal: controller.signal });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(record(body) && typeof body.message === 'string' ? body.message : `Lỗi máy chủ (${response.status}).`, response.status);
    if (!record(body) || body.success !== true || !record(body.data)) throw new ApiError('Phản hồi API không đúng cấu trúc.', response.status);
    return body.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Không thể kết nối máy chủ. Vui lòng thử lại.', 0);
  } finally { clearTimeout(timeout); }
}

// Public data: share and deduplicate concurrent requests, including React StrictMode.
const CACHE_MS = 60_000;
const fetchedTimes = new WeakMap<object, number>();
let areaCache: { value: FloodArea[]; expires: number; fetchedAt: number } | null = null;
let areaPending: Promise<FloodArea[]> | null = null;
let alertCache: { value: FloodAlert[]; expires: number; fetchedAt: number } | null = null;
let alertPending: Promise<FloodAlert[]> | null = null;

export const floodAreaService = {
  getFloodAreas(force = false): Promise<FloodArea[]> {
    if (areaPending) return areaPending;
    if (!force && areaCache && areaCache.expires > Date.now()) return Promise.resolve(areaCache.value);
    areaPending = publicGet('/flood-areas').then(data => {
      if (!Array.isArray(data.floodAreas) || !data.floodAreas.every(isValidFloodArea)) {
        throw new ApiError('Dữ liệu vùng ngập hoặc tọa độ đa giác không hợp lệ.', 200);
      }
      const value = data.floodAreas;
      const fetchedAt = Date.now();
      fetchedTimes.set(value, fetchedAt);
      areaCache = { value, expires: fetchedAt + CACHE_MS, fetchedAt };
      return value;
    }).finally(() => { areaPending = null; });
    return areaPending;
  },
  getActiveAlerts(force = false): Promise<FloodAlert[]> {
    if (alertPending) return alertPending;
    if (!force && alertCache && alertCache.expires > Date.now()) return Promise.resolve(alertCache.value);
    alertPending = publicGet('/flood-alerts/active').then(data => {
      if (!Array.isArray(data.floodAlerts) || !data.floodAlerts.every(alert =>
        record(alert) && ['id', 'title', 'content', 'areaId'].every(key => typeof alert[key] === 'string') &&
        ['low', 'medium', 'high', 'critical'].includes(String(alert.severity)) && alert.status === 'active' &&
        typeof alert.startAt === 'string' && Number.isFinite(Date.parse(alert.startAt)) &&
        typeof alert.endAt === 'string' && Number.isFinite(Date.parse(alert.endAt)) &&
        Date.parse(alert.startAt) <= Date.parse(alert.endAt))) {
        throw new ApiError('Dữ liệu cảnh báo không hợp lệ.', 200);
      }
      const value = data.floodAlerts as FloodAlert[];
      const fetchedAt = Date.now();
      fetchedTimes.set(value, fetchedAt);
      alertCache = { value, expires: fetchedAt + CACHE_MS, fetchedAt };
      return value;
    }).finally(() => { alertPending = null; });
    return alertPending;
  },
  async getActiveAlertsSnapshot(force = false) {
    const value = await floodAreaService.getActiveAlerts(force);
    return { value, fetchedAt: fetchedTimes.get(value)! };
  },
  async getFloodAreasSnapshot(force = false) {
    const value = await floodAreaService.getFloodAreas(force);
    return { value, fetchedAt: fetchedTimes.get(value)! };
  },
  async getActiveAlertCount(force = false): Promise<number> {
    return (await floodAreaService.getActiveAlerts(force)).length;
  },
};
