import { apiGet } from "../../../api/http";
import { parseApiSummary } from "../sos/sosContract";
import type { SosSummary } from "../sos/sosTypes";

export type ReportRange = "7d" | "30d" | "90d";
export interface WarningSummary { total: number; active: number; inactive: number }
const days: Record<ReportRange, number> = { "7d": 7, "30d": 30, "90d": 90 };

/** Inclusive window in Vietnam time; to = current instant, from = start of VN calendar day. */
export function reportWindow(range: ReportRange, now = new Date()): { from: string; to: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (name: string) => parts.find((item) => item.type === name)?.value;
  const vietnamDay = `${part("year")}-${part("month")}-${part("day")}`;
  const start = new Date(`${vietnamDay}T00:00:00+07:00`);
  start.setUTCDate(start.getUTCDate() - (days[range] - 1));
  return { from: start.toISOString(), to: now.toISOString() };
}

export function parseWarningSummary(value: unknown): WarningSummary {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Thống kê cảnh báo V2 sai cấu trúc.");
  const data = value as Record<string, unknown>;
  const valid = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  if (data.schemaVersion !== 2 || !valid(data.total) || !valid(data.active) || !valid(data.inactive) ||
    (data.total as number) !== (data.active as number) + (data.inactive as number)) {
    throw new Error("Thống kê cảnh báo V2 sai schema hoặc tổng không khớp.");
  }
  return { total: data.total as number, active: data.active as number, inactive: data.inactive as number };
}

export async function fetchSosReport(token: string, range: ReportRange): Promise<SosSummary> {
  const query = new URLSearchParams({ ...reportWindow(range) });
  return parseApiSummary(await apiGet<unknown>(`/admin/rescue-requests/summary?${query}`, token));
}

export async function fetchWarningReport(token: string): Promise<WarningSummary> {
  return parseWarningSummary(await apiGet<unknown>("/admin/flood-alerts/summary", token));
}
