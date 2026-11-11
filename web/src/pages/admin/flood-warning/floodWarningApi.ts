import { API_URL } from "../../../api/authApi";
import { ApiError } from "../../../api/http";
import { listAreas } from "../flood-area/floodAreaService";
import type { FloodWarning, FloodWarningSource, WarningFields } from "./floodWarningTypes";

const TIMEOUT_MS = 70_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readToken(): string {
  const token = localStorage.getItem("floodguard_token");
  if (!token) throw new ApiError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", 401);
  return token;
}

function parseWarning(value: unknown): FloodWarning {
  if (!isRecord(value) ||
      typeof value.id !== "string" || !value.id.trim() ||
      typeof value.title !== "string" ||
      typeof value.content !== "string" ||
      typeof value.areaId !== "string" ||
      !["low", "medium", "high", "critical"].includes(String(value.severity)) ||
      (value.status !== "active" && value.status !== "inactive") ||
      typeof value.startAt !== "string" ||
      typeof value.endAt !== "string") {
    throw new ApiError("Phản hồi cảnh báo lũ từ máy chủ không đúng cấu trúc.", 502);
  }
  return {
    id: value.id,
    title: value.title,
    content: value.content,
    areaId: value.areaId,
    severity: value.severity as FloodWarning["severity"],
    status: value.status,
    startAt: value.startAt,
    endAt: value.endAt,
  };
}

type Method = "GET" | "POST" | "PATCH";

async function callAdmin(path: string, method: Method, fields?: WarningFields): Promise<Record<string, unknown>> {
  const token = readToken();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(fields ? { "Content-Type": "application/json" } : {}),
      },
      body: fields ? JSON.stringify(fields) : undefined,
      signal: controller.signal,
    });

    const body: unknown = await response.json().catch(() => null);
    const message = isRecord(body) && typeof body.message === "string"
      ? body.message
      : `Lỗi máy chủ (${response.status}).`;
    if (!response.ok) throw new ApiError(message, response.status);
    if (!isRecord(body) || body.success !== true || !isRecord(body.data)) {
      throw new ApiError("Phản hồi từ máy chủ không đúng cấu trúc.", 502);
    }
    if (method === "POST" && response.status !== 201) {
      throw new ApiError("Máy chủ chưa xác nhận tạo cảnh báo (HTTP 201). Hãy tải lại trước khi thử lại.", 502);
    }
    return body.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) {
      throw new ApiError(
        "Kết nối quá hạn. Lệnh lưu có thể đã thành công; hãy tải lại danh sách trước khi thao tác tiếp, không tự gửi lại.",
        504,
      );
    }
    throw new ApiError("Không thể kết nối máy chủ.", 0);
  } finally {
    window.clearTimeout(timeout);
  }
}

export const floodWarningApi: FloodWarningSource = {
  demo: false,
  async list() {
    // Both Admin lists use the shared Backend and authenticated Admin token.
    const [data, areas] = await Promise.all([
      callAdmin("/admin/flood-alerts", "GET"),
      listAreas(),
    ]);
    if (!Array.isArray(data.floodAlerts)) {
      throw new ApiError("Danh sách cảnh báo trả về sai cấu trúc.", 502);
    }
    return {
      warnings: data.floodAlerts.map(parseWarning),
      areas: areas.map(({ id, name }) => ({ id, name })),
    };
  },
  async save(id, fields) {
    const path = id ? `/admin/flood-alerts/${encodeURIComponent(id)}` : "/admin/flood-alerts";
    const data = await callAdmin(path, id ? "PATCH" : "POST", fields);
    return parseWarning(data.floodAlert);
  },
};
