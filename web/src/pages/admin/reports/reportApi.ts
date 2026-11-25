import { apiGet } from "../../../api/http";
import { parseApiSummary } from "../sos/sosContract";
import type { SosSummary } from "../sos/sosTypes";
import { fetchAdminSafeLocations } from "../safe-location/safeLocationApi";
import { locationTypeLabels, type SafeLocationType } from "../safe-location/safeLocationTypes";
import { fetchHistoricalAreas, fetchHistoricalRadar } from "../flood-area/historicalMapService";

export type ReportRange = "7d" | "30d" | "90d";
export interface WarningSummary { total: number; active: number; inactive: number }
export interface FloodAreaSummary { total: number; historicalFlood: number; radarCandidates: number }
export interface ManagedAreaSummary { total: number; flood: number; lowLying: number; unclassified: number }
export interface CombinedAreaSummary { total: number; flood: number; lowLying: number }
export interface SafeLocationSummary { total: number; byType: Record<SafeLocationType | "unclassified", number> }
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

/** Counts GeoJSON features, not independent polygons or confirmed flood extents. */
export async function fetchFloodAreaReport(): Promise<FloodAreaSummary> {
  const [history, radar] = await Promise.all([fetchHistoricalAreas(), fetchHistoricalRadar()]);
  const historicalFlood = history.features.length;
  const radarCandidates = radar.features.length;
  return { total: historicalFlood + radarCandidates, historicalFlood, radarCandidates };
}

export function parseManagedAreaSummary(value: unknown): ManagedAreaSummary {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Thống kê vùng quản lý không hợp lệ.");
  const summary = value as Record<string, unknown>;
  const byType = summary.byAreaType;
  if (typeof byType !== "object" || byType === null || Array.isArray(byType)) throw new Error("Thống kê loại vùng không hợp lệ.");
  const counts = byType as Record<string, unknown>;
  const valid = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  if (!valid(summary.total) || !valid(counts.flood) || !valid(counts.low_lying) || !valid(counts.unclassified) ||
    summary.total !== counts.flood + counts.low_lying + counts.unclassified) {
    throw new Error("Thống kê vùng quản lý không khớp.");
  }
  return { total: summary.total, flood: counts.flood, lowLying: counts.low_lying, unclassified: counts.unclassified };
}

/** Admin-managed areas across all dates, separate from public history and radar map layers. */
export async function fetchManagedAreaReport(token: string): Promise<ManagedAreaSummary> {
  return parseManagedAreaSummary(await apiGet<unknown>("/admin/flood-areas/summary", token));
}

/** Counts records from independent sources. Unclassified Admin areas are excluded. */
export function combineAreaReports(history: FloodAreaSummary, managed: ManagedAreaSummary): CombinedAreaSummary {
  const flood = history.historicalFlood + managed.flood;
  const lowLying = history.radarCandidates + managed.lowLying;
  return { total: flood + lowLying, flood, lowLying };
}

export async function fetchSafeLocationReport(token: string): Promise<SafeLocationSummary> {
  const locations = await fetchAdminSafeLocations(token);
  const byType = Object.fromEntries([...Object.keys(locationTypeLabels), "unclassified"].map((type) => [type, 0])) as SafeLocationSummary["byType"];
  for (const location of locations) byType[location.type ?? "unclassified"]++;
  return { total: locations.length, byType };
}
