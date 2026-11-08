/** UI business labels, not backend status codes. API status mapping awaits Phú's contract. */
export type SosCondition = "active" | "rescued";
export type SosSource = "api" | "mock";

export interface SosFilters {
  condition: "all" | SosCondition;
  from: string;
  to: string;
  search: string;
  sort: "newest" | "oldest";
}

export const DEFAULT_FILTERS: SosFilters = {
  condition: "all", from: "", to: "", search: "", sort: "newest",
};

export interface SosItem {
  id: string;
  residentId: string | null;
  senderName: string | null;
  contact: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  situations: string[] | null;
  numberOfPeople: number | null;
  waterLevel: string | null;
  note: string | null;
  condition: SosCondition | null;
  location: { latitude: number; longitude: number } | null;
  locationUpdatedAt: string | null;
  confirmedBy: string | null;
  completedAt: string | null;
  source: SosSource;
}

export interface SosSummary {
  total: number;
  active: number | null;
  rescued: number | null;
  source: SosSource;
}

export interface SosListData {
  items: SosItem[];
  summary: SosSummary | null;
  summaryError: { status: number; message: string } | null;
  source: SosSource;
}
