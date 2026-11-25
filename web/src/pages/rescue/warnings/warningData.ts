import { AREA_TYPE_COLOR } from "../../admin/flood-area/floodAreaTypes";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { parseWarning } from "../../admin/flood-warning/floodWarningApi";
import {
  warningTime,
  warningOrder,
} from "../../admin/flood-warning/floodWarningTypes";
import type {
  FloodWarning,
  WarningStatus,
} from "../../admin/flood-warning/floodWarningTypes";
export type { FloodWarning, WarningStatus };
export { warningTime } from "../../admin/flood-warning/floodWarningTypes";

export type ZoneGroup = "current_flood" | "historical_flood" | "low_lying";
export const ZONE_LABELS: Record<ZoneGroup, string> = {
  current_flood: "Ngập hiện tại",
  historical_flood: "Ngập lịch sử",
  low_lying: "Vùng trũng",
};
// Preserve existing agreed colors; dashed historical outlines distinguish it from low-lying red.
export const ZONE_COLORS: Record<ZoneGroup, string> = {
  current_flood: AREA_TYPE_COLOR.flood,
  historical_flood: AREA_TYPE_COLOR.low_lying,
  low_lying: AREA_TYPE_COLOR.low_lying,
};
export interface ZoneProperties {
  zoneId: string;
  group: ZoneGroup | null;
  name: string | null;
  sourceKind: string;
  sourceId: string;
  source: string | null;
  recordedAt: string | null;
  dataUpdatedAt: string | null;
  datasetVersion: string | null;
  geometryStatus: "valid" | "missing" | "invalid";
}
export type WarningZone = Feature<
  Polygon | MultiPolygon | null,
  ZoneProperties
>;
export interface ZoneBundle {
  zonesRevision: string;
  generatedAt: string;
  coverage: {
    status: "complete" | "partial" | "unavailable";
    totalZones: number;
    evaluableZones: number;
    unassessableZones: {
      zoneId: string | null;
      sourceKind: string;
      reason: string;
    }[];
  };
  geojson: { type: "FeatureCollection"; features: WarningZone[] };
}
export class WarningReadError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status = 502, code = "INVALID_V2_RESPONSE") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const date = (v: unknown): v is string =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
const nullableText = (v: unknown) => v === null || typeof v === "string";
function invalid(): never {
  throw new WarningReadError(
    "Dữ liệu không đúng contract V2. Không thể xem là danh sách trống.",
  );
}
function envelope(v: unknown): Record<string, unknown> {
  if (!obj(v) || v.success !== true || !obj(v.data)) invalid();
  return v.data;
}
export function parseWarningList(raw: unknown): FloodWarning[] {
  const data = envelope(raw);
  if (
    data.schemaVersion !== 2 ||
    !Array.isArray(data.floodAlerts) ||
    !date(data.serverTime)
  )
    invalid();
  const result = data.floodAlerts.map(parseWarning);
  if (new Set(result.map((item) => item.id)).size !== result.length) invalid();
  return result.sort(warningOrder);
}
export function parseWarningDetail(raw: unknown, id: string): FloodWarning {
  const data = envelope(raw);
  if (!date(data.serverTime)) invalid();
  const item = parseWarning(data.floodAlert);
  if (item.id !== id) invalid();
  return item;
}
function ring(v: unknown): boolean {
  if (!Array.isArray(v) || v.length < 4) return false;
  if (
    !v.every(
      (p) =>
        Array.isArray(p) &&
        p.length >= 2 &&
        Number.isFinite(p[0]) &&
        Math.abs(p[0]) <= 180 &&
        Number.isFinite(p[1]) &&
        Math.abs(p[1]) <= 90,
    )
  )
    return false;
  return v[0][0] === v.at(-1)[0] && v[0][1] === v.at(-1)[1];
}
function polygon(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0 && v.every(ring);
}
export function parseZoneBundle(raw: unknown): ZoneBundle {
  const d = envelope(raw);
  if (
    typeof d.zonesRevision !== "string" ||
    !d.zonesRevision ||
    !date(d.generatedAt) ||
    !obj(d.coverage) ||
    !obj(d.geojson)
  )
    invalid();
  const c = d.coverage;
  if (
    !["complete", "partial", "unavailable"].includes(String(c.status)) ||
    ![c.totalZones, c.evaluableZones].every(
      (n) => Number.isSafeInteger(n) && (n as number) >= 0,
    ) ||
    !Array.isArray(c.unassessableZones) ||
    !c.unassessableZones.every(
      (x) =>
        obj(x) &&
        nullableText(x.zoneId) &&
        typeof x.sourceKind === "string" &&
        typeof x.reason === "string",
    ) ||
    d.geojson.type !== "FeatureCollection" ||
    !Array.isArray(d.geojson.features)
  )
    invalid();
  const features = d.geojson.features;
  for (const f of features) {
    if (!obj(f) || f.type !== "Feature" || !obj(f.properties)) invalid();
    const p = f.properties;
    if (
      typeof p.zoneId !== "string" ||
      !p.zoneId ||
      !(p.group === null || Object.hasOwn(ZONE_LABELS, String(p.group))) ||
      typeof p.sourceKind !== "string" ||
      typeof p.sourceId !== "string" ||
      ![p.name, p.source, p.datasetVersion].every(nullableText) ||
      ![p.recordedAt, p.dataUpdatedAt].every((v) => v === null || date(v)) ||
      !["valid", "missing", "invalid"].includes(String(p.geometryStatus))
    )
      invalid();
    if (p.geometryStatus === "valid") {
      const g = f.geometry;
      if (
        p.group === null ||
        !obj(g) ||
        !(g.type === "Polygon"
          ? polygon(g.coordinates)
          : g.type === "MultiPolygon" &&
            Array.isArray(g.coordinates) &&
            g.coordinates.length > 0 &&
            g.coordinates.every(polygon))
      )
        invalid();
    } else if (f.geometry !== null) invalid();
  }
  const count = features.filter(
    (f) => f.properties.geometryStatus === "valid",
  ).length;
  if (
    new Set(features.map((f) => f.properties.zoneId)).size !==
      features.length ||
    c.totalZones !== features.length ||
    c.evaluableZones !== count ||
    (c.status === "complete" &&
      (count !== features.length || c.unassessableZones.length !== 0)) ||
    (c.status === "unavailable" && count !== 0)
  )
    invalid();
  return d as unknown as ZoneBundle;
}
export function filterWarnings(
  items: FloodWarning[],
  status: WarningStatus | "all",
  q: string,
): FloodWarning[] {
  const query = q.trim().toLocaleLowerCase("vi-VN");
  return items
    .filter(
      (item) =>
        (status === "all" || item.status === status) &&
        `${item.title}\n${item.content}`
          .toLocaleLowerCase("vi-VN")
          .includes(query),
    )
    .sort(warningOrder);
}
export function visibleZones(
  bundle: ZoneBundle,
  groups: ZoneGroup[],
): WarningZone[] {
  return bundle.geojson.features.filter(
    (f) =>
      f.geometry !== null &&
      f.properties.geometryStatus === "valid" &&
      f.properties.group !== null &&
      groups.includes(f.properties.group),
  );
}
export interface WarningFilters {
  status?: WarningStatus;
  q?: string;
}
export interface RescueWarningSource {
  readonly demo: boolean;
  list(signal: AbortSignal, filters?: WarningFilters): Promise<FloodWarning[]>;
  active(signal: AbortSignal): Promise<FloodWarning[]>;
  detail(id: string, signal: AbortSignal): Promise<FloodWarning>;
  zones(signal: AbortSignal): Promise<ZoneBundle>;
}

/** Shared metadata for the existing map popup and the accessible region details. */
export function zoneMetadataRows(
  z: ZoneProperties,
): { label: string; value: string }[] {
  const kind =
    z.sourceKind === "radar"
      ? "Radar"
      : z.sourceKind === "admin_area"
        ? "Admin"
        : z.sourceKind === "historical_area"
          ? "Lịch sử"
          : z.sourceKind;
  return [
    { label: "Tên", value: z.name || "Chưa có tên vùng" },
    { label: "Loại", value: z.group ? ZONE_LABELS[z.group] : "Chưa phân loại" },
    {
      label: "Nguồn",
      value: `${z.source || "Chưa có thông tin nguồn"} · ${kind}`,
    },
    ...(z.recordedAt
      ? [{ label: "Ghi nhận (GMT+7)", value: warningTime(z.recordedAt) }]
      : []),
    ...(z.dataUpdatedAt
      ? [
          {
            label: "Cập nhật dữ liệu (GMT+7)",
            value: warningTime(z.dataUpdatedAt),
          },
        ]
      : []),
    ...(z.datasetVersion
      ? [{ label: "Bộ dữ liệu", value: z.datasetVersion }]
      : []),
  ];
}
