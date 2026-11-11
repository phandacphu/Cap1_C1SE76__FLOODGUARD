import { API_URL } from "../../../api/authApi";
import { ApiError } from "../../../api/http";
import {
  isSafeLocationType,
  validCoordinates,
  type SafeLocation,
  type SafeLocationFields,
  type SafeLocationSource,
} from "./safeLocationTypes";

const TIMEOUT_MS = 70_000;

function adminToken(): string {
  const token = localStorage.getItem("floodguard_token");
  if (!token) throw new ApiError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", 401);
  return token;
}

/** No mock fallback; errors must remain visible instead of becoming empty lists. */
async function request<T>(path: string, method: "GET" | "POST" | "PATCH" | "DELETE", body?: SafeLocationFields): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${adminToken()}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError("Kết nối quá hạn. Nếu vừa lưu hoặc xóa, hãy tải lại danh sách để xác minh trước khi thử lại.", 504);
    }
    throw new ApiError("Không thể kết nối máy chủ.", 0);
  } finally {
    window.clearTimeout(timeout);
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new ApiError(`Máy chủ trả dữ liệu không hợp lệ (HTTP ${response.status}).`, response.status);
  }
  if (typeof result !== "object" || result === null) {
    throw new ApiError("Phản hồi API sai định dạng.", response.status);
  }
  const envelope = result as { success?: unknown; message?: unknown; data?: unknown };
  if (!response.ok || envelope.success !== true) {
    throw new ApiError(
      typeof envelope.message === "string" && envelope.message ? envelope.message : `Máy chủ trả lỗi HTTP ${response.status}.`,
      response.status,
    );
  }
  if (method === "POST" && response.status !== 201) {
    throw new ApiError("Máy chủ chưa xác nhận tạo địa điểm (HTTP 201). Hãy tải lại danh sách trước khi thử lại.", response.status);
  }
  return envelope.data as T;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApiError("Cấu trúc dữ liệu địa điểm từ API không hợp lệ.", 500);
  }
  return value as Record<string, unknown>;
}

function parseSafeLocation(raw: unknown): SafeLocation {
  const item = asRecord(raw);
  if (typeof item.id !== "string" || !item.id.trim()) {
    throw new ApiError("Địa điểm trả về không có ID hợp lệ.", 500);
  }
  const point = item.location;
  const coordinates = point && typeof point === "object" && !Array.isArray(point)
    ? point as Record<string, unknown>
    : null;
  const location = coordinates &&
    typeof coordinates.latitude === "number" && typeof coordinates.longitude === "number" &&
    validCoordinates({ latitude: coordinates.latitude, longitude: coordinates.longitude })
    ? { latitude: coordinates.latitude, longitude: coordinates.longitude }
    : null;
  return {
    id: item.id,
    name: typeof item.name === "string" ? item.name : "",
    address: typeof item.address === "string" ? item.address : "",
    location,
    type: isSafeLocationType(item.type) ? item.type : null,
    description: typeof item.description === "string" ? item.description : null,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : null,
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : null,
  };
}

const basePath = "/admin/safe-locations";

export const safeLocationApi: SafeLocationSource = {
  demo: false,
  async list() {
    const data = asRecord(await request<unknown>(basePath, "GET"));
    if (!Array.isArray(data.safeLocations)) {
      throw new ApiError("API không trả mảng data.safeLocations.", 500);
    }
    return data.safeLocations.map(parseSafeLocation);
  },
  async save(id, fields) {
    const path = id ? `${basePath}/${encodeURIComponent(id)}` : basePath;
    const data = asRecord(await request<unknown>(path, id ? "PATCH" : "POST", fields));
    return parseSafeLocation(data.safeLocation);
  },
  async remove(id) {
    const data = asRecord(await request<unknown>(`${basePath}/${encodeURIComponent(id)}`, "DELETE"));
    if (data.deleted !== true || data.id !== id) {
      throw new ApiError("Máy chủ chưa xác nhận xóa mềm. Hãy làm mới danh sách để kiểm tra.", 500);
    }
  },
};
