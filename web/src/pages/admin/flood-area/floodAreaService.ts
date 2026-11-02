import { FloodAreaError, type FloodAreaInput, type FloodAreaItem } from "./floodAreaTypes";

export const DATA_SOURCE: "mock" | "api" = "api";

const API_BASE_URL = import.meta.env.VITE_API_URL || "https://floodguard-backend-demo.onrender.com/api";
const TIMEOUT_MS = 70000; // Cập nhật timeout 70s đồng bộ với Web login

function getAuthHeaders() {
  const token = localStorage.getItem("floodguard_token");
  if (!token) throw new FloodAreaError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", 401);
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// Gộp chung fetch và xử lý response để AbortController bao phủ cả quá trình parse JSON
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
      } catch {
        // Bỏ qua nếu response lỗi không chứa JSON hợp lệ
      }

      if (response.status === 409) {
        throw new FloodAreaError("Vùng này đang được liên kết với một cảnh báo lũ. Hãy chuyển sang ngừng hoạt động thay vì xóa.", 409);
      }

      throw new FloodAreaError(errorMessage, response.status);
    }

    let data;
    try {
      data = await response.json();
    } catch {
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

export async function listAreas(): Promise<FloodAreaItem[]> {
  const data = await fetchApi("/admin/flood-areas", { method: "GET", headers: getAuthHeaders() }, false);
  
  const areas = data?.data?.floodAreas;
  if (!Array.isArray(areas)) {
    throw new FloodAreaError("Dữ liệu danh sách vùng ngập sai cấu trúc.", 500);
  }

  // Validate khắt khe: mảng không chứa null và phải đủ trường cơ bản
  for (let i = 0; i < areas.length; i++) {
    const a = areas[i];
    if (!a || typeof a !== "object" || typeof a.id !== "string" || !a.name || !a.geometry) {
      throw new FloodAreaError("Một số vùng ngập bị lỗi dữ liệu hoặc thiếu trường quan trọng từ hệ thống.", 500);
    }
  }

  return areas as FloodAreaItem[];
}

export async function createArea(input: FloodAreaInput): Promise<FloodAreaItem> {
  const payload = pickInput(input);
  const data = await fetchApi("/admin/flood-areas", { 
    method: "POST", 
    headers: getAuthHeaders(),
    body: JSON.stringify(payload)
  }, true, 201); // Ép cứng phải trả về HTTP 201

  const floodArea = data?.data?.floodArea;
  
  // Validate ID là chuỗi và không rỗng
  if (!floodArea || typeof floodArea.id !== "string" || floodArea.id.trim() === "") {
    throw new FloodAreaError("Dữ liệu vùng ngập trả về sai cấu trúc (thiếu hoặc sai ID).", 500);
  }
  return floodArea as FloodAreaItem;
}

export async function updateArea(id: string, patch: Partial<FloodAreaInput>): Promise<FloodAreaItem> {
  const payload = pickInput(patch);
  const data = await fetchApi(`/admin/flood-areas/${id}`, { 
    method: "PATCH", 
    headers: getAuthHeaders(),
    body: JSON.stringify(payload)
  }, true);

  const floodArea = data?.data?.floodArea;
  if (!floodArea || typeof floodArea.id !== "string" || floodArea.id.trim() === "") {
    throw new FloodAreaError("Dữ liệu cập nhật trả về sai cấu trúc (thiếu hoặc sai ID).", 500);
  }
  return floodArea as FloodAreaItem;
}

export async function deleteArea(id: string): Promise<void> {
  await fetchApi(`/admin/flood-areas/${id}`, { 
    method: "DELETE", 
    headers: getAuthHeaders() 
  }, true);
}