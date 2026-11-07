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

export interface FloodAlert {
  id: string;
  title: string;
  content: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'inactive';
  areaId: string;
  startAt: string;
  endAt: string;
}
