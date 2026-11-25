/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import type {
  FloodWarning,
  RescueWarningSource,
  WarningFilters,
} from "./warningData";
import type { WarningResource } from "./useWarningResource";
import { useWarningResource } from "./useWarningResource";
import { createRescueWarningApi } from "./warningApi";
import { rescueWarningDemo } from "./warningDemo";
const Context = createContext<{
  list: WarningResource<FloodWarning[]>;
  source: RescueWarningSource;
  identity: string;
} | null>(null);
const demoEnabled =
  import.meta.env.DEV &&
  import.meta.env.VITE_RESCUE_FLOOD_WARNING_MOCK === "true";
export function RescueWarningProvider({
  children,
  source: override,
}: {
  children: ReactNode;
  source?: RescueWarningSource;
}) {
  const { token, user } = useAuth();
  const { pathname } = useLocation();
  const liveSource = useMemo(() => createRescueWarningApi(token), [token]);
  const source = override ?? (demoEnabled ? rescueWarningDemo : liveSource);
  const identity =
    token && user?.role === "RESCUE_STAFF"
      ? JSON.stringify([token, user.id, user.role])
      : "";
  const load = useCallback(
    (signal: AbortSignal) => source.active(signal),
    [source],
  );
  // The summary is unfiltered, separate from list search/status. Leaving these screens aborts it.
  const needsSummary = pathname === "/rescue/dashboard" || pathname === "/map" || pathname === "/rescue/flood-warnings";
  const list = useWarningResource(needsSummary ? identity : "", load);
  return (
    <Context.Provider value={{ list, source, identity }}>
      {children}
    </Context.Provider>
  );
}
export function useWarnings() {
  const value = useContext(Context);
  if (!value) throw new Error("Thiếu RescueWarningProvider");
  return value;
}
export function useWarningList(filters: WarningFilters, enabled = true) {
  const { source, identity } = useWarnings();
  const { status, q } = filters;
  const load = useCallback(
    (signal: AbortSignal) => source.list(signal, { status, q }),
    [source, status, q],
  );
  const key =
    identity && enabled
      ? JSON.stringify([identity, status ?? "all", q ?? ""])
      : "";
  return useWarningResource(key, load);
}
