export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

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
  severity: SeverityLevel;
  isActive: boolean;
  status?: string;
  source?: string;
  description?: string;
  geometry: FloodAreaGeometry;
  createdAt?: string;
  updatedAt?: string;
}
