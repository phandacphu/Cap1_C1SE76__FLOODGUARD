import type { FloodArea } from '../types/floodArea';

export const floodAreaService = {
  async getFloodAreas(token: string | null): Promise<FloodArea[]> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch('/api/flood-areas', {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Máy chủ trả về mã lỗi HTTP ${response.status} (${response.statusText})`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error('Định dạng dữ liệu trả về từ máy chủ không phải JSON hợp lệ');
    }

    // Kiểm tra cấu trúc API trả về: hỗ trợ dạng mảng trực tiếp hoặc bọc trong thuộc tính data
    let areaList: unknown = payload;
    if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'data' in payload) {
      areaList = (payload as { data: unknown }).data;
    }

    if (!Array.isArray(areaList)) {
      throw new Error('Dữ liệu API vùng ngập không đúng cấu trúc danh sách (Array)');
    }

    return areaList as FloodArea[];
  },
};
