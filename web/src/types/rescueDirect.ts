export type SosState = 'active' | 'rescued' | 'legacy_other';
export type SosSort = 'newest' | 'oldest';

export interface SosLocation {
  latitude: number;
  longitude: number;
}

export interface DirectSosRequest {
  id: string;
  residentId: string | null;
  status: string | null;
  state: SosState | null;
  situations: string[] | null;
  numberOfPeople: number | null;
  waterLevel: string | null;
  note: string | null;
  location: SosLocation | null;
  initialLocation: SosLocation | null;
  locationCapturedAt: string | null;
  locationReceivedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  completedBy: string | null;
  completedAt: string | null;
}

export interface DirectSosEvent {
  id: string;
  oldStatus: string | null;
  newStatus: string | null;
  changedBy: string | null;
  note: string | null;
  changedAt: string | null;
}

export interface DirectSosFilters {
  state?: SosState;
  sort?: SosSort;
  from?: string;
  to?: string;
}
