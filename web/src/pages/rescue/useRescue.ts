import { useCallback, useEffect, useState } from "react";
import { rescueService } from "../../api/rescueService";
import type { RescueRequest, SosStatus, UrgencyLevel } from "../../types/rescue";

const AUTO_REFRESH_MS = 15_000;

interface ListParams {
  status?: SosStatus;
  urgency?: UrgencyLevel;
  sort?: "priority";
}

interface ListState {
  requests: RescueRequest[] | null;
  error: string | null;
  /** Which request (params + refresh round) the data belongs to. */
  key: string;
  updatedAt: Date | null;
}

/** Loads GET /rescue-requests, refreshes every 15 s and on demand. */
export function useRescueRequests(params: ListParams = {}) {
  const { status, urgency, sort } = params;
  const [round, setRound] = useState(0);
  const [state, setState] = useState<ListState>({
    requests: null,
    error: null,
    key: "",
    updatedAt: null,
  });
  const key = `${status ?? ""}|${urgency ?? ""}|${sort ?? ""}|${round}`;

  useEffect(() => {
    let cancelled = false;
    rescueService
      .getRescueRequests({ status, urgency, sort })
      .then((requests) => {
        if (!cancelled) setState({ requests, error: null, key, updatedAt: new Date() });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Không thể tải danh sách SOS.";
        setState((prev) => ({ ...prev, error: message, key }));
      });
    return () => {
      cancelled = true;
    };
  }, [status, urgency, sort, key]);

  useEffect(() => {
    const id = window.setInterval(() => setRound((r) => r + 1), AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  const refresh = useCallback(() => setRound((r) => r + 1), []);

  return {
    requests: state.requests,
    error: state.error,
    updatedAt: state.updatedAt,
    loading: state.key !== key,
    refresh,
  };
}

function storageKey(userId: string): string {
  return `floodguard_my_sos_${userId}`;
}

function loadMine(userId: string | undefined): Set<string> {
  if (!userId) return new Set();
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function saveMine(userId: string | undefined, ids: Set<string>) {
  if (!userId) return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify([...ids]));
  } catch {
    // Storage unavailable: the list just won't be remembered after a reload.
  }
}

/**
 * Accept / progress actions (CCF-108, CCF-109).
 * The list API may not return `assignment`, so the requests this rescuer accepted
 * are also remembered in the browser (`mineIds`).
 */
export function useRescueActions(userId: string | undefined, refresh: () => void) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mineIds, setMineIds] = useState<Set<string>>(() => loadMine(userId));

  const remember = useCallback(
    (id: string) => {
      setMineIds((prev) => {
        const next = new Set(prev).add(id);
        saveMine(userId, next);
        return next;
      });
    },
    [userId],
  );

  const accept = useCallback(
    async (id: string) => {
      setBusyId(id);
      setError(null);
      try {
        await rescueService.acceptRequest(id);
        remember(id);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Không thể tiếp nhận ca cứu hộ.");
      } finally {
        setBusyId(null);
        refresh();
      }
    },
    [refresh, remember],
  );

  const advance = useCallback(
    async (id: string, next: "in_progress" | "assisted") => {
      setBusyId(id);
      setError(null);
      try {
        const note =
          next === "in_progress"
            ? "Đội cứu hộ đang có mặt tại hiện trường"
            : "Đã hoàn tất hỗ trợ an toàn";
        await rescueService.updateStatus(id, next, note);
        remember(id);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Cập nhật trạng thái thất bại.");
      } finally {
        setBusyId(null);
        refresh();
      }
    },
    [refresh, remember],
  );

  const clearError = useCallback(() => setError(null), []);

  return { busyId, error, mineIds, accept, advance, clearError };
}
