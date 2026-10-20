import { API_URL } from "./authApi";

/** An HTTP/network failure whose message is safe to show to the user. */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const TIMEOUT_MS = 70_000; // Render free plan can take ~1 minute to wake up.

/** GET `${API_URL}${path}` and return `response.data`. Throws ApiError on failure. */
export async function apiGet<T>(path: string, token?: string | null): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError("Không thể kết nối máy chủ.", 0);
  } finally {
    window.clearTimeout(timer);
  }

  const body: { message?: string; data?: T } | null = await response
    .json()
    .then((json: { message?: string; data?: T }) => json)
    .catch(() => null);

  if (!response.ok || !body) {
    throw new ApiError(body?.message || `Lỗi máy chủ (${response.status}).`, response.status);
  }

  return body.data as T;
}
