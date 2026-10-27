import { useCallback, useEffect, useState } from "react";
import { rescueService } from "../../api/rescueService";
import type { RescueRequest, StatusHistoryItem } from "../../types/rescue";

const AUTO_REFRESH_MS = 15_000;

interface State {
  id: string | undefined;
  request: RescueRequest | null;
  history: StatusHistoryItem[];
  error: string | null;
  /** Which request (id + refresh round) the data belongs to. */
  key: string;
  updatedAt: Date | null;
}

/**
 * Loads one SOS (GET /rescue-requests/:id) and its status history
 * (GET /rescue-requests/:id/history), refreshed every 15 s and on demand.
 * A failing history call does not hide the request itself.
 */
export function useRescueDetail(id: string | undefined) {
  const [round, setRound] = useState(0);
  const [state, setState] = useState<State>({
    id: undefined,
    request: null,
    history: [],
    error: null,
    key: "",
    updatedAt: null,
  });
  const key = `${id ?? ""}|${round}`;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    Promise.all([
      rescueService.getRescueDetail(id),
      rescueService.getHistory(id).catch(() => null),
    ])
      .then(([request, history]) => {
        if (cancelled) return;
        setState({
          id,
          request,
          history: history ?? request.statusHistory ?? [],
          error: null,
          key,
          updatedAt: new Date(),
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Không thể tải chi tiết SOS.";
        setState((prev) => ({ ...prev, id, error: message, key }));
      });

    return () => {
      cancelled = true;
    };
  }, [id, key]);

  useEffect(() => {
    const timer = window.setInterval(() => setRound((r) => r + 1), AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const refresh = useCallback(() => setRound((r) => r + 1), []);
  const sameId = state.id === id;

  return {
    request: sameId ? state.request : null,
    history: sameId ? state.history : [],
    error: state.error && sameId ? state.error : null,
    updatedAt: sameId ? state.updatedAt : null,
    loading: Boolean(id) && state.key !== key,
    refresh,
  };
}
