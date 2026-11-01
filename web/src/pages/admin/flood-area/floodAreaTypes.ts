// File: web/src/pages/admin/flood-area/floodAreaTypes.ts
// CCF-119: Flood Area Management. Field names follow the Admin API (GET/POST /api/admin/flood-areas).

export type Severity = "low" | "medium" | "high" | "critical";
export type AreaStatus = "active" | "inactive";

export const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];
export const SEVERITY_LABEL: Record<Severity, string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
  critical: "Khẩn cấp",
};
export const STATUS_LABEL: Record<AreaStatus, string> = {
  active: "Đang hoạt động",
  inactive: "Ngừng hoạt động",
};

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface FloodAreaItem {
  id: string;
  name: string;
  description: string;
  severity: Severity;
  status: AreaStatus;
  source: string;
  geometry: { type: "polygon"; points: GeoPoint[] };
  /** Mock only: how many flood alerts reference this area (a real API answers 409 on DELETE instead). */
  linkedAlerts?: number;
}

/** Body of POST / PATCH. Never includes id, createdAt or updatedAt. */
export type FloodAreaInput = Pick<FloodAreaItem, "name" | "description" | "severity" | "status" | "source" | "geometry">;

export class FloodAreaError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "FloodAreaError";
    this.status = status;
  }
}

/** Tolerance for floating-point noise when testing whether points lie on one line. */
const COLLINEAR_EPSILON = 1e-13;

/** Cross product of (b - a) x (c - a), using longitude as x and latitude as y. */
function cross(a: GeoPoint, b: GeoPoint, c: GeoPoint): number {
  return (b.longitude - a.longitude) * (c.latitude - a.latitude) - (b.latitude - a.latitude) * (c.longitude - a.longitude);
}

function samePoint(a: GeoPoint, b: GeoPoint): boolean {
  return a.latitude === b.latitude && a.longitude === b.longitude;
}

function onSegment(a: GeoPoint, b: GeoPoint, p: GeoPoint): boolean {
  return (
    Math.min(a.longitude, b.longitude) <= p.longitude &&
    p.longitude <= Math.max(a.longitude, b.longitude) &&
    Math.min(a.latitude, b.latitude) <= p.latitude &&
    p.latitude <= Math.max(a.latitude, b.latitude)
  );
}

/** True when segments ab and cd touch or cross (including collinear overlap). */
function segmentsIntersect(a: GeoPoint, b: GeoPoint, c: GeoPoint, d: GeoPoint): boolean {
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  if (d1 === 0 && onSegment(a, b, c)) return true;
  if (d2 === 0 && onSegment(a, b, d)) return true;
  if (d3 === 0 && onSegment(c, d, a)) return true;
  if (d4 === 0 && onSegment(c, d, b)) return true;
  return false;
}

/** Absolute polygon area (shoelace formula, in square degrees). */
export function polygonArea(points: GeoPoint[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.longitude * b.latitude - b.longitude * a.latitude;
  }
  return Math.abs(sum) / 2;
}

/** Geometry checks for a polygon whose coordinates are already valid numbers. */
function validateGeometry(points: GeoPoint[]): string[] {
  const errors: string[] = [];

  // Two points at the same place (any pair, not only neighbours).
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      if (samePoint(points[i], points[j])) errors.push(`Điểm ${i + 1} và điểm ${j + 1} trùng nhau.`);
    }
  }
  if (errors.length > 0) return errors;

  const base = points[0];
  const second = points[1];
  if (points.every((p) => Math.abs(cross(base, second, p)) < COLLINEAR_EPSILON)) {
    return ["Các điểm thẳng hàng nên đa giác không có diện tích. Hãy thêm hoặc chỉnh điểm để tạo thành vùng có diện tích."];
  }

  // Edges that are not neighbours must not touch or cross each other.
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const neighbours = j === i + 1 || (i === 0 && j === n - 1);
      if (neighbours) continue;
      if (segmentsIntersect(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) {
        return [`Cạnh ${i + 1}–${((i + 1) % n) + 1} cắt cạnh ${j + 1}–${((j + 1) % n) + 1}: đa giác không được tự cắt nhau. Hãy sắp xếp các điểm theo thứ tự đi quanh vùng.`];
      }
    }
  }
  if (polygonArea(points) < COLLINEAR_EPSILON / 2) {
    return ["Đa giác không có diện tích. Hãy chỉnh lại các điểm."];
  }
  return [];
}

/** Validates the form; returns Vietnamese error messages (empty array = valid). */
export function validateArea(input: FloodAreaInput): string[] {
  const errors: string[] = [];
  if (input.name.trim() === "") errors.push("Tên vùng ngập không được để trống.");
  if (input.source.trim() === "") errors.push("Nguồn dữ liệu không được để trống.");
  const points = input.geometry.points;
  if (points.length < 3) errors.push("Đa giác cần tối thiểu 3 điểm.");
  let coordinatesOk = true;
  points.forEach((p, i) => {
    if (!Number.isFinite(p.latitude) || p.latitude < -90 || p.latitude > 90) {
      errors.push(`Điểm ${i + 1}: vĩ độ (latitude) phải là số từ -90 đến 90.`);
      coordinatesOk = false;
    }
    if (!Number.isFinite(p.longitude) || p.longitude < -180 || p.longitude > 180) {
      errors.push(`Điểm ${i + 1}: kinh độ (longitude) phải là số từ -180 đến 180.`);
      coordinatesOk = false;
    }
  });
  if (points.length >= 3 && coordinatesOk) errors.push(...validateGeometry(points));
  return errors;
}
