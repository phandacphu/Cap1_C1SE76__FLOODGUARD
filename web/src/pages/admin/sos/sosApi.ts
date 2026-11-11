import { apiGet, ApiError } from "../../../api/http";
import { parseApiDetail, parseApiList, parseApiSummary } from "./sosContract";
import type { SosFilters, SosItem, SosListData, SosSummary } from "./sosTypes";

/** Deliberately opt-in in development only. API errors never fall back to mock records. */
export const SOS_MOCK_ENABLED = import.meta.env.DEV && import.meta.env.VITE_ADMIN_SOS_MOCK === "true";

export function sosError(error: unknown): { status: number; message: string } {
  if (error instanceof ApiError) return { status: error.status, message: error.message };
  return { status: 0, message: error instanceof Error ? error.message : "Không tải được dữ liệu SOS." };
}

function requireToken(token: string | null): asserts token is string {
  if (!token) throw new ApiError("Phiên đăng nhập đã hết hạn.", 401);
}

async function mockData() {
  if (!SOS_MOCK_ENABLED) throw new Error("Chế độ dữ liệu mẫu chưa được bật.");
  return import("./sosMock");
}

/** Convert a selected Vietnam calendar day into an explicit inclusive UTC boundary. */
function dateBoundary(day: string, endOfDay: boolean): string {
  const hhmmss = endOfDay ? "23:59:59.999" : "00:00:00.000";
  const timestamp = new Date(`${day}T${hhmmss}+07:00`);
  if (!Number.isFinite(timestamp.getTime())) throw new ApiError("Ngày lọc SOS không hợp lệ.", 400);
  return timestamp.toISOString();
}

function sosQuery(filters: SosFilters): string {
  const query = new URLSearchParams();
  if (filters.condition !== "all") query.set("state", filters.condition);
  query.set("sort", filters.sort);
  if (filters.from) query.set("from", dateBoundary(filters.from, false));
  if (filters.to) query.set("to", dateBoundary(filters.to, true));
  return `?${query.toString()}`;
}

export async function fetchSosSummary(token: string | null, filters?: SosFilters): Promise<SosSummary> {
  requireToken(token);
  if (SOS_MOCK_ENABLED) {
    const mock = await mockData();
    return mock.summarizeMockSos(mock.filterMockSos(mock.getMockSos(), {
      ...(filters ?? { condition: "all", from: "", to: "", sort: "newest", search: "" }), search: "",
    }));
  }
  return parseApiSummary(await apiGet<unknown>(`/admin/rescue-requests/summary${filters ? sosQuery(filters) : ""}`, token));
}

export async function fetchSosList(token: string | null, filters: SosFilters): Promise<SosListData> {
  requireToken(token);
  if (SOS_MOCK_ENABLED) {
    const mock = await mockData();
    // Local text search is applied by the screen, not to the server-scope summary.
    const items = mock.filterMockSos(mock.getMockSos(), { ...filters, search: "" });
    return { items, summary: mock.summarizeMockSos(items), summaryError: null, source: "mock" };
  }
  const query = sosQuery(filters);
  // Both endpoints receive exactly the same server-side state/date/sort scope.
  const [list, summary] = await Promise.allSettled([
    apiGet<unknown>(`/admin/rescue-requests${query}`, token).then(parseApiList),
    fetchSosSummary(token, filters),
  ]);
  // Do not display stale rows after losing authentication/authorization.
  const accessFailure = [list, summary].find(result =>
    result.status === "rejected" && result.reason instanceof ApiError &&
    (result.reason.status === 401 || result.reason.status === 403));
  if (accessFailure?.status === "rejected") throw accessFailure.reason;
  if (list.status === "rejected") throw list.reason;
  if (summary.status === "rejected") throw summary.reason;
  // Independent reads can briefly differ if Rescue changes a status between requests.
  return { items: list.value, summary: summary.value, summaryError: null, source: "api" };
}

export async function fetchSosDetail(token: string | null, id: string): Promise<SosItem> {
  requireToken(token);
  if (SOS_MOCK_ENABLED) {
    const mock = await mockData();
    const item = mock.getMockSos().find(item => item.id === id);
    if (!item) throw new ApiError("SOS không tồn tại.", 404);
    return item;
  }
  const item = parseApiDetail(await apiGet<unknown>(`/admin/rescue-requests/${encodeURIComponent(id)}`, token));
  if (item.id !== id) throw new Error("Máy chủ trả về một SOS khác với yêu cầu.");
  return item;
}
