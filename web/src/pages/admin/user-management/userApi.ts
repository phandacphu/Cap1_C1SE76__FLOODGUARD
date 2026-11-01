// File: web/src/pages/admin/user-management/userApi.ts
// CCF-123: Admin User Management API (GET /admin/users, PATCH /admin/users/:userId).

import { API_URL } from "../../../api/authApi";

/** Roles used by the Backend (lowercase). The Web's own ADMIN / RESCUE_STAFF format is never sent. */
export type UserRole = "resident" | "rescue" | "admin";
export const USER_ROLES: UserRole[] = ["resident", "rescue", "admin"];

/** Account as returned by the Backend. Every field except `id` may be missing or null. */
export interface User {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  /** Normally a UserRole; kept as a string so an unexpected value never crashes the UI. */
  role: string | null;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

/** Only these two fields may be sent in PATCH. */
export interface UserPatch {
  role?: UserRole;
  isActive?: boolean;
}

/** API failure. status 0 = no response (offline / server asleep); -1 = response had the wrong shape. */
export class UserApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "UserApiError";
    this.status = status;
  }
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/** Turns one raw API item into a User, or null when it has no usable id. */
export function normalizeUser(raw: unknown): User | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  if (!id) return null;
  const role = str(r.role);
  return {
    id,
    fullName: str(r.fullName),
    email: str(r.email),
    phone: str(r.phone),
    role: role ? role.toLowerCase() : null,
    isActive: r.isActive === true,
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
  };
}

const TIMEOUT_MS = 70_000; // Render free plan can take ~1 minute to wake up.

async function call(
  method: "GET" | "PATCH",
  path: string,
  token: string,
  body?: unknown,
): Promise<{ data?: Record<string, unknown> } | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new UserApiError("Không thể kết nối máy chủ.", 0);
  } finally {
    window.clearTimeout(timer);
  }

  const json: { message?: string; data?: Record<string, unknown> } | null = await response
    .json()
    .then((j: { message?: string; data?: Record<string, unknown> }) => j)
    .catch(() => null);

  if (!response.ok) {
    throw new UserApiError(json?.message || `Lỗi máy chủ (${response.status}).`, response.status);
  }
  return json;
}

/** GET /admin/users. A 200 without `data.users` is an API-shape error, never "no users". */
export async function fetchUsers(token: string): Promise<User[]> {
  const json = await call("GET", "/admin/users", token);
  const list = json?.data?.users;
  if (!Array.isArray(list)) {
    throw new UserApiError("API trả về dữ liệu sai cấu trúc (thiếu data.users).", -1);
  }
  return list.map(normalizeUser).filter((u): u is User => u !== null);
}

/** PATCH /admin/users/:userId. Returns the updated user from `data.user`. */
export async function patchUser(token: string, id: string, patch: UserPatch): Promise<User> {
  const json = await call("PATCH", `/admin/users/${encodeURIComponent(id)}`, token, patch);
  const user = normalizeUser(json?.data?.user);
  if (!user) throw new UserApiError("API trả về dữ liệu sai cấu trúc (thiếu data.user).", -1);
  return user;
}

/** Vietnamese message for a failed call (the Backend's own message is appended when it has one). */
export function describeUserError(err: unknown, fallback: string): string {
  if (!(err instanceof UserApiError)) return err instanceof Error ? err.message : fallback;
  const detail = err.message ? ` (${err.message})` : "";
  switch (err.status) {
    case 0:
      return "Không thể kết nối máy chủ. Kiểm tra mạng hoặc thử lại sau ít phút.";
    case -1:
      return err.message;
    case 400:
      return `Dữ liệu gửi lên không hợp lệ${detail}.`;
    case 401:
      return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    case 403:
      return `Không đủ quyền, tài khoản đã bị khóa hoặc đang tự sửa chính mình${detail}.`;
    case 404:
      return "Không tìm thấy người dùng này (có thể đã bị xóa).";
    default:
      return err.status >= 500 ? `Máy chủ gặp lỗi (${err.status}). Vui lòng thử lại sau.` : err.message || fallback;
  }
}
