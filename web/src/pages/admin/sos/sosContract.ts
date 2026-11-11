import type { SosCondition, SosHistoryEvent, SosItem, SosSummary } from "./sosTypes";

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

function parseState(value: unknown): SosCondition {
  if (value === "active" || value === "rescued" || value === "legacy_other") return value;
  throw new Error("SOS không có trường state hợp lệ theo hợp đồng API v2.");
}

function parseHistory(value: unknown): SosHistoryEvent[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("Lịch sử trạng thái SOS sai định dạng.");
  return value.map((entry, index) => {
    const item = asRecord(entry);
    if (!item) throw new Error(`Dòng lịch sử SOS thứ ${index + 1} sai định dạng.`);
    return {
      id: optionalText(item.id) ?? `history-${index}`,
      oldStatus: optionalText(item.oldStatus),
      newStatus: optionalText(item.newStatus),
      changedBy: optionalText(item.changedBy),
      note: optionalText(item.note),
      changedAt: optionalDate(item.changedAt),
    };
  });
}

/** Read documented fields. Legacy missing facts remain null; never infer urgency/contact/GPS time. */
export function parseApiSos(value: unknown): SosItem {
  const item = asRecord(value);
  if (!item || typeof item.id !== "string" || !item.id.trim()) {
    throw new Error("Dữ liệu SOS từ máy chủ không hợp lệ.");
  }
  const situations = item.situations == null ? null :
    Array.isArray(item.situations) && item.situations.every(value => typeof value === "string")
      ? item.situations as string[] : null;
  return {
    id: item.id,
    residentId: optionalText(item.residentId),
    senderName: null,
    contact: null,
    createdAt: optionalDate(item.createdAt),
    updatedAt: optionalDate(item.updatedAt),
    situations,
    numberOfPeople: typeof item.numberOfPeople === "number" && Number.isSafeInteger(item.numberOfPeople) &&
      item.numberOfPeople > 0 ? item.numberOfPeople : null,
    waterLevel: optionalText(item.waterLevel),
    note: optionalText(item.note),
    condition: parseState(item.state),
    status: optionalText(item.status),
    location: parseLocation(item.location),
    initialLocation: parseLocation(item.initialLocation),
    locationCapturedAt: optionalDate(item.locationCapturedAt),
    locationReceivedAt: optionalDate(item.locationReceivedAt),
    locationUpdatedAt: null,
    confirmedBy: null,
    completedBy: optionalText(item.completedBy),
    completedAt: optionalDate(item.completedAt),
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
  const raw = asRecord(data?.rescueRequest);
  const item = parseApiSos(raw);
  return { ...item, statusHistory: parseHistory(raw?.statusHistory) };
}

function count(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Thống kê SOS không có ${name} hợp lệ.`);
  }
  return value;
}

export function parseApiSummary(value: unknown): SosSummary {
  const data = asRecord(value);
  if (!data) throw new Error("Thống kê SOS từ máy chủ không hợp lệ.");
  const total = count(data.total, "total");
  const active = count(data.active, "active");
  const rescued = count(data.rescued, "rescued");
  const legacyOther = count(data.legacyOther, "legacyOther");
  if (total !== active + rescued + legacyOther) {
    throw new Error("Thống kê SOS không khớp tổng các nhóm trạng thái.");
  }
  return { total, active, rescued, legacyOther, source: "api" };
}
