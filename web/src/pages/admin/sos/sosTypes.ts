/** Backend SOS v2 uses a normalized state, including historical legacy records. */
export type SosCondition = "active" | "rescued" | "legacy_other";
export type SosSource = "api" | "mock";

export interface SosFilters {
  condition: "all" | SosCondition;
  from: string;
  to: string;
  /** Local search over all rows returned by the selected server-side filters. */
  search: string;
  sort: "newest" | "oldest";
}

export const DEFAULT_FILTERS: SosFilters = {
  condition: "all", from: "", to: "", search: "", sort: "newest",
};

export interface SosCoordinates {
  latitude: number;
  longitude: number;
}

export interface SosHistoryEvent {
  id: string;
  oldStatus: string | null;
  newStatus: string | null;
  changedBy: string | null;
  note: string | null;
  changedAt: string | null;
}

export interface SosItem {
  id: string;
  residentId: string | null;
  /** Retained only for explicitly labeled development fixtures; API has no contact join. */
  senderName: string | null;
  contact: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  situations: string[] | null;
  numberOfPeople: number | null;
  waterLevel: string | null;
  note: string | null;
  /** Always derived from the Backend `state`, never guessed from raw status. */
  condition: SosCondition | null;
  status?: string | null;
  location: SosCoordinates | null;
  initialLocation?: SosCoordinates | null;
  locationCapturedAt?: string | null;
  locationReceivedAt?: string | null;
  /** Legacy mock field; do not use as GPS time for API data. */
  locationUpdatedAt: string | null;
  /** Legacy mock field; actual Backend completion actor is `completedBy`. */
  confirmedBy: string | null;
  completedBy?: string | null;
  completedAt: string | null;
  statusHistory?: SosHistoryEvent[];
  source: SosSource;
}

export interface SosSummary {
  total: number;
  active: number;
  rescued: number;
  legacyOther: number;
  source: SosSource;
}

export interface SosListData {
  items: SosItem[];
  summary: SosSummary | null;
  summaryError: { status: number; message: string } | null;
  source: SosSource;
}
