import type { DirectSosDetail, DirectSosFilters, DirectSosRequest } from '../types/rescueDirect';
import { directSosQuery, isRecord, parseDirectHistory, parseDirectList, parseDirectSos } from './rescueDirectContract';

const RAW_API_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ||
  'https://floodguard-backend-demo.onrender.com/api/';
const API_BASE = RAW_API_URL.replace(/\/+$/, '');
const TIMEOUT_MS = 70_000;

export class RescueApiError extends Error {
  status: number;
  code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'RescueApiError';
  }
}

async function request(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, TIMEOUT_MS);
  try {
    const token = localStorage.getItem('floodguard_token');
    if (!token) throw new RescueApiError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 401);
    const response = await fetch(API_BASE + path, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = response.status === 401 ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
        : response.status === 403 ? (init.method === 'PATCH'
          ? 'Máy chủ từ chối quyền xác nhận đã cứu.'
          : 'Tài khoản không có quyền truy cập hoặc không còn hoạt động.')
        : response.status === 404 ? 'Yêu cầu SOS không tồn tại.'
        : isRecord(body) && typeof body.message === 'string' ? body.message : `Lỗi máy chủ (${response.status}).`;
      throw new RescueApiError(message, response.status,
        isRecord(body) && typeof body.code === 'string' ? body.code : null);
    }
    if (!isRecord(body) || body.success !== true || !isRecord(body.data)) {
      throw new RescueApiError('Phản hồi SOS sai cấu trúc.', 502);
    }
    return body.data;
  } catch (error) {
    if (error instanceof RescueApiError) throw error;
    if (signal?.aborted) throw error;
    throw new RescueApiError('Mất kết nối hoặc hết thời gian chờ máy chủ.', 0);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export const rescueService = {
  async getRescueRequests(filters: DirectSosFilters = {}, signal?: AbortSignal) {
    const query = directSosQuery(filters);
    const data = await request('/rescue-requests' + (query ? '?' + query : ''), {}, signal);
    const items = parseDirectList(data.rescueRequests);
    if (filters.state && items.some(item => item.state !== filters.state)) {
      throw new RescueApiError('API trả SOS không khớp nhóm đang chọn.', 502);
    }
    return items;
  },
  async getRescueDetail(id: string, signal?: AbortSignal) {
    const data = await request('/rescue-requests/' + encodeURIComponent(id), {}, signal);
    const item = parseDirectSos(data.rescueRequest);
    if (item.id !== id) throw new RescueApiError('API trả sai mã SOS.', 502);
    let statusHistory = null;
    let historyError = null;
    try {
      if (!isRecord(data.rescueRequest)) throw new Error('Chi tiết SOS sai cấu trúc.');
      statusHistory = parseDirectHistory(data.rescueRequest.statusHistory);
    } catch {
      historyError = 'Chưa đọc được lịch sử trong chi tiết SOS. Hãy làm mới để thử lại.';
    }
    return { ...item, statusHistory, historyError } satisfies DirectSosDetail;
  },
  async getHistory(id: string, signal?: AbortSignal) {
    const data = await request('/rescue-requests/' + encodeURIComponent(id) + '/history', {}, signal);
    if (data.requestId !== id) throw new RescueApiError('API trả sai mã lịch sử SOS.', 502);
    return parseDirectHistory(data.statusHistory);
  },
  async completeRequest(id: string, note: string) {
    const trimmed = note.trim();
    if (trimmed.length > 200) throw new RescueApiError('Ghi chú tối đa 200 đơn vị UTF-16 sau khi bỏ khoảng trắng đầu/cuối.', 400);
    const data = await request('/rescue-requests/' + encodeURIComponent(id) + '/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'assisted', note: trimmed || null }),
    });
    let item: DirectSosRequest;
    try {
      item = parseDirectSos(data.rescueRequest);
    } catch {
      // HTTP 200 may follow a committed write even when its body is unusable.
      throw new RescueApiError('Phản hồi xác nhận không hợp lệ. Cần đọc lại SOS.', 502);
    }
    if (item.id !== id || item.state !== 'rescued' || item.status !== 'assisted') {
      throw new RescueApiError('Máy chủ chưa xác nhận trạng thái đã cứu.', 502);
    }
    return item;
  },
};

export interface CompletionResult {
  kind: 'confirmed' | 'reconciled';
  request: DirectSosRequest;
  message: string;
}

/** Never repeat a write after an uncertain response or a concurrent completion. */
export async function confirmRescued(id: string, note: string): Promise<CompletionResult> {
  try {
    const item = await rescueService.completeRequest(id, note);
    return { kind: 'confirmed', request: item, message: 'Máy chủ đã xác nhận hoàn tất cứu hộ.' };
  } catch (error) {
    const reconcile = error instanceof RescueApiError &&
      (error.status === 0 || error.status >= 500 ||
        (error.status === 409 && error.code === 'STATUS_TRANSITION_CONFLICT'));
    if (!reconcile) throw error;
    let item: DirectSosRequest;
    try {
      item = await rescueService.getRescueDetail(id);
    } catch (readError) {
      if (readError instanceof RescueApiError && [401, 403, 404].includes(readError.status)) throw readError;
      throw new RescueApiError('Chưa xác định được kết quả. Hãy làm mới chi tiết trước khi xác nhận lại.', 0);
    }
    if (item.state !== 'active' && item.state !== 'rescued') {
      throw new RescueApiError('Chưa xác định được trạng thái sau xác nhận. Hãy làm mới chi tiết trước khi thử lại.', 0);
    }
    return {
      kind: 'reconciled',
      request: item,
      message: item.state === 'rescued'
        ? 'Đã đọc lại kết quả máy chủ: SOS đã được cứu. Xem người xác nhận và thời gian bên dưới.'
        : 'Máy chủ chưa xác nhận đã cứu. Đã tải lại chi tiết; hãy kiểm tra trước khi thao tác lại.',
    };
  }
}
