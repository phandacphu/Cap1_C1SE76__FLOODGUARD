export const locationTypeLabels = {
  shelter: "Điểm sơ tán",
  school: "Trường học",
  hospital: "Bệnh viện",
  community_center: "Nhà văn hóa",
  other: "Khác",
} as const;

export type SafeLocationType = keyof typeof locationTypeLabels;

export function isSafeLocationType(value: unknown): value is SafeLocationType {
  return typeof value === "string" && Object.hasOwn(locationTypeLabels, value);
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** API catalogue v2: no capacity, status, activation or reservation fields. */
export interface SafeLocationFields {
  name: string;
  address: string;
  location: Coordinates;
  type: SafeLocationType;
  description: string | null;
}

/** Legacy records may contain missing/invalid fields; keep them visible for Admin review. */
export interface SafeLocation {
  id: string;
  name: string;
  address: string;
  location: Coordinates | null;
  type: SafeLocationType | null;
  description: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface SafeLocationSource {
  demo: boolean;
  list: () => Promise<SafeLocation[]>;
  save: (id: string | null, fields: SafeLocationFields) => Promise<SafeLocation>;
  remove: (id: string) => Promise<void>;
}

export function validCoordinates(value: Coordinates | null | undefined): value is Coordinates {
  if (!value) return false;
  return Number.isFinite(value.latitude) && value.latitude >= -90 && value.latitude <= 90 &&
    Number.isFinite(value.longitude) && value.longitude >= -180 && value.longitude <= 180;
}
