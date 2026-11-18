import { apiGet, ApiError } from "../../api/http";
import { fetchSosSummary } from "./sos/sosApi";
import type { SosSummary } from "./sos/sosTypes";
import type { AdminUser, FloodAlert, FloodArea } from "../../types/admin";
import { fetchAdminSafeLocations } from "./safe-location/safeLocationApi";
import type { SafeLocation } from "./safe-location/safeLocationTypes";

/** A section of the dashboard that either loaded from the API or did not. */
export type Section<T> = { ok: true; data: T } | { ok: false; status: number };

export interface AdminOverview {
  alerts: Section<FloodAlert[]>;
  areas: Section<FloodArea[]>;
  safeLocations: Section<SafeLocation[]>;
  /** Admin-only endpoint (CCF-116). */
  sos: Section<SosSummary>;
  /** Admin-only endpoint (CCF-113). */
  users: Section<AdminUser[]>;
  /** Round-trip time of GET /health in ms, or null when the API is unreachable. */
  apiLatencyMs: number | null;
  /** True when any request came back 401 (expired or invalid token). */
  unauthorized: boolean;
  updatedAt: Date;
}

async function settle<T>(request: Promise<T>): Promise<Section<T>> {
  try {
    return { ok: true, data: await request };
  } catch (error) {
    return { ok: false, status: error instanceof ApiError ? error.status : 0 };
  }
}

async function measureHealth(): Promise<number | null> {
  const start = performance.now();
  try {
    await apiGet<unknown>("/health");
    return Math.round(performance.now() - start);
  } catch {
    return null;
  }
}

export async function fetchAdminOverview(token: string): Promise<AdminOverview> {
  const [alerts, areas, safeLocations, sos, users, apiLatencyMs] = await Promise.all([
    settle(
      apiGet<{ floodAlerts: FloodAlert[] }>("/flood-alerts/active", token).then(
        (data) => data.floodAlerts ?? [],
      ),
    ),
    settle(
      apiGet<{ floodAreas: FloodArea[] }>("/flood-areas", token).then(
        (data) => data.floodAreas ?? [],
      ),
    ),
    settle(fetchAdminSafeLocations(token)),
    settle(fetchSosSummary(token)),
    settle(
      apiGet<{ users: AdminUser[] }>("/admin/users", token).then((data) => data.users ?? []),
    ),
    measureHealth(),
  ]);

  const sections = [alerts, areas, safeLocations, sos, users];
  return {
    alerts,
    areas,
    safeLocations,
    sos,
    users,
    apiLatencyMs,
    unauthorized: sections.some((s) => !s.ok && s.status === 401),
    updatedAt: new Date(),
  };
}
