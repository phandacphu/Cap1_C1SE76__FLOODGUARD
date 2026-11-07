import type { SosItem, SosSummary } from "./sosTypes.ts";

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalDate(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

export function parseLocation(value: unknown): SosItem["location"] {
  const point = asRecord(value);
  if (!point || typeof point.latitude !== "number" || typeof point.longitude !== "number" ||
    !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) ||
    Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) return null;
  return { latitude: point.latitude, longitude: point.longitude };
}

/** Adapt only the documented current API. Never infer new conditions from legacy status. */
export function parseApiSos(value: unknown): SosItem {
  const item = asRecord(value);
  if (!item || typeof item.id !== "string" || !item.id.trim()) {
    throw new Error("Dữ liệu SOS từ máy chủ không hợp lệ.");
  }
  return {
    id: item.id,
    residentId: optionalText(item.residentId),
    senderName: null,
    contact: null,
    createdAt: optionalDate(item.createdAt),
    updatedAt: optionalDate(item.updatedAt),
    // The new form, identity, GPS timestamp and completion fields have no agreed response contract yet.
    situations: null,
    numberOfPeople: typeof item.numberOfPeople === "number" && Number.isInteger(item.numberOfPeople) &&
      item.numberOfPeople > 0 ? item.numberOfPeople : null,
    waterLevel: null,
    note: optionalText(item.note),
    condition: null,
    location: parseLocation(item.location),
    // updatedAt is a request timestamp, not a GPS timestamp.
    locationUpdatedAt: null,
    confirmedBy: null,
    completedAt: null,
    source: "api",
  };
}

export function parseApiList(value: unknown): SosItem[] {
  const data = asRecord(value);
  if (!data || !Array.isArray(data.rescueRequests)) {
    throw new Error("Danh sách SOS từ máy chủ không hợp lệ.");
  }
  const items = data.rescueRequests.map(parseApiSos);
  if (new Set(items.map(item => item.id)).size !== items.length) {
    throw new Error("Danh sách SOS chứa mã trùng lặp.");
  }
  return items;
}

export function parseApiDetail(value: unknown): SosItem {
  const data = asRecord(value);
  return parseApiSos(data?.rescueRequest);
}

export function parseApiSummary(value: unknown): SosSummary {
  const data = asRecord(value);
  if (!data || typeof data.total !== "number" || !Number.isSafeInteger(data.total) || data.total < 0) {
    throw new Error("Thống kê SOS từ máy chủ không hợp lệ.");
  }
  // byStatus belongs to the legacy flow; its buckets are deliberately not mapped.
  return { total: data.total, active: null, rescued: null, source: "api" };
}
