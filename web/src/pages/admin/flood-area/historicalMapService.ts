const API_BASE_URL =
  import.meta.env.VITE_API_URL || "https://floodguard-backend-demo.onrender.com/api";
const TIMEOUT_MS = 70000;

export interface HistoricalFeature {
  type?: string;
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: Record<string, unknown> | null;
}

export interface HistoricalFeatureCollection {
  type: "FeatureCollection";
  features: HistoricalFeature[];
}

export class HistoricalApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "HistoricalApiError";
    this.status = status;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Kiểm tra: success === true, có geojson, đúng FeatureCollection, features là mảng. */
function parseCollection(body: unknown, label: string): HistoricalFeatureCollection {
  if (!isRecord(body)) {
    throw new HistoricalApiError(`${label}: phản hồi sai định dạng.`);
  }
  if (body.success !== true) {
    const msg = typeof body.message === "string" && body.message ? ` (${body.message})` : "";
    throw new HistoricalApiError(`${label}: máy chủ báo thất bại${msg}.`);
  }
  const data = body.data;
  if (!isRecord(data) || !isRecord(data.geojson)) {
    throw new HistoricalApiError(`${label}: thiếu dữ liệu GeoJSON.`);
  }
  const geojson = data.geojson;
  if (geojson.type !== "FeatureCollection") {
    throw new HistoricalApiError(`${label}: GeoJSON không phải FeatureCollection.`);
  }
  if (!Array.isArray(geojson.features)) {
    throw new HistoricalApiError(`${label}: danh sách features không phải mảng.`);
  }
  return geojson as unknown as HistoricalFeatureCollection;
}

async function fetchLayer(endpoint: string, label: string): Promise<HistoricalFeatureCollection> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, { signal: controller.signal });
    if (!response.ok) {
      throw new HistoricalApiError(
        `${label}: máy chủ trả về lỗi HTTP ${response.status}.`,
        response.status,
      );
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new HistoricalApiError(`${label}: phản hồi không phải JSON hợp lệ.`, 500);
    }
    return parseCollection(body, label);
  } catch (err) {
    if (err instanceof HistoricalApiError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new HistoricalApiError(`${label}: kết nối quá hạn, vui lòng thử lại.`, 504);
    }
    throw new HistoricalApiError(`${label}: không thể kết nối đến máy chủ.`);
  } finally {
    clearTimeout(timeoutId);
  }
}

export const fetchHistoricalPoints = () =>
  fetchLayer("/flood-history/points", "Điểm ngập lịch sử");

export const fetchHistoricalBuffers = () =>
  fetchLayer("/flood-history/buffers", "Vùng đệm tham khảo");

export const fetchHistoricalRadar = () =>
  fetchLayer("/flood-history/radar", "Radar nghi ngập");