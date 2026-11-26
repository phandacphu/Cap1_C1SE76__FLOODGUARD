import type { DirectSosRequest } from '../../types/rescueDirect';

export const SOS_MAP_COLORS = { active: '#ef4444', rescued: '#22c55e', legacy_other: '#94a3b8' };
export function hasMapLocation(item: DirectSosRequest): boolean {
  const point = item.location;
  return Boolean(point && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 &&
    Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180);
}

export function directionsUrl(item: DirectSosRequest): string | null {
  return hasMapLocation(item)
    ? `https://www.google.com/maps/dir/?api=1&destination=${item.location!.latitude},${item.location!.longitude}` : null;
}

/** Keep real GPS coordinates; overlapping requests share an explicit multi-SOS popup. */
export function groupMapLocations(items: DirectSosRequest[]) {
  const groups = new Map<string, { latitude: number; longitude: number; items: DirectSosRequest[] }>();
  items.filter(hasMapLocation).forEach(item => {
    const { latitude, longitude } = item.location!;
    const key = JSON.stringify([latitude, longitude]);
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { latitude, longitude, items: [item] });
  });
  return [...groups.entries()].map(([key, group]) => ({ key, ...group }));
}
