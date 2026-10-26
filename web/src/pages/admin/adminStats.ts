import type { RescueRequest, SosStatus } from "../../types/rescue";
import type { FloodAlert, FloodArea, Severity } from "../../types/admin";

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Khẩn cấp",
  high: "Cao",
  medium: "Trung bình",
  low: "Thấp",
};

/** Used to rank flood areas: higher = more dangerous. */
export const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export interface StatusCounts {
  submitted: number;
  received: number;
  in_progress: number;
  assisted: number;
  cancelled: number;
}

export function countByStatus(requests: RescueRequest[]): StatusCounts {
  const counts: StatusCounts = {
    submitted: 0,
    received: 0,
    in_progress: 0,
    assisted: 0,
    cancelled: 0,
  };
  for (const request of requests) {
    const status: SosStatus = request.status;
    if (status in counts) counts[status] += 1;
  }
  return counts;
}

export function countSince(requests: RescueRequest[], hours: number, now: Date): number {
  const from = now.getTime() - hours * 3_600_000;
  return requests.filter((r) => new Date(r.createdAt).getTime() >= from).length;
}

export interface HourlyPoint {
  /** Hour of day (0-23) shown on the x axis. */
  hour: number;
  created: number;
  assisted: number;
}

/** 24 hourly buckets ending at the current hour (oldest first). */
export function hourlySeries(requests: RescueRequest[], now: Date): HourlyPoint[] {
  const hourMs = 3_600_000;
  const currentHourStart = Math.floor(now.getTime() / hourMs) * hourMs;
  const points: HourlyPoint[] = [];

  for (let i = 23; i >= 0; i -= 1) {
    const start = currentHourStart - i * hourMs;
    points.push({ hour: new Date(start).getHours(), created: 0, assisted: 0 });
  }

  const firstStart = currentHourStart - 23 * hourMs;
  const bucketOf = (iso: string): number => {
    const time = new Date(iso).getTime();
    if (Number.isNaN(time) || time < firstStart || time >= currentHourStart + hourMs) return -1;
    return Math.floor((time - firstStart) / hourMs);
  };

  for (const request of requests) {
    const created = bucketOf(request.createdAt);
    if (created >= 0) points[created].created += 1;
    if (request.status === "assisted") {
      const done = bucketOf(request.updatedAt);
      if (done >= 0) points[done].assisted += 1;
    }
  }
  return points;
}

export function countAlertsBySeverity(alerts: FloodAlert[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const alert of alerts) {
    if (alert.severity in counts) counts[alert.severity] += 1;
  }
  return counts;
}

export interface RiskArea {
  id: string;
  name: string;
  severity: Severity;
  alertCount: number;
}

/** Flood areas ranked by severity, then by number of active alerts. */
export function rankRiskAreas(areas: FloodArea[], alerts: FloodAlert[], limit = 5): RiskArea[] {
  return areas
    .filter((area) => area.status === "active")
    .map((area) => ({
      id: area.id,
      name: area.name,
      severity: area.severity,
      alertCount: alerts.filter((alert) => alert.areaId === area.id).length,
    }))
    .sort(
      (a, b) =>
        (SEVERITY_WEIGHT[b.severity] ?? 0) - (SEVERITY_WEIGHT[a.severity] ?? 0) ||
        b.alertCount - a.alertCount,
    )
    .slice(0, limit);
}

export function formatNumber(value: number): string {
  return value.toLocaleString("vi-VN");
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
