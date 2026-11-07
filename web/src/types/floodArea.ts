export type AreaType = 'flood' | 'low_lying';

export interface LatLngPoint {
  latitude: number;
  longitude: number;
}

export interface FloodAreaGeometry {
  type: string;
  points: LatLngPoint[];
}

export interface FloodArea {
  id: string;
  name: string;
  areaType?: AreaType | null;
  source?: string | null;
  description?: string | null;
  geometry: FloodAreaGeometry;
  createdAt?: string;
  updatedAt?: string;
}
