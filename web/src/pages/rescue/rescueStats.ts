import type { LocationCoords, RescueRequest, SosStatus, UrgencyLevel } from "../../types/rescue";

export const URGENCY_LABEL: Record<UrgencyLevel, string> = {
  critical: "Khẩn cấp",
  high: "Cao",
  medium: "Trung bình",
  low: "Thấp",
};

export const URGENCY_WEIGHT: Record<UrgencyLevel, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export const STATUS_LABEL: Record<SosStatus, string> = {
  submitted: "Chờ tiếp nhận",
  received: "Đã tiếp nhận",
  in_progress: "Đang cứu hộ",
  assisted: "Đã hoàn tất",
  cancelled: "Đã hủy",
};

/** A request still needs the rescue team's attention. */
export function isOpen(status: SosStatus): boolean {
  return status === "submitted" || status === "received" || status === "in_progress";
}

/** "SOS-1A2B3C" style label from the Firestore id. */
export function sosCode(id: string): string {
  return `SOS-${id.slice(0, 6).toUpperCase()}`;
}

export function formatCoords(location: LocationCoords): string {
  return `${location.latitude.toFixed(4)}° N, ${location.longitude.toFixed(4)}° E`;
}

/** "8 phút trước", "3 giờ trước"... relative to `now`. */
export function timeAgo(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

/** Most urgent first; inside one urgency level the longest-waiting request first. */
export function sortByUrgency(list: RescueRequest[]): RescueRequest[] {
  return [...list].sort(
    (a, b) =>
      URGENCY_WEIGHT[b.urgency] - URGENCY_WEIGHT[a.urgency] ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export function sortByNewest(list: RescueRequest[]): RescueRequest[] {
  return [...list].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export interface RescueKpis {
  total: number;
  /** Waiting for someone to accept. */
  waiting: number;
  waitingLast15Min: number;
  criticalWaiting: number;
  inProgress: number;
  assistedToday: number;
  /** assisted / (all requests that are not cancelled), 0-100. */
  successRate: number | null;
  /** Average minutes between a request being sent and a rescuer accepting it. */
  avgResponseMin: number | null;
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function computeKpis(list: RescueRequest[], now: Date): RescueKpis {
  const waitingList = list.filter((r) => r.status === "submitted");
  const assisted = list.filter((r) => r.status === "assisted");
  const notCancelled = list.filter((r) => r.status !== "cancelled");

  const responseTimes = list
    .map((r) =>
      r.assignment
        ? (new Date(r.assignment.assignedAt).getTime() - new Date(r.createdAt).getTime()) / 60_000
        : NaN,
    )
    .filter((minutes) => Number.isFinite(minutes) && minutes >= 0);

  return {
    total: list.length,
    waiting: waitingList.length,
    waitingLast15Min: waitingList.filter(
      (r) => now.getTime() - new Date(r.createdAt).getTime() <= 15 * 60_000,
    ).length,
    criticalWaiting: waitingList.filter((r) => r.urgency === "critical").length,
    inProgress: list.filter((r) => r.status === "in_progress").length,
    assistedToday: assisted.filter((r) => sameLocalDay(new Date(r.updatedAt), now)).length,
    successRate: notCancelled.length ? (assisted.length / notCancelled.length) * 100 : null,
    avgResponseMin: responseTimes.length
      ? responseTimes.reduce((sum, m) => sum + m, 0) / responseTimes.length
      : null,
  };
}

/** "24/10/2025 14:18" in Vietnam time. */
export function formatFullDateTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour12: false,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "HH:MM:SS" for a duration in milliseconds (never negative). */
export function formatElapsed(ms: number): string {
  const total = Math.max(Math.floor(ms / 1000), 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** The four steps of a rescue, in order. */
export const FLOW_STEPS: { status: SosStatus; title: string; fallback: string }[] = [
  { status: "submitted", title: "Báo tin cứu hộ", fallback: "Cư dân gửi tín hiệu SOS từ ứng dụng." },
  { status: "received", title: "Tiếp nhận & thẩm tra", fallback: "Nhân viên cứu hộ tiếp nhận ca." },
  { status: "in_progress", title: "Xuất kích ứng cứu", fallback: "Đội cứu hộ tiếp cận hiện trường." },
  { status: "assisted", title: "Hoàn tất hỗ trợ", fallback: "Nạn nhân đã được hỗ trợ an toàn." },
];
