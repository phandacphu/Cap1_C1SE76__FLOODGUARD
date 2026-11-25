import { API_URL } from "../../../api/authApi";
import {
  parseWarningList,
  parseWarningDetail,
  parseZoneBundle,
  WarningReadError,
} from "./warningData";
import type { RescueWarningSource, WarningFilters } from "./warningData";

/** Read-only V2 adapter. JWT belongs to this source instance, never a later localStorage session. */
export function createRescueWarningApi(
  token: string | null,
  baseUrl = API_URL,
  fetcher: typeof fetch = fetch,
  timeoutMs = 70_000,
): RescueWarningSource {
  const base = baseUrl.replace(/\/+$/, "");
  async function get(path: string, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted();
    if (!token)
      throw new WarningReadError(
        "Vui lòng đăng nhập lại.",
        401,
        "AUTH_REQUIRED",
      );
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(`${base}/flood-alerts${path}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal: controller.signal,
        cache: "no-store",
      });
      const body: unknown = await response.json().catch((error) => {
        if (controller.signal.aborted) throw error;
        return null;
      });
      signal.throwIfAborted();
      if (controller.signal.aborted) throw new Error("Request timed out");
      if (!response.ok) {
        const code =
          body &&
          typeof body === "object" &&
          "code" in body &&
          typeof body.code === "string"
            ? body.code
            : "HTTP_ERROR";
        const message =
          response.status === 401
            ? "Phiên đăng nhập hết hạn hoặc tài khoản không còn tồn tại."
            : response.status === 403
              ? code === "ACCOUNT_INACTIVE"
                ? "Tài khoản đã bị ngừng hoạt động. Vui lòng liên hệ quản trị viên."
                : "Tài khoản không có quyền xem dữ liệu cảnh báo."
              : response.status === 404
                ? "Bản tin này không còn mở được (404). Hãy trở về danh sách."
                : response.status === 503
                  ? "Chưa tải được nguồn dữ liệu vùng. Chưa thể xác định đầy đủ các vùng."
                  : response.status === 400
                    ? "Tham số yêu cầu cảnh báo không hợp lệ."
                    : "Máy chủ chưa xử lý được yêu cầu. Vui lòng thử lại.";
        throw new WarningReadError(message, response.status, code);
      }
      return body;
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof WarningReadError) throw error;
      throw new WarningReadError(
        controller.signal.aborted
          ? "Đã hết thời gian chờ máy chủ. Vui lòng thử lại."
          : "Mất kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.",
        0,
        "NETWORK_ERROR",
      );
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  }
  function query(filters: WarningFilters = {}) {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.q?.trim()) params.set("q", filters.q.trim());
    return params.size ? `?${params}` : "";
  }
  return {
    demo: false,
    async list(signal, filters) {
      const rows = parseWarningList(await get(query(filters), signal));
      if (filters?.status && rows.some((row) => row.status !== filters.status))
        throw new WarningReadError("Phản hồi không khớp bộ lọc trạng thái V2.");
      return rows;
    },
    async active(signal) {
      const rows = parseWarningList(await get("/active", signal));
      if (rows.some((row) => row.status !== "active"))
        throw new WarningReadError(
          "Phản hồi active chứa bản tin không đang bật.",
        );
      return rows;
    },
    async detail(id, signal) {
      return parseWarningDetail(
        await get(`/${encodeURIComponent(id)}`, signal),
        id,
      );
    },
    async zones(signal) {
      return parseZoneBundle(await get("/zones", signal));
    },
  };
}
