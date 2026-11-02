import { FloodAreaError, type FloodAreaInput, type FloodAreaItem } from "./floodAreaTypes";

// CCF-124: Chuyển sang dùng API thay cho mock data
export const DATA_SOURCE: "mock" | "api" = "api";

const API_BASE_URL = "https://floodguard-backend-demo.onrender.com/api";

function getAuthHeaders() {
  const token = localStorage.getItem("token");
  if (!token) throw new FloodAreaError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", 401);
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function handleResponse(response: Response, defaultMessage: string) {
  if (!response.ok) {
    let errorMessage = defaultMessage;
    try {
      const errorData = await response.json();
      if (errorData && errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      // Bỏ qua nếu response không phải JSON
    }

    // Đặc tả CCF-124: Bắt cứng lỗi 409 khi xóa vùng đang có cảnh báo tham chiếu
    if (response.status === 409) {
      throw new FloodAreaError("Vùng này đang được liên kết với một cảnh báo lũ. Hãy chuyển sang ngừng hoạt động thay vì xóa.", 409);
    }

    throw new FloodAreaError(errorMessage, response.status);
  }
  return response.json();
}

// CCF-124: Chỉ lấy những field cần thiết, loại bỏ id, createdAt, updatedAt
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
    const response = await fetch(`${API_BASE_URL}/admin/flood-areas`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
    const data = await handleResponse(response, "Không thể tải danh sách vùng ngập.");
    return data?.data?.floodAreas || [];
  } catch (error) {
    if (error instanceof FloodAreaError) throw error;
    throw new FloodAreaError("Không thể tải danh sách vùng ngập.", 500);
  }
}

export async function createArea(input: FloodAreaInput): Promise<FloodAreaItem> {
  try {
    const payload = pickInput(input);
    const response = await fetch(`${API_BASE_URL}/admin/flood-areas`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await handleResponse(response, "Thêm vùng ngập thất bại.");
    return data?.data?.floodArea;
  } catch (error) {
    if (error instanceof FloodAreaError) throw error;
    throw new FloodAreaError("Thêm vùng ngập thất bại.", 500);
  }
}

export async function updateArea(id: string, patch: Partial<FloodAreaInput>): Promise<FloodAreaItem> {
  try {
    const payload = pickInput(patch);
    const response = await fetch(`${API_BASE_URL}/admin/flood-areas/${id}`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await handleResponse(response, "Cập nhật vùng ngập thất bại.");
    return data?.data?.floodArea;
  } catch (error) {
    if (error instanceof FloodAreaError) throw error;
    throw new FloodAreaError("Cập nhật vùng ngập thất bại.", 500);
  }
}

export async function deleteArea(id: string): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/flood-areas/${id}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    await handleResponse(response, "Xóa vùng ngập thất bại.");
  } catch (error) {
    if (error instanceof FloodAreaError) throw error;
    throw new FloodAreaError("Xóa vùng ngập thất bại.", 500);
  }
}