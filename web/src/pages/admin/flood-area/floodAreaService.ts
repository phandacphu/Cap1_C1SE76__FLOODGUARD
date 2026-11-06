import { FloodAreaError, isAreaType, type FloodAreaInput, type FloodAreaItem } from "./floodAreaTypes";

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
        throw new FloodAreaError("Vùng này đang được liên kết với một cảnh báo lũ. Hãy xử lý liên kết cảnh báo trước khi xóa vùng.", 409);
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
  const allowed: (keyof FloodAreaInput)[] = ["name", "description", "areaType", "source", "geometry"];
  const result: Record<string, unknown> = {};
  for (const key of allowed) {
    if (input[key] !== undefined) {
      result[key] = input[key];
    }
  }
  return result as Partial<FloodAreaInput>;
}

// Missing/unsupported classifications remain editable as null; never guess a category.
function parseAreaItem(data: unknown): FloodAreaItem {
  const fail = () => { throw new FloodAreaError("Dữ liệu vùng trả về sai cấu trúc.", 500); };
  if (!data || typeof data !== "object") return fail();
  const a = data as Record<string, unknown>;
  if (typeof a.id !== "string" || !a.id.trim() ||
      typeof a.name !== "string" || !a.name.trim() ||
      typeof a.source !== "string" || !a.source.trim() ||
      (a.description != null && typeof a.description !== "string")) return fail();
  const geo = a.geometry as Record<string, unknown> | null;
  if (!geo || geo.type !== "polygon" || !Array.isArray(geo.points) || geo.points.length < 3) return fail();
  const points = geo.points.map((p: unknown) => {
    if (!p || typeof p !== "object") return fail();
    const pt = p as Record<string, unknown>;
    if (typeof pt.latitude !== "number" || !Number.isFinite(pt.latitude) ||
        typeof pt.longitude !== "number" || !Number.isFinite(pt.longitude) ||
        Math.abs(pt.latitude) > 90 || Math.abs(pt.longitude) > 180) return fail();
    return { latitude: pt.latitude, longitude: pt.longitude };
  });
  return {
    id: a.id, name: a.name, source: a.source,
    description: typeof a.description === "string" ? a.description : null,
    areaType: isAreaType(a.areaType) ? a.areaType : null,
    geometry: { type: "polygon", points },
  };
}

export async function listAreas(): Promise<FloodAreaItem[]> {
  const data = await fetchApi("/admin/flood-areas", { method: "GET", headers: getAuthHeaders() }, false);

  const areas = data?.data?.floodAreas;
  if (!Array.isArray(areas)) {
    throw new FloodAreaError("Dữ liệu danh sách vùng ngập sai cấu trúc.", 500);
  }

  return areas.map(parseAreaItem);
}

export async function createArea(input: FloodAreaInput): Promise<FloodAreaItem> {
  if (!isAreaType(input.areaType)) throw new FloodAreaError("Vui lòng chọn loại vùng hợp lệ.", 400);
  const payload = pickInput(input);
  const data = await fetchApi("/admin/flood-areas", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload)
  }, true, 201);

  const floodArea = data?.data?.floodArea;

  const created = parseAreaItem(floodArea);
  if (!isAreaType(created.areaType)) {
    throw new FloodAreaError("Máy chủ chưa xác nhận loại vùng sau khi tạo. Tải lại danh sách trước khi thử lại.", 500);
  }
  return created;
}

export async function updateArea(id: string, patch: Partial<FloodAreaInput>): Promise<FloodAreaItem> {
  if (Object.hasOwn(patch, "areaType") && !isAreaType(patch.areaType)) {
    throw new FloodAreaError("Vui lòng chọn loại vùng hợp lệ.", 400);
  }
  const payload = pickInput(patch);
  const data = await fetchApi(`/admin/flood-areas/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload)
  }, true);

  const floodArea = data?.data?.floodArea;

  const updated = parseAreaItem(floodArea);
  if (!isAreaType(updated.areaType)) {
    throw new FloodAreaError("Máy chủ chưa xác nhận loại vùng sau khi cập nhật. Tải lại danh sách trước khi thử lại.", 500);
  }
  return updated;
}

export async function deleteArea(id: string): Promise<void> {
  await fetchApi(`/admin/flood-areas/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getAuthHeaders()
  }, true);
}
