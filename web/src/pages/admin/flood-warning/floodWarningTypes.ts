export const severityLabels = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
  critical: "Khẩn cấp",
} as const;

export type WarningSeverity = keyof typeof severityLabels;
export type WarningStatus = "active" | "inactive";

export interface WarningFields {
  title: string;
  content: string;
  severity: WarningSeverity;
  status: WarningStatus;
  areaId: string;
  startAt: string;
  endAt: string;
}

export interface FloodWarning extends WarningFields {
  id: string;
}

export interface WarningArea {
  id: string;
  name: string;
}

export interface WarningData {
  warnings: FloodWarning[];
  areas: WarningArea[];
}

export interface FloodWarningSource {
  demo: boolean;
  list: () => Promise<WarningData>;
  save: (id: string | null, fields: WarningFields) => Promise<FloodWarning>;
}

export const periodLabels = {
  current: "Đang hiệu lực",
  upcoming: "Sắp tới",
  expired: "Đã hết hạn",
  inactive: "Đã tắt",
  unknown: "Thiếu thời gian",
} as const;

export function warningPeriod(warning: FloodWarning, now: number): keyof typeof periodLabels {
  const start = Date.parse(warning.startAt);
  const end = Date.parse(warning.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return "unknown";
  if (now > end) return "expired";
  if (warning.status === "inactive") return "inactive";
  return now < start ? "upcoming" : "current";
}

const formatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

export function warningTime(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? formatter.format(time) : "Chưa có";
}

export function toIctInput(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time + 7 * 60 * 60 * 1000).toISOString().slice(0, 23) : "";
}
