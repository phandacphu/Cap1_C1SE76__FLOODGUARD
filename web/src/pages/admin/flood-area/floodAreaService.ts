import { FloodAreaError, type FloodAreaInput, type FloodAreaItem } from "./floodAreaTypes";

export const DATA_SOURCE: "mock" | "api" = "api";

// CCF-124: Sử dụng biến môi trường VITE_API_URL, fallback về URL demo
const API_BASE_URL = import.meta.env.VITE_API_URL || "https://floodguard-backend-demo.onrender.com/api";
const TIMEOUT_MS = 15000; // Timeout 15 giây

function getAuthHeaders() {
  // Sửa theo review: dùng "floodguard_token" đồng nhất với AuthContext
  const token = localStorage.getItem("floodguard_token");
  if (!token) throw new FloodAreaError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", 401);
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// Wrapper xử lý timeout cho fetch
async function fetchWithTimeout(resource: string, options: RequestInit) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    if (error instanceof Error && error.name === "AbortError") {
      throw new FloodAreaError("Kết nối máy chủ bị quá hạn (Timeout). Vui lòng thử lại.", 504);
    }
    throw error;
  }
}

// Kiểm tra mã HTTP và trường success === true
async function handleResponse(response: Response, defaultMessage: string, expectedStatus?: number) {
  if (!response.ok || (expectedStatus && response.status !== expectedStatus)) {
    let errorMessage = defaultMessage;
    try {
      const errorData = await response.json();
      if (errorData && errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      // Bỏ qua nếu không parse được JSON
    }

    if (response.status === 409) {
      throw new FloodAreaError("Vùng này đang được liên kết với một cảnh báo lũ. Hãy chuyển sang ngừng hoạt động thay vì xóa.", 409);
    }

    throw new FloodAreaError(errorMessage, response.status);
  }

  try {
    const data = await response.json();
    if (data.success !== true) {
      throw new FloodAreaError(data.message || defaultMessage, response.status);
    }
    return data;
  } catch (error) {
    if (error instanceof FloodAreaError) throw error;
    throw new FloodAreaError("Phản hồi từ máy chủ sai định dạng.", 500);
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
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/admin/flood-areas`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
    const data = await handleResponse(response, "Không thể tải danh sách vùng ngập.");

    // Validate cấu trúc trả về
    if (!Array.isArray(data?.data?.floodAreas)) {
      throw new FloodAreaError("Dữ liệu danh sách vùng ngập sai cấu trúc.", 500);
    }
    return data.data.floodAreas;
  } catch (error) {
    if (error instanceof FloodAreaError) throw error;
    throw new FloodAreaError("Không thể kết nối tải danh sách vùng ngập.", 500);
  }
}

export async function createArea(input: FloodAreaInput): Promise<FloodAreaItem> {
  try {
    const payload = pickInput(input);
    const response = await fetchWithTimeout(`${API_BASE_URL}/admin/flood-areas`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    
    // Yêu cầu mã 201 Created
    const data = await handleResponse(response, "Thêm vùng ngập thất bại.", 201);

    const floodArea = data?.data?.floodArea;
    if (!floodArea || !floodArea.id) {
      throw new FloodAreaError("Dữ liệu vùng ngập trả về sai cấu trúc.", 500);
    }
    return floodArea;
  } catch (error) {
    if (error instanceof FloodAreaError) throw error;
    throw new FloodAreaError("Lỗi kết nối khi thêm vùng ngập.", 500);
  }
}

export async function updateArea(id: string, patch: Partial<FloodAreaInput>): Promise<FloodAreaItem> {
  try {
    const payload = pickInput(patch);
    const response = await fetchWithTimeout(`${API_BASE_URL}/admin/flood-areas/${id}`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await handleResponse(response, "Cập nhật vùng ngập thất bại.");

    const floodArea = data?.data?.floodArea;
    if (!floodArea || !floodArea.id) {
      throw new FloodAreaError("Dữ liệu cập nhật trả về sai cấu trúc.", 500);
    }
    return floodArea;
  } catch (error) {
    if (error instanceof FloodAreaError) throw error;
    throw new FloodAreaError("Lỗi kết nối khi cập nhật vùng ngập.", 500);
  }
}

export async function deleteArea(id: string): Promise<void> {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/admin/flood-areas/${id}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    await handleResponse(response, "Xóa vùng ngập thất bại.");
  } catch (error) {
    if (error instanceof FloodAreaError) throw error;
    throw new FloodAreaError("Lỗi kết nối khi xóa vùng ngập.", 500);
  }
}