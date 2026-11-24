export type WarningStatus = "active" | "inactive";
export interface WarningFields { title: string; content: string }
export interface FloodWarning extends WarningFields {
  id: string; schemaVersion: 2; status: WarningStatus; scope: "all_published_zones";
  startAt: string; endAt: string | null; createdAt: string; updatedAt: string; revision: number;
}
export interface WarningSummary { total: number; active: number; inactive: number }
export interface WarningSource {
  demo: boolean;
  list(status?: WarningStatus, q?: string): Promise<FloodWarning[]>;
  summary(): Promise<WarningSummary>;
  detail(id: string): Promise<FloodWarning>;
  create(fields: WarningFields, requestId: string): Promise<FloodWarning>;
  creationRequest(requestId: string): Promise<FloodWarning>;
  update(id: string, revision: number, fields: Partial<WarningFields>): Promise<FloodWarning>;
  deactivate(id: string): Promise<FloodWarning>;
}
const formatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
export function warningTime(value: string | null): string {
  if (value === null) return "Chưa kết thúc";
  const time = Date.parse(value);
  return Number.isFinite(time) ? formatter.format(time) : "Thời gian không hợp lệ";
}
export function warningOrder(a: FloodWarning, b: FloodWarning): number {
  return Date.parse(b.startAt) - Date.parse(a.startAt) || a.id.localeCompare(b.id);
}
