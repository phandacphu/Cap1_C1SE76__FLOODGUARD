import type { DirectSosEvent, DirectSosFilters, DirectSosRequest, SosLocation } from '../types/rescueDirect';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

function date(value: unknown): string | null {
  const result = text(value);
  return result && Number.isFinite(Date.parse(result)) ? result : null;
}

export function parseSosLocation(value: unknown): SosLocation | null {
  if (!isRecord(value)) return null;
  const { latitude, longitude } = value;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
      typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

export function parseDirectSos(value: unknown): DirectSosRequest {
  if (!isRecord(value) || !text(value.id)) throw new Error('Dữ liệu SOS không hợp lệ.');
  return {
    id: value.id as string,
    residentId: text(value.residentId),
    status: text(value.status),
    state: ['active', 'rescued', 'legacy_other'].includes(String(value.state))
      ? value.state as DirectSosRequest['state'] : null,
    situations: Array.isArray(value.situations) && value.situations.every(item => typeof item === 'string')
      ? value.situations : null,
    numberOfPeople: typeof value.numberOfPeople === 'number' && Number.isSafeInteger(value.numberOfPeople) && value.numberOfPeople > 0
      ? value.numberOfPeople : null,
    waterLevel: text(value.waterLevel),
    note: text(value.note),
    location: parseSosLocation(value.location),
    initialLocation: parseSosLocation(value.initialLocation),
    locationCapturedAt: date(value.locationCapturedAt),
    locationReceivedAt: date(value.locationReceivedAt),
    createdAt: date(value.createdAt),
    updatedAt: date(value.updatedAt),
    completedBy: text(value.completedBy),
    completedAt: date(value.completedAt),
  };
}

export function parseDirectList(value: unknown): DirectSosRequest[] {
  if (!Array.isArray(value)) throw new Error('Danh sách SOS sai cấu trúc.');
  const items = value.map(parseDirectSos);
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('Danh sách SOS trùng mã yêu cầu.');
  return items;
}

export function parseDirectHistory(value: unknown): DirectSosEvent[] {
  if (!Array.isArray(value)) throw new Error('Lịch sử SOS sai cấu trúc.');
  return value.map(item => {
    if (!isRecord(item) || !text(item.id)) throw new Error('Sự kiện SOS không hợp lệ.');
    return {
      id: item.id as string,
      oldStatus: text(item.oldStatus),
      newStatus: text(item.newStatus),
      changedBy: text(item.changedBy),
      note: text(item.note),
      changedAt: date(item.changedAt),
    };
  });
}

export function directSosQuery(filters: DirectSosFilters = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === '') continue;
    if (!['state', 'sort', 'from', 'to'].includes(key)) throw new Error('Bộ lọc SOS không được hỗ trợ.');
    if (key === 'state' && !['active', 'rescued', 'legacy_other'].includes(value)) throw new Error('Nhóm SOS không hợp lệ.');
    if (key === 'sort' && !['newest', 'oldest'].includes(value)) throw new Error('Thứ tự SOS không hợp lệ.');
    if (key === 'from' || key === 'to') {
      if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
        throw new Error('Thời điểm lọc phải có múi giờ.');
      }
      query.set(key, new Date(value).toISOString());
    } else query.set(key, value);
  }
  if (filters.from && filters.to && Date.parse(filters.from) > Date.parse(filters.to)) {
    throw new Error('Ngày bắt đầu phải trước ngày kết thúc.');
  }
  return query.toString();
}
