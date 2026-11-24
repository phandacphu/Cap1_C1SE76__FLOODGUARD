import { API_URL } from "../../../api/authApi";
import { ApiError } from "../../../api/http";
import type { FloodWarning, WarningFields, WarningSource, WarningStatus, WarningSummary } from "./floodWarningTypes";

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function incompatible(): never { throw new ApiError("Phản hồi không đúng schema cảnh báo V2, không thể xem là dữ liệu trống.", 502); }
export function parseWarning(v: unknown): FloodWarning {
  if (!object(v) || v.schemaVersion !== 2 || typeof v.id !== "string" || !v.id ||
    typeof v.title !== "string" || !v.title.trim() || typeof v.content !== "string" || !v.content.trim() ||
    !["active", "inactive"].includes(String(v.status)) || v.scope !== "all_published_zones" ||
    !Number.isSafeInteger(v.revision) || (v.revision as number) < 1 ||
    ![v.startAt, v.createdAt, v.updatedAt].every((t) => typeof t === "string" && Number.isFinite(Date.parse(t))) ||
    (v.status === "active" ? v.endAt !== null : typeof v.endAt !== "string" || !Number.isFinite(Date.parse(v.endAt))) ||
    (typeof v.endAt === "string" && Date.parse(v.endAt) < Date.parse(v.startAt as string))) incompatible();
  return v as unknown as FloodWarning;
}
function matchingAlert(value: unknown, requestedId: string): FloodWarning {
  const result = parseWarning(value);
  if (result.id !== requestedId) incompatible();
  return result;
}
export class WarningRequestError extends ApiError {
  readonly code: string;
  readonly uncertain: boolean;
  constructor(message: string, status: number, code: string, uncertain = false) { super(message, status); this.code = code; this.uncertain = uncertain; }
}
async function call(path: string, method = "GET", payload?: object, key?: string): Promise<Record<string, unknown>> {
  const token = localStorage.getItem("floodguard_token");
  if (!token) throw new WarningRequestError("Phiên đăng nhập đã hết hạn.", 401, "AUTH_REQUIRED");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method, signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, ...(payload ? { "Content-Type": "application/json" } : {}), ...(key ? { "Idempotency-Key": key } : {}) },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const json: unknown = await response.json().catch(() => null);
    const message = object(json) && typeof json.message === "string" ? json.message : `HTTP ${response.status}`;
    const code = object(json) && typeof json.code === "string" ? json.code : "HTTP_ERROR";
    if (!response.ok) throw new WarningRequestError(message, response.status, code);
    if (!object(json) || json.success !== true || !object(json.data)) incompatible();
    return json.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new WarningRequestError(controller.signal.aborted ? "Kết nối quá thời gian; kết quả chưa rõ." : "Mất kết nối; kết quả chưa rõ.", controller.signal.aborted ? 504 : 0, "NETWORK_UNCERTAIN", method !== "GET");
  } finally { clearTimeout(timer); }
}
const route = (id: string) => `/admin/flood-alerts/${encodeURIComponent(id)}`;
export const floodWarningApi: WarningSource = {
  demo: false,
  async list(status?: WarningStatus, q?: string) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q?.trim()) params.set("q", q.trim());
    const data = await call(`/admin/flood-alerts${params.size ? `?${params}` : ""}`);
    if (data.schemaVersion !== 2 || !Array.isArray(data.floodAlerts)) incompatible();
    const alerts = data.floodAlerts.map(parseWarning);
    if (new Set(alerts.map((alert) => alert.id)).size !== alerts.length) incompatible();
    return alerts;
  },
  async summary() {
    const data = await call("/admin/flood-alerts/summary");
    if (data.schemaVersion !== 2 || ![data.total, data.active, data.inactive].every((n) => Number.isSafeInteger(n) && (n as number) >= 0) ||
      (data.total as number) !== (data.active as number) + (data.inactive as number)) incompatible();
    return data as unknown as WarningSummary;
  },
  async detail(id) { return matchingAlert((await call(route(id))).floodAlert, id); },
  async create(fields: WarningFields, key: string) { return parseWarning((await call("/admin/flood-alerts", "POST", fields, key)).floodAlert); },
  async creationRequest(key) {
    const data = await call(`/admin/flood-alerts/creation-requests/${encodeURIComponent(key)}`);
    if (data.requestId !== key) incompatible();
    return parseWarning(data.floodAlert);
  },
  async update(id, revision, fields) { return matchingAlert((await call(route(id), "PATCH", { expectedRevision: revision, ...fields })).floodAlert, id); },
  async deactivate(id) { return matchingAlert((await call(`${route(id)}/deactivate`, "POST", {})).floodAlert, id); },
};
