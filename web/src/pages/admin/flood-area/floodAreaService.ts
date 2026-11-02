import { FloodAreaError, type FloodAreaInput, type FloodAreaItem } from "./floodAreaTypes";

export const DATA_SOURCE: "mock" | "api" = "api";

const API_BASE_URL = import.meta.env.VITE_API_URL || "https://floodguard-backend-demo.onrender.com/api";
const TIMEOUT_MS = 70000;

function getAuthHeaders() {
  const token = localStorage.getItem("floodguard_token");
  if (!token) throw new FloodAreaError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", 401);
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function fetchApi(endpoint: string, options: RequestInit, isMutation: boolean, expectedStatus?: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      signal: controller.signal,
    });

    if (!response.ok || (expectedStatus && response.status !== expectedStatus)) {
      let errorMessage = "Đã xảy ra lỗi khi kết nối với máy chủ.";
      try {
        const errorData = await response.json();
        if (errorData && errorData.message) {
          errorMessage = errorData.message;
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") throw err;
      }

      if (response.status === 409) {
        throw new FloodAreaError("Vùng này đang được liên kết với một cảnh báo lũ. Hãy chuyển sang ngừng hoạt động thay vì xóa.", 409);
      }

      throw new FloodAreaError(errorMessage, response.status);
    }

    let data;
    try {
      data = await response.json();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      throw new FloodAreaError("Phản hồi từ máy chủ sai định dạng (không phải JSON).", 500);
    }

    if (data.success !== true) {
      throw new FloodAreaError(data.message || "Thao tác không thành công.", response.status || 500);
    }

    clearTimeout(timeoutId);
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      const timeoutMsg = isMutation
        ? "Kết nối máy chủ bị quá hạn. Kết quả có thể chưa xác định, vui lòng làm mới dữ liệu (refresh) trước khi thực hiện lại để tránh trùng lặp thao tác."
        : "Kết nối máy chủ bị quá hạn (Timeout). Vui lòng thử lại.";
      throw new FloodAreaError(timeoutMsg, 504);
    }
    if (error instanceof FloodAreaError) throw error;
    throw new FloodAreaError("Không thể kết nối đến máy chủ.", 500);
  }
}

function pickInput(input: Partial<FloodAreaInput>): Partial<FloodAreaInput> {
  const allowed: (keyof FloodAreaInput)[] = ["name", "description", "severity", "status", "source", "geometry"];
  const result: Record<string, unknown> = {};
  for (const key of allowed) {
    if (input[key] !== undefined) {
      result[key] = input[key];
    }
  }
  return result as Partial<FloodAreaInput>;
}

// Kiểm tra toàn diện cấu trúc của một vùng ngập (bằng kiểu unknown an toàn)
function validateAreaItem(data: unknown): data is FloodAreaItem {
  if (!data || typeof data !== "object") return false;
  
  const a = data as Record<string, unknown>;
  
  if (typeof a.id !== "string" || a.id.trim() === "") return false;
  if (typeof a.name !== "string" || a.name.trim() === "") return false;
  
  const validSeverities = ["low", "medium", "high", "critical"];
  if (typeof a.severity !== "string" || !validSeverities.includes(a.severity)) return false;
  
  const validStatuses = ["active", "inactive"];
  if (typeof a.status !== "string" || !validStatuses.includes(a.status)) return false;
  
  const geo = a.geometry as Record<string, unknown>;
  if (!geo || typeof geo !== "object" || geo.type !== "polygon") return false;
  if (!Array.isArray(geo.points)) return false;
  
  for (const p of geo.points) {
    if (!p || typeof p !== "object") return false;
    const pt = p as Record<string, unknown>;
    if (typeof pt.latitude !== "number" || typeof pt.longitude !== "number") return false;
  }
  
  return true;
}

export async function listAreas(): Promise<FloodAreaItem[]> {
  const data = await fetchApi("/admin/flood-areas", { method: "GET", headers: getAuthHeaders() }, false);
  
  const areas = data?.data?.floodAreas;
  if (!Array.isArray(areas)) {
    throw new FloodAreaError("Dữ liệu danh sách vùng ngập sai cấu trúc.", 500);
  }

  for (let i = 0; i < areas.length; i++) {
    if (!validateAreaItem(areas[i])) {
      throw new FloodAreaError("Một số vùng ngập bị lỗi dữ liệu hoặc thiếu trường quan trọng từ hệ thống.", 500);
    }
  }

  return areas;
}

export async function createArea(input: FloodAreaInput): Promise<FloodAreaItem> {
  const payload = pickInput(input);
  const data = await fetchApi("/admin/flood-areas", { 
    method: "POST", 
    headers: getAuthHeaders(),
    body: JSON.stringify(payload)
  }, true, 201); 

  const floodArea = data?.data?.floodArea;
  
  if (!validateAreaItem(floodArea)) {
    throw new FloodAreaError("Dữ liệu vùng ngập trả về sai cấu trúc hoặc thiếu trường quan trọng.", 500);
  }
  return floodArea;
}

export async function updateArea(id: string, patch: Partial<FloodAreaInput>): Promise<FloodAreaItem> {
  const payload = pickInput(patch);
  const data = await fetchApi(`/admin/flood-areas/${id}`, { 
    method: "PATCH", 
    headers: getAuthHeaders(),
    body: JSON.stringify(payload)
  }, true);

  const floodArea = data?.data?.floodArea;
  
  if (!validateAreaItem(floodArea)) {
    throw new FloodAreaError("Dữ liệu cập nhật trả về sai cấu trúc hoặc thiếu trường quan trọng.", 500);
  }
  return floodArea;
}

export async function deleteArea(id: string): Promise<void> {
  await fetchApi(`/admin/flood-areas/${id}`, { 
    method: "DELETE", 
    headers: getAuthHeaders() 
  }, true);
}