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

/** Validates the form; returns Vietnamese error messages (empty array = valid). */
export function validateArea(input: FloodAreaInput): string[] {
  const errors: string[] = [];
  if (input.name.trim() === "") errors.push("Tên vùng ngập không được để trống.");
  if (input.source.trim() === "") errors.push("Nguồn dữ liệu không được để trống.");
  const points = input.geometry.points;
  if (points.length < 3) errors.push("Đa giác cần tối thiểu 3 điểm.");
  points.forEach((p, i) => {
    if (!Number.isFinite(p.latitude) || p.latitude < -90 || p.latitude > 90) {
      errors.push(`Điểm ${i + 1}: vĩ độ (latitude) phải là số từ -90 đến 90.`);
    }
    if (!Number.isFinite(p.longitude) || p.longitude < -180 || p.longitude > 180) {
      errors.push(`Điểm ${i + 1}: kinh độ (longitude) phải là số từ -180 đến 180.`);
    }
  });
  return errors;
}
