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

    rescueService
      .getRescueRequests({ status, urgency, sort })
      .then(async (requests) => {
        if (cancelled) return;

        // Lọc các ca đã có người tiếp nhận cần lấy thông tin assignment
        const activeRequests = requests.filter(
          (r) => r.status === "received" || r.status === "in_progress"
        );

        // Fetch API chi tiết song song
        const details = await Promise.all(
          activeRequests.map(async (r) => {
            try {
              const detailRes = await rescueService.getRescueDetail(r.id);
              return { id: r.id, data: detailRes };
            } catch {
              return null;
            }
          })
        );

        // Gộp dữ liệu linh hoạt: Bắt cả dạng Nested (bọc trong assignment) và Dạng phẳng (Flat)
        const mergedRequests = requests.map((r) => {
          const detailObj = details.find((d) => d?.id === r.id);
          const actualData = detailObj?.data?.data || detailObj?.data;
          
          // Tự động thích nghi: Nếu có assignment thì lấy, nếu Backend ném thẳng rescueStaffId ra ngoài thì tự bọc lại
          let assignmentObj = actualData?.assignment;
          if (!assignmentObj && actualData?.rescueStaffId) {
            assignmentObj = { rescueStaffId: actualData.rescueStaffId };
          }

          return assignmentObj ? { ...r, assignment: assignmentObj } : r;
        });

        if (!cancelled) {
          setState({
            requests: mergedRequests,
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