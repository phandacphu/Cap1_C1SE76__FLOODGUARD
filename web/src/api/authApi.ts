import type { User, UserRole } from "../types/auth";

/**
 * CCF-39: login API for the web dashboard.
 * Backend contract (backend/src/controllers/auth.controller.js):
 *   POST {API_URL}/auth/login   body: { identifier, password }  (identifier = email or phone number)
 *   200 -> { success, message, data: { token, user } }
 *   400 missing fields | 401 wrong credentials | 403 inactive account | 500 server error
 */
const API_URL = (
  import.meta.env.VITE_API_URL ?? "https://floodguard-backend-demo.onrender.com/api"
).replace(/\/+$/, "");

// The Render free plan can need ~1 minute to wake up after being idle.
const TIMEOUT_MS = 70_000;

export const FORBIDDEN_MESSAGE = "Tài khoản không có quyền truy cập web dashboard";

/** An error whose message is safe to show directly to the user. */
export class AuthError extends Error {}

interface LoginResponse {
  data?: {
    token?: unknown;
    user?: Record<string, unknown>;
  };
}

/** Backend stores roles in lowercase ("resident", "admin"); the web uses UPPERCASE. */
export function normalizeRole(raw: unknown): UserRole | null {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (value === "admin") return "ADMIN";
  if (value === "rescue_staff" || value === "rescue") return "RESCUE_STAFF";
  if (value === "resident") return "RESIDENT";
  return null;
}

/** Only Admin and Rescue Staff may use the web dashboard. */
export function isWebRole(role: UserRole): boolean {
  return role === "ADMIN" || role === "RESCUE_STAFF";
}

/** Landing page after login (must match the routes in App.tsx). */
export function homePathForRole(role: UserRole): string {
  if (role === "ADMIN") return "/admin/dashboard";
  if (role === "RESCUE_STAFF") return "/rescue/dashboard";
  return "/unauthorized";
}

export async function loginRequest(
  identifier: string,
  password: string,
): Promise<{ token: string; user: User }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: identifier.trim(),
        password,
      }),
      signal: controller.signal,
    });
  } catch {
    throw new AuthError("Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.");
  } finally {
    window.clearTimeout(timer);
  }

  const body: LoginResponse | null = await response
    .json()
    .then((json: LoginResponse) => json)
    .catch(() => null);

  if (!response.ok) {
    if (response.status === 400) throw new AuthError("Vui lòng nhập email hoặc số điện thoại và mật khẩu");
    if (response.status === 401) throw new AuthError("Email hoặc mật khẩu không đúng");
    if (response.status === 403) {
      throw new AuthError("Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.");
    }
    throw new AuthError("Máy chủ gặp lỗi. Vui lòng thử lại sau.");
  }

  const token = body?.data?.token;
  const rawUser = body?.data?.user;
  if (typeof token !== "string" || !rawUser) {
    throw new AuthError("Phản hồi từ máy chủ không hợp lệ.");
  }

  const role = normalizeRole(rawUser.role);
  if (!role) throw new AuthError(FORBIDDEN_MESSAGE);

  return {
    token,
    user: {
      id: String(rawUser.id ?? ""),
      email: String(rawUser.email ?? (identifier.includes("@") ? identifier.trim() : "")),
      fullName: String(rawUser.fullName ?? ""),
      role,
    },
  };
}
