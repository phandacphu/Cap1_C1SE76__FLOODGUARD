import type { DirectSosRequest } from '../../types/rescueDirect';
import type { FloodAlert } from '../../types/floodArea';

export const SOS_MAP_COLORS = { active: '#ef4444', rescued: '#22c55e', legacy_other: '#94a3b8' };
export const ALERT_COLORS = { low: '#3b82f6', medium: '#f59e0b', high: '#f97316', critical: '#dc2626' };
export const ALERT_LABELS = { low: 'Thấp', medium: 'Vừa', high: 'Cao', critical: 'Khẩn cấp' };
const rank = { low: 0, medium: 1, high: 2, critical: 3 };

export function hasMapLocation(item: DirectSosRequest): boolean {
  const point = item.location;
  return Boolean(point && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 &&
    Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180);
}

export function areaAlert(alerts: FloodAlert[], areaId: string, now: number): FloodAlert | null {
  return alerts.filter(alert => alert.areaId === areaId && alert.status === 'active' &&
    Date.parse(alert.startAt) <= now && now <= Date.parse(alert.endAt))
    .sort((a, b) => rank[b.severity] - rank[a.severity])[0] ?? null;
}

export function directionsUrl(item: DirectSosRequest): string | null {
  return hasMapLocation(item)
    ? `https://www.google.com/maps/dir/?api=1&destination=${item.location!.latitude},${item.location!.longitude}` : null;
}
