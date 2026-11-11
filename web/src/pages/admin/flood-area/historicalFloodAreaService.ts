import { isAreaType, type AreaType, type FloodAreaInput, type GeoPoint } from "./floodAreaTypes";

export interface HistoricalFloodArea {
  id: string;
  name: string;
  description: string | null;
  areaType: AreaType | null;
  source: string | null;
  geometry: { type: "polygon"; points: GeoPoint[] } | null;
  referencePoint: GeoPoint;
  sourceUrl: string | null;
  updatedAt: string | null;
}

export class HistoricalFloodError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "HistoricalFloodError";
    this.status = status;
  }
}

const BASE_URL = (import.meta.env.VITE_API_URL || "https://floodguard-backend-demo.onrender.com/api").replace(/\/$/, "");
const TIMEOUT_MS = 70000;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function geoPoint(value: unknown): GeoPoint {
  const point = record(value);
  if (!point || typeof point.latitude !== "number" || !Number.isFinite(point.latitude) ||
      typeof point.longitude !== "number" || !Number.isFinite(point.longitude) ||
      Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) {
    throw new HistoricalFloodError("Tọa độ vùng lịch sử từ API không hợp lệ.", 500);
  }
  return { latitude: point.latitude, longitude: point.longitude };
}

function parseArea(value: unknown): HistoricalFloodArea {
  const area = record(value);
  if (!area || typeof area.id !== "string" || !area.id.trim() ||
      typeof area.name !== "string" || !area.name.trim() ||
      (area.description !== null && area.description !== undefined && typeof area.description !== "string") ||
      (area.source !== null && area.source !== undefined && typeof area.source !== "string") ||
      (area.sourceUrl !== null && area.sourceUrl !== undefined && typeof area.sourceUrl !== "string") ||
      (area.areaType !== null && area.areaType !== undefined && !isAreaType(area.areaType)) ||
      (area.updatedAt !== null && area.updatedAt !== undefined && typeof area.updatedAt !== "string")) {
    throw new HistoricalFloodError("Dữ liệu vùng lịch sử từ API sai cấu trúc.", 500);
  }
  const referencePoint = geoPoint(area.referencePoint);
  let geometry: HistoricalFloodArea["geometry"] = null;
  if (area.geometry != null) {
    const g = record(area.geometry);
    if (!g || g.type !== "polygon" || !Array.isArray(g.points) || g.points.length < 3) {
      throw new HistoricalFloodError("Đa giác vùng lịch sử từ API không hợp lệ.", 500);
    }
    geometry = { type: "polygon", points: g.points.map(geoPoint) };
  }
  return {
    id: area.id, name: area.name,
    description: typeof area.description === "string" ? area.description : null,
    areaType: isAreaType(area.areaType) ? area.areaType : null,
    source: typeof area.source === "string" ? area.source : null,
    geometry, referencePoint,
    sourceUrl: typeof area.sourceUrl === "string" ? area.sourceUrl : null,
    updatedAt: typeof area.updatedAt === "string" ? area.updatedAt : null,
  };
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("floodguard_token");
  if (!token) throw new HistoricalFloodError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", 401);
  return { Authorization: `Bearer ${token}` };
}

async function request(path: string, method: "GET" | "PATCH" | "DELETE", payload?: FloodAreaInput): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { ...authHeaders(), ...(payload ? { "Content-Type": "application/json" } : {}) },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof HistoricalFloodError) throw error;
    throw new HistoricalFloodError(
      controller.signal.aborted
        ? (method === "GET" ? "Đọc dữ liệu lịch sử quá hạn." : "Yêu cầu ghi quá hạn; hãy tải lại dữ liệu để xác minh trước khi thử lại.")
        : "Không thể kết nối máy chủ quản lý vùng lịch sử.",
      controller.signal.aborted ? 504 : 0,
    );
  } finally {
    window.clearTimeout(timer);
  }
  const body = await response.json().catch(() => null) as unknown;
  const envelope = record(body);
  if (!response.ok || !envelope || envelope.success !== true) {
    const message = typeof envelope?.message === "string" ? envelope.message : `API vùng lịch sử trả HTTP ${response.status}.`;
    throw new HistoricalFloodError(message, response.status);
  }
  const data = record(envelope.data);
  if (!data) throw new HistoricalFloodError("API vùng lịch sử thiếu trường data.", 500);
  return data;
}

export async function listHistoricalAreas(): Promise<HistoricalFloodArea[]> {
  const data = await request("/admin/flood-history", "GET");
  if (!Array.isArray(data.floodAreas)) throw new HistoricalFloodError("Danh sách HIST sai cấu trúc.", 500);
  const items = data.floodAreas.map(parseArea);
  if (new Set(items.map((area) => area.id)).size !== items.length) {
    throw new HistoricalFloodError("Danh sách HIST có ID trùng.", 500);
  }
  return items;
}

export async function getHistoricalArea(id: string): Promise<HistoricalFloodArea> {
  const data = await request(`/admin/flood-history/${encodeURIComponent(id)}`, "GET");
  const area = parseArea(data.floodArea);
  if (area.id !== id) throw new HistoricalFloodError("API trả về sai ID lịch sử.", 500);
  return area;
}

export async function updateHistoricalArea(id: string, input: FloodAreaInput): Promise<HistoricalFloodArea> {
  const data = await request(`/admin/flood-history/${encodeURIComponent(id)}`, "PATCH", input);
  const area = parseArea(data.floodArea);
  if (area.id !== id) throw new HistoricalFloodError("API trả về sai ID lịch sử sau khi lưu.", 500);
  return area;
}

export async function deleteHistoricalArea(id: string): Promise<void> {
  const data = await request(`/admin/flood-history/${encodeURIComponent(id)}`, "DELETE");
  if (data.id !== id || data.deleted !== true) {
    throw new HistoricalFloodError("Máy chủ chưa xác nhận xóa vùng lịch sử.", 500);
  }
}
