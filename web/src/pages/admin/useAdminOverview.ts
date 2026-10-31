import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAdminOverview, type AdminOverview } from "./adminApi";

// Đã tăng thời gian refresh lên 5 phút (300_000 ms) để giảm quota Firestore
const AUTO_REFRESH_MS = 300_000;

interface State {
  overview: AdminOverview | null;
  /** Which refresh round the `overview` belongs to. */
  round: number;
}

/**
 * Loads the dashboard data, refreshes it every 5 minutes and on demand.
 * `onUnauthorized` runs when the token is rejected (401).
 */
export function useAdminOverview(token: string | null, onUnauthorized: () => void) {
  const [state, setState] = useState<State>({ overview: null, round: -1 });
  const [round, setRound] = useState(0);

  // Keep the latest callback without re-running the fetch effect when it changes.
  const onUnauthorizedRef = useRef(onUnauthorized);
  useEffect(() => {
    onUnauthorizedRef.current = onUnauthorized;
  });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    void fetchAdminOverview(token).then((overview) => {
      if (cancelled) return;
      if (overview.unauthorized) {
        onUnauthorizedRef.current();
        return;
      }
      setState({ overview, round });
    });

    return () => {
      cancelled = true;
    };
  }, [token, round]);

  useEffect(() => {
    const id = window.setInterval(() => {
      // Chỉ tăng round (kích hoạt fetch lại data) nếu tab đang mở
      if (document.visibilityState === 'visible') {
        setRound((r) => r + 1);
      }
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  const refresh = useCallback(() => setRound((r) => r + 1), []);

  return {
    overview: state.overview,
    /** True until the first load finishes and while a refresh is running. */
    loading: state.round !== round,
    refresh,
  };
}