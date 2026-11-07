import { apiGet, ApiError } from "../../../api/http";
import { parseApiDetail, parseApiList, parseApiSummary } from "./sosContract";
import type { SosFilters, SosItem, SosListData, SosSummary } from "./sosTypes";

/** Explicit opt-in. Vite eliminates the mock import from a production build. */
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

export async function fetchSosSummary(token: string | null): Promise<SosSummary> {
  requireToken(token);
  if (SOS_MOCK_ENABLED) {
    const mock = await mockData();
    return mock.summarizeMockSos(mock.getMockSos());
  }
  return parseApiSummary(await apiGet<unknown>("/admin/rescue-requests/summary", token));
}

export async function fetchSosList(token: string | null, filters: SosFilters): Promise<SosListData> {
  requireToken(token);
  if (SOS_MOCK_ENABLED) {
    const mock = await mockData();
    const items = mock.filterMockSos(mock.getMockSos(), filters);
    return { items, summary: mock.summarizeMockSos(items), summaryError: null, source: "mock" };
  }
  if (filters.condition !== "all" || filters.from || filters.to || filters.search.trim()) {
    throw new Error("Bộ lọc này đang chờ API hỗ trợ.");
  }
  // Both requests refer to the whole dataset; sort affects only ordering.
  const [list, summary] = await Promise.allSettled([
    apiGet<unknown>(`/admin/rescue-requests?sort=${filters.sort}`, token).then(parseApiList),
    fetchSosSummary(token),
  ]);
  if (list.status === "rejected") throw list.reason;
  if (summary.status === "rejected") {
    const error = sosError(summary.reason);
    if (error.status === 401 || error.status === 403) throw summary.reason;
    return { items: list.value, summary: null, summaryError: error, source: "api" };
  }
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
