export type Severity = "low" | "medium" | "high" | "critical";

export interface FloodAlert {
  id: string;
  title: string;
  content: string;
  severity: Severity;
  status: string;
  areaId: string;
  startAt: string;
  endAt: string;
}

export interface FloodArea {
  id: string;
  name: string;
  description?: string | null;
  areaType: "flood" | "low_lying" | null;
}

export interface SafeLocation {
  id: string;
  name: string;
  capacity?: number;
  status: string;
}

/** Account as returned by GET /api/admin/users (no password data). */
export interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}
