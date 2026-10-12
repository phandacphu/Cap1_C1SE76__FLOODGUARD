export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';
export type SosStatus = 'submitted' | 'received' | 'in_progress' | 'assisted' | 'cancelled';
export type AssignmentStatus = 'accepted' | 'in_progress' | 'completed';

export interface LocationCoords {
  latitude: number;
  longitude: number;
}

export interface Assignment {
  id: string;
  requestId: string;
  rescueStaffId: string;
  status: AssignmentStatus;
  note: string | null;
  assignedAt: string;
  updatedAt: string;
}

export interface StatusHistoryItem {
  id: string;
  oldStatus: string | null;
  newStatus: string;
  changedBy: string;
  note: string | null;
  changedAt: string;
}

export interface RescueRequest {
  id: string;
  residentId: string;
  location: LocationCoords;
  urgency: UrgencyLevel;
  numberOfPeople: number;
  note: string | null;
  status: SosStatus;
  createdAt: string;
  updatedAt: string;
  assignment?: Assignment | null;
  statusHistory?: StatusHistoryItem[];
}