const API_BASE_URL =
  import.meta.env.VITE_API_URL || "https://floodguard-backend-demo.onrender.com/api";
const TIMEOUT_MS = 70000;

export type HistoricalLayerKey = "points" | "buffers" | "radar";

export interface HistoricalFeature {
  type: "Feature";
  geometry: { type: "Point" | "Polygon" | "MultiPolygon"; coordinates: unknown };
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

const LAYER_LABEL: Record<HistoricalLayerKey, string> = {
  points: "Điểm ngập lịch sử",
  buffers: "Vùng đệm tham khảo",
  radar: "Vùng phân tích radar",
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isPosition(value: unknown): value is [number, number] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 3) return false;
  const [longitude, latitude, ...altitude] = value;
  return typeof longitude === "number" && Number.isFinite(longitude) &&
    longitude >= -180 && longitude <= 180 &&
    typeof latitude === "number" && Number.isFinite(latitude) &&
    latitude >= -90 && latitude <= 90 &&
    altitude.every((n) => typeof n === "number" && Number.isFinite(n));
}

function isRing(value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 4 || !value.every(isPosition)) return false;
  const first = value[0] as number[];
  const last = value[value.length - 1] as number[];
  // GeoJSON polygon rings must close. Never silently drop invalid vertices.
  if (first.length !== last.length || first.some((n, i) => n !== last[i])) return false;
  const unique = new Set(value.slice(0, -1).map((p: [number, number]) => `${p[0]},${p[1]}`));
  return unique.size >= 3;
}

function isPolygonCoordinates(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(isRing);
}

function isMultiPolygonCoordinates(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(isPolygonCoordinates);
}

/** Validate EVERY feature before handing a layer to Leaflet; never repair a broken polygon by filtering points. */
export function parseHistoricalCollection(body: unknown, layer: HistoricalLayerKey): HistoricalFeatureCollection {
  const label = LAYER_LABEL[layer];
  if (!isRecord(body)) throw new HistoricalApiError(`${label}: phản hồi sai định dạng.`);
  if (body.success !== true) {
    const msg = typeof body.message === "string" && body.message ? ` (${body.message})` : "";
    throw new HistoricalApiError(`${label}: máy chủ báo thất bại${msg}.`);
  }
  const data = body.data;
  if (!isRecord(data) || !isRecord(data.geojson)) {
    throw new HistoricalApiError(`${label}: thiếu dữ liệu GeoJSON.`);
  }
  if (data.layer !== undefined && data.layer !== layer) {
    throw new HistoricalApiError(`${label}: phản hồi không đúng lớp dữ liệu ${layer}.`);
  }
  const geojson = data.geojson;
  if (geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
    throw new HistoricalApiError(`${label}: GeoJSON phải là FeatureCollection có mảng features.`);
  }
  geojson.features.forEach((feature: unknown, index: number) => {
    const fail = (reason: string): never => {
      throw new HistoricalApiError(`${label}: Feature ${index + 1} ${reason}.`);
    };
    if (!isRecord(feature)) return fail("không có cấu trúc Feature hợp lệ");
    if (feature.type !== "Feature") return fail("không phải Feature");
    if (!isRecord(feature.geometry)) return fail("không có geometry hợp lệ");
    if (feature.properties !== undefined && feature.properties !== null && !isRecord(feature.properties)) {
      fail("có properties sai định dạng");
    }
    if (layer === "points" && isRecord(feature.properties)) {
      for (const key of ["id", "name", "data_period", "source_url", "coordinate_status"]) {
        const value = feature.properties[key];
        if (value != null && typeof value !== "string") fail(`có thuộc tính ${key} sai định dạng`);
      }
    }
    const { type, coordinates } = feature.geometry as Record<string, unknown>;
    const valid = layer === "points"
      ? type === "Point" && isPosition(coordinates)
      : layer === "buffers"
        ? type === "MultiPolygon" && isMultiPolygonCoordinates(coordinates)
        : (type === "Polygon" && isPolygonCoordinates(coordinates)) ||
          (type === "MultiPolygon" && isMultiPolygonCoordinates(coordinates));
    if (!valid) fail("có loại hình học hoặc tọa độ không hợp lệ");
  });
  return geojson as unknown as HistoricalFeatureCollection;
}

async function fetchLayer(endpoint: string, layer: HistoricalLayerKey): Promise<HistoricalFeatureCollection> {
  const label = LAYER_LABEL[layer];
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, { signal: controller.signal });
    if (!response.ok) {
      throw new HistoricalApiError(`${label}: máy chủ trả về lỗi HTTP ${response.status}.`, response.status);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new HistoricalApiError(`${label}: phản hồi không phải JSON hợp lệ.`, 500);
    }
    return parseHistoricalCollection(body, layer);
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

export const fetchHistoricalPoints = () => fetchLayer("/flood-history/points", "points");
export const fetchHistoricalBuffers = () => fetchLayer("/flood-history/buffers", "buffers");
export const fetchHistoricalRadar = () => fetchLayer("/flood-history/radar", "radar");
