
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
  key: string;
  updatedAt: Date | null;
}

/** Loads SOS requests and refreshes every 15 seconds or on demand. */
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

    setState((prev) => ({
      ...prev,
      error: null,
    }));

    rescueService
      .getRescueRequests({ status, urgency, sort })
      .then((requests) => {
        if (!cancelled) {
          setState({
            requests,
            error: null,
            key,
            updatedAt: new Date(),
          });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;

        const message =
          err instanceof Error
            ? err.message
            : "Không thể tải danh sách SOS.";

        setState((prev) => ({
          ...prev,
          error: message,
          key,
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [status, urgency, sort, key]);

  useEffect(() => {
    const id = window.setInterval(
      () => setRound((current) => current + 1),
      AUTO_REFRESH_MS,
    );

    return () => window.clearInterval(id);
  }, []);

  const refresh = useCallback(() => {
    setRound((current) => current + 1);
  }, []);

  return {
    requests: state.requests,
    error: state.error,
    updatedAt: state.updatedAt,
    loading: state.key !== key,
    refresh,
  };
}

/** Accepts SOS requests and updates statuses through the backend API. */
export function useRescueActions(refresh: () => void) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accept = useCallback(
    async (id: string) => {
      setBusyId(id);
      setError(null);

      try {
        await rescueService.acceptRequest(id);
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : "Không thể tiếp nhận ca cứu hộ.",
        );
      } finally {
        setBusyId(null);
        refresh();
      }
    },
    [refresh],
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
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : "Cập nhật trạng thái thất bại.",
        );
      } finally {
        setBusyId(null);
        refresh();
      }
    },
    [refresh],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    busyId,
    error,
    accept,
    advance,
    clearError,
  };
}
