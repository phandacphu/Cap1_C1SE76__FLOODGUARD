import { API_URL, normalizeRole } from "../../api/authApi";
import type { UserRole } from "../../types/auth";

export interface UserProfile {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  role: UserRole;
  isActive: boolean | null;
}

export class ProfileApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ProfileApiError";
    this.status = status;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

export async function fetchMyProfile(
  token: string,
  signal?: AbortSignal,
): Promise<UserProfile> {
  const controller = new AbortController();
  const abort = () => controller.abort();

  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });

  const timer = window.setTimeout(abort, 70_000);

  try {
    const response = await fetch(`${API_URL}/auth/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const messages: Record<number, string> = {
        401: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
        403: "Tài khoản không được phép truy cập. Vui lòng liên hệ quản trị viên.",
        404: "Không tìm thấy thông tin tài khoản.",
      };

      throw new ProfileApiError(
        messages[response.status] ??
          "Máy chủ gặp lỗi. Vui lòng thử lại sau.",
        response.status,
      );
    }

    const body = asRecord(await response.json().catch(() => null));
    const data = asRecord(body?.data);
    const raw = asRecord(data?.user);
    const id = asText(raw?.id);
    const role = normalizeRole(raw?.role);

    if (!raw || !id || !role) {
      throw new ProfileApiError(
        "Phản hồi hồ sơ từ máy chủ không hợp lệ.",
        -1,
      );
    }

    return {
      id,
      fullName: asText(raw.fullName),
      email: asText(raw.email),
      phone: asText(raw.phone),
      role,
      isActive:
        typeof raw.isActive === "boolean" ? raw.isActive : null,
    };
  } catch (error) {
    if (error instanceof ProfileApiError || signal?.aborted) {
      throw error;
    }

    throw new ProfileApiError(
      "Không thể tải hồ sơ. Kiểm tra kết nối mạng và thử lại.",
      0,
    );
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}