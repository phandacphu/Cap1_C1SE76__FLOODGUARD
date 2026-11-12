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
const BASE_PATH = "/admin/safe-locations";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

function adminToken(): string {
  const token = localStorage.getItem("floodguard_token");
  if (!token) throw new ApiError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", 401);
  return token;
}

/** Strict API v2 envelope. Never fallback to the development fixture on failures. */
async function request(path: string, method: Method, token: string, body?: unknown): Promise<unknown> {
  if (!token) throw new ApiError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", 401);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  let result: unknown;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
      cache: "no-store",
    });
    try {
      result = await response.json();
    } catch {
      if (!response.ok) throw new ApiError(`Máy chủ trả lỗi HTTP ${response.status}.`, response.status);
      throw new ApiError("Phản hồi API không phải JSON hợp lệ.", 500);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError("Yêu cầu quá hạn. Cần đọc lại dữ liệu để đối chiếu; không tự gửi lại thao tác ghi.", 504);
    }
    throw new ApiError("Không thể kết nối máy chủ.", 0);
  } finally {
    clearTimeout(timeout);
  }

  const envelope = asRecord(result, response.status);
  if (!response.ok || envelope.success !== true) {
    throw new ApiError(
      typeof envelope.message === "string" && envelope.message ? envelope.message : `Máy chủ trả lỗi HTTP ${response.status}.`,
      response.status,
    );
  }
  const expected = method === "POST" ? 201 : 200;
  if (response.status !== expected) {
    throw new ApiError(`Máy chủ chưa xác nhận ${method} bằng HTTP ${expected}; cần đọc lại dữ liệu.`, response.status);
  }
  return envelope.data;
}

function asRecord(value: unknown, status = 500): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError("Phản hồi API sai định dạng.", status);
  }
  return value as Record<string, unknown>;
}

export function parseSafeLocation(raw: unknown): SafeLocation {
  const item = asRecord(raw);
  if (typeof item.id !== "string" || !item.id.trim()) {
    throw new ApiError("Địa điểm không có ID hợp lệ.", 500);
  }
  const position = item.location && typeof item.location === "object" && !Array.isArray(item.location)
    ? item.location as Record<string, unknown> : null;
  const location = position && typeof position.latitude === "number" && typeof position.longitude === "number"
    && validCoordinates({ latitude: position.latitude, longitude: position.longitude })
    ? { latitude: position.latitude, longitude: position.longitude } : null;
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

/** Shared by Dashboard and Admin management: only published non-deleted Admin results. */
export async function fetchAdminSafeLocations(token: string): Promise<SafeLocation[]> {
  const data = asRecord(await request(BASE_PATH, "GET", token));
  if (!Array.isArray(data.safeLocations)) throw new ApiError("API không trả data.safeLocations hợp lệ.", 500);
  return data.safeLocations.map(parseSafeLocation);
}

export async function fetchAdminSafeLocation(id: string, token: string): Promise<SafeLocation> {
  const data = asRecord(await request(`${BASE_PATH}/${encodeURIComponent(id)}`, "GET", token));
  return parseSafeLocation(data.safeLocation);
}

/** PATCH sends only fields differing from the original; location is always an entire pair. */
export function buildSafeLocationPatch(original: SafeLocation, next: SafeLocationFields): Partial<SafeLocationFields> {
  const patch: Partial<SafeLocationFields> = {};
  if (original.name !== next.name) patch.name = next.name;
  if (original.address !== next.address) patch.address = next.address;
  if (original.type !== next.type) patch.type = next.type;
  if (original.description !== next.description) patch.description = next.description;
  if (!original.location || original.location.latitude !== next.location.latitude || original.location.longitude !== next.location.longitude) {
    patch.location = { latitude: next.location.latitude, longitude: next.location.longitude };
  }
  return patch;
}

export const safeLocationApi: SafeLocationSource = {
  demo: false,
  list() { return fetchAdminSafeLocations(adminToken()); },
  get(id) { return fetchAdminSafeLocation(id, adminToken()); },
  async save(id, fields, original) {
    const token = adminToken();
    if (!id) {
      const data = asRecord(await request(BASE_PATH, "POST", token, fields));
      return parseSafeLocation(data.safeLocation);
    }
    const current = original && original.id === id ? original : await fetchAdminSafeLocation(id, token);
    const changes = buildSafeLocationPatch(current, fields);
    if (Object.keys(changes).length === 0) return fetchAdminSafeLocation(id, token);
    const data = asRecord(await request(`${BASE_PATH}/${encodeURIComponent(id)}`, "PATCH", token, changes));
    const saved = parseSafeLocation(data.safeLocation);
    if (saved.id !== id) throw new ApiError("Máy chủ trả ID khác bản ghi đã sửa. Hãy tải lại danh sách.", 500);
    return saved;
  },
  async remove(id) {
    const token = adminToken();
    const data = asRecord(await request(`${BASE_PATH}/${encodeURIComponent(id)}`, "DELETE", token));
    if (data.deleted !== true || data.id !== id) {
      throw new ApiError("Máy chủ chưa xác nhận xóa mềm; hãy tải lại danh sách để đối chiếu.", 500);
    }
  },
};
