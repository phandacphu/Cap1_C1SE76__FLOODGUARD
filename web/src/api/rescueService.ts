import type {
  RescueRequest,
  StatusHistoryItem,
  SosStatus,
  UrgencyLevel,
  Assignment,
} from "../types/rescue";

const RAW_API_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ||
  "https://floodguard-backend-demo.onrender.com/api";
const API_BASE = RAW_API_URL.replace(/\/+$/, "");

const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem("floodguard_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const rescueService = {
  // CCF-103, CCF-106, CCF-107: Lấy danh sách SOS kèm lọc và sắp xếp ưu tiên
  async getRescueRequests(params?: {
    status?: SosStatus;
    urgency?: UrgencyLevel;
    sort?: string;
  }): Promise<RescueRequest[]> {
    const query = new URLSearchParams();
    if (params?.status) query.append("status", params.status);
    if (params?.urgency) query.append("urgency", params.urgency);
    if (params?.sort) query.append("sort", params.sort);

    const queryString = query.toString() ? `?${query.toString()}` : "";
    const res = await fetch(`${API_BASE}/rescue-requests${queryString}`, {
      headers: getAuthHeaders(),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message || "Không thể tải danh sách SOS");
    return body.data.rescueRequests || [];
  },

  // Chi tiết SOS để kiểm tra assignment sau reload
  async getRescueDetail(requestId: string): Promise<RescueRequest> {
    const res = await fetch(`${API_BASE}/rescue-requests/${requestId}`, {
      headers: getAuthHeaders(),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message || "Không thể tải chi tiết SOS");
    return body.data.rescueRequest;
  },

  // CCF-108: Tiếp nhận SOS (Dành cho Rescue Staff)
  async acceptRequest(
    requestId: string,
  ): Promise<{ rescueRequest: RescueRequest; assignment: Assignment }> {
    const res = await fetch(`${API_BASE}/rescue-requests/${requestId}/accept`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({}),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message || "Tiếp nhận SOS thất bại");
    return body.data;
  },

  // CCF-109: Cập nhật trạng thái cứu hộ (in_progress -> assisted)
  async updateStatus(
    requestId: string,
    status: "in_progress" | "assisted",
    note?: string,
  ): Promise<{ rescueRequest: RescueRequest; assignment: Assignment }> {
    const res = await fetch(`${API_BASE}/rescue-requests/${requestId}/status`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        status,
        note: note && note.trim() ? note.trim() : null,
      }),
    });
    const body = await res.json();
    if (!res.ok)
      throw new Error(body.message || "Cập nhật trạng thái thất bại");
    return body.data;
  },

  // Lấy lịch sử trạng thái SOS
  async getHistory(requestId: string): Promise<StatusHistoryItem[]> {
    const res = await fetch(
      `${API_BASE}/rescue-requests/${requestId}/history`,
      {
        headers: getAuthHeaders(),
      },
    );
    const body = await res.json();
    if (!res.ok) throw new Error(body.message || "Không thể tải lịch sử SOS");
    return body.data.statusHistory || [];
  },
};
