export const locationTypeLabels = {
  shelter: "Điểm sơ tán",
  school: "Trường học",
  hospital: "Bệnh viện",
  community_center: "Nhà văn hóa",
  other: "Khác",
} as const;

export const locationStatusLabels = { active: "Đang hoạt động", inactive: "Tạm đóng" } as const;

export type SafeLocationType = keyof typeof locationTypeLabels;
export type SafeLocationStatus = keyof typeof locationStatusLabels;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface SafeLocationFields {
  name: string;
  address: string;
  type: SafeLocationType;
  capacity: number;
  status: SafeLocationStatus;
  location: Coordinates;
}

export interface SafeLocation extends SafeLocationFields {
  id: string;
}

export interface SafeLocationSource {
  demo: boolean;
  list: () => Promise<SafeLocation[]>;
  save: (id: string | null, fields: SafeLocationFields) => Promise<SafeLocation>;
  setStatus: (id: string, status: SafeLocationStatus) => Promise<SafeLocation>;
}

export function validCoordinates({ latitude, longitude }: Coordinates) {
  return Number.isFinite(latitude) && Math.abs(latitude) <= 90 &&
    Number.isFinite(longitude) && Math.abs(longitude) <= 180;
}
