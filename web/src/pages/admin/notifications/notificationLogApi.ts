import { API_URL } from "../../../api/authApi";

export type LookupKey = "notificationId" | "correlationId" | "eventId";
export interface DeliveryLog {
  id: string;
  notificationId: string;
  correlationId: string;
  eventId: string;
  status: "queued" | "sent" | "failed";
  retryCount: number;
  providerResponseCode: string;
  outcomeUnknown: boolean;
  timestamp: string;
}
export interface LogPage { logs: DeliveryLog[]; nextCursor: string | null }

export class NotificationLogError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

const object = (input: unknown): input is Record<string, unknown> =>
  !!input && typeof input === "object" && !Array.isArray(input);
const sha256 = /^[a-f0-9]{64}$/;

export function validateLookup(key: LookupKey, raw: string): string {
  const value = raw.trim();
  const bytes = new TextEncoder().encode(value).length;
  if (!value || (key === "notificationId" && (value === "." || value === ".." || value.includes("/") || /^__.*__$/.test(value) || bytes > 1500)) ||
    (key === "correlationId" && !/^notification_[a-f0-9]{64}$/.test(value)) ||
    (key === "eventId" && bytes > 256)) {
    throw new NotificationLogError("Mã tra cứu không hợp lệ.", 400);
  }
  return value;
}

export function parseLogPage(value: unknown): LogPage {
  if (!object(value) || !Array.isArray(value.logs) ||
    !(value.nextCursor === null || (typeof value.nextCursor === "string" && sha256.test(value.nextCursor)))) {
    throw new NotificationLogError("Phản hồi API thiếu logs/nextCursor.", -1);
  }
  const seen = new Set<string>();
  const logs = value.logs.map((entry: unknown): DeliveryLog => {
    if (!object(entry) || typeof entry.id !== "string" || !sha256.test(entry.id) || seen.has(entry.id) ||
      typeof entry.notificationId !== "string" || !entry.notificationId ||
      typeof entry.correlationId !== "string" || !/^notification_[a-f0-9]{64}$/.test(entry.correlationId) ||
      typeof entry.eventId !== "string" || !entry.eventId ||
      !["queued", "sent", "failed"].includes(String(entry.status)) ||
      !Number.isSafeInteger(entry.retryCount) || (entry.retryCount as number) < 0 ||
      typeof entry.providerResponseCode !== "string" || !entry.providerResponseCode ||
      typeof entry.outcomeUnknown !== "boolean" || typeof entry.timestamp !== "string" ||
      !Number.isFinite(Date.parse(entry.timestamp))) {
      throw new NotificationLogError("API trả về nhật ký sai cấu trúc hoặc trùng ID.", -1);
    }
    seen.add(entry.id);
    return entry as unknown as DeliveryLog;
  });
  return { logs, nextCursor: value.nextCursor as string | null };
}

export async function fetchNotificationLogs(token: string, key: LookupKey, raw: string, cursor?: string): Promise<LogPage> {
  const value = validateLookup(key, raw);
  if (cursor !== undefined && !sha256.test(cursor)) throw new NotificationLogError("Cursor không hợp lệ.", 400);
  const params = new URLSearchParams({ [key]: value, limit: "20" });
  if (cursor) params.set("cursor", cursor);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 70_000);
  let response: Response;
  try {
    response = await fetch(`${API_URL}/admin/notification-logs?${params}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
    });
  } catch {
    throw new NotificationLogError("Không thể kết nối máy chủ. Vui lòng thử lại.", 0);
  } finally { window.clearTimeout(timeout); }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new NotificationLogError(response.status === 401 ? "Phiên đăng nhập hết hạn." :
      response.status === 403 ? "Không đủ quyền tra cứu nhật ký." :
      response.status === 400 ? "Mã hoặc phân trang không hợp lệ." :
      `Lỗi máy chủ (HTTP ${response.status}).`, response.status);
  }
  if (!object(body) || body.success !== true) throw new NotificationLogError("Phản hồi API không hợp lệ.", -1);
  return parseLogPage(body.data);
}
