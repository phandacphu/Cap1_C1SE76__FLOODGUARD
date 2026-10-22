export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';

export type SosStatus = 'submitted' | 'received' | 'in_progress' | 'assisted' | 'rejected' | 'cancelled';

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  address?: string;
}

export interface Assignment {
  rescueStaffId: string;
  assignedAt: string;
  note?: string;
}

export type RescueAssignment = Assignment;

export interface StatusHistoryItem {
  status: SosStatus;
  changedAt: string;
  changedBy?: string;
  note?: string;
}

export interface RescueRequest {
  id: string;
  senderName: string;
  phoneNumber: string;
  location: LocationCoordinates;
  numberOfPeople: number;
  urgency: UrgencyLevel;
  status: SosStatus;
  note?: string;
  createdAt: string;
  updatedAt: string;
  assignment?: Assignment;
  assignedStaffId?: string;
  assignedTo?: string;
  statusHistory?: StatusHistoryItem[];
}

export interface GetRescueRequestsParams {
  status?: SosStatus;
  urgency?: UrgencyLevel;
  sort?: string;
}
