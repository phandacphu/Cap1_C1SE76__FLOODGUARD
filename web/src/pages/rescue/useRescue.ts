import { useState, useEffect, useCallback, useRef } from 'react';
import type { RescueRequest, SosStatus, UrgencyLevel } from '../../types/rescue';
import { rescueService } from '../../api/rescueService';

interface EnrichedRescueRequest extends RescueRequest {
  assignmentFetchFailed?: boolean;
  assignedStaffId?: string;
}

export const useRescue = (
  statusFilter?: string,
  urgencyFilter?: string,
  sortFilter?: string,
  searchFilter?: string
) => {
  const [requests, setRequests] = useState<EnrichedRescueRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const latestRequestIdRef = useRef<number>(0);

  // Lấy currentUserId an toàn từ floodguard_user
  let currentUserId = '';
  try {
    const userRaw = localStorage.getItem('floodguard_user');
    if (userRaw) {
      const parsed = JSON.parse(userRaw) as Record<string, unknown>;
      if (typeof parsed === 'object' && parsed !== null) {
        currentUserId = String(parsed.id || parsed.userId || '');
      }
    }
  } catch {
    currentUserId = '';
  }

  const triggerReload = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const currentRequestId = ++latestRequestIdRef.current;

    const loadData = async () => {
      try {
        setLoading(true);
        setFetchError(null);
        const data = await rescueService.getRescueRequests({
          status: statusFilter ? (statusFilter as SosStatus) : undefined,
          urgency: urgencyFilter ? (urgencyFilter as UrgencyLevel) : undefined,
          sort: sortFilter || undefined,
        });

        // Làm giàu assignment thật từ Backend getRescueDetail
        const enrichedData: EnrichedRescueRequest[] = await Promise.all(
          data.map(async (req) => {
            const raw = req as unknown as Record<string, unknown>;
            if (req.status === 'received' || req.status === 'in_progress') {
              try {
                const detail = (await rescueService.getRescueDetail(req.id)) as unknown as Record<string, unknown>;
                const detailAssignment = detail.assignment as Record<string, unknown> | undefined;
                const assignedStaffId = String(
                  detailAssignment?.rescueStaffId ||
                  detail.assignedStaffId ||
                  detail.assignedTo ||
                  raw.assignedStaffId ||
                  ''
                );

                return {
                  ...req,
                  assignment: (detail.assignment as typeof req.assignment) || req.assignment,
                  assignedStaffId,
                  assignmentFetchFailed: false,
                };
              } catch {
                return {
                  ...req,
                  assignmentFetchFailed: true,
                };
              }
            }
            return {
              ...req,
              assignedStaffId: String(raw.assignedStaffId || raw.assignedTo || ''),
            };
          })
        );

        if (!isCancelled && currentRequestId === latestRequestIdRef.current) {
          setRequests(enrichedData);
        }
      } catch (err: unknown) {
        if (!isCancelled && currentRequestId === latestRequestIdRef.current) {
          const msg = err instanceof Error ? err.message : 'Lỗi khi tải dữ liệu cứu hộ từ máy chủ';
          setFetchError(msg);
        }
      } finally {
        if (!isCancelled && currentRequestId === latestRequestIdRef.current) {
          setLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      isCancelled = true;
    };
  }, [statusFilter, urgencyFilter, sortFilter, refreshTrigger]);

  const handleAcceptRequest = async (id: string) => {
    try {
      setActionLoadingId(id);
      setActionError(null);
      await rescueService.acceptRequest(id);
      triggerReload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tiếp nhận ca cứu hộ';
      setActionError(msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleUpdateRescueStatus = async (
    id: string,
    nextStatus: 'in_progress' | 'assisted'
  ) => {
    try {
      setActionLoadingId(id);
      setActionError(null);
      const note =
        nextStatus === 'in_progress'
          ? 'Tác chiến cứu hộ đang diễn ra tại hiện trường'
          : 'Đã hoàn tất hỗ trợ an toàn';
      await rescueService.updateStatus(id, nextStatus, note);
      triggerReload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Cập nhật trạng thái tác chiến thất bại';
      setActionError(msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Tính toán KPI chính xác theo thời gian thực
  const now = new Date();
  const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const newRequestsCount = requests.filter((r) => r.status === 'submitted').length;
  const newLast15MinCount = requests.filter((r) => {
    if (r.status !== 'submitted') return false;
    const createdAt = new Date(r.createdAt).getTime();
    return !isNaN(createdAt) && createdAt >= fifteenMinutesAgo.getTime();
  }).length;

  const inProgressCount = requests.filter((r) => r.status === 'in_progress' || r.status === 'received').length;
  
  const assistedTodayCount = requests.filter((r) => {
    if (r.status !== 'assisted') return false;
    const updatedTime = new Date(r.updatedAt || r.createdAt).getTime();
    return !isNaN(updatedTime) && updatedTime >= startOfToday;
  }).length;

  const myAssignedCount = requests.filter((r) => {
    const raw = r as unknown as Record<string, unknown>;
    const staffId = r.assignment?.rescueStaffId || r.assignedStaffId || raw.assignedTo;
    return Boolean(currentUserId && staffId === currentUserId);
  }).length;

  // Lọc tìm kiếm
  const displayedRequests = requests.filter((req) => {
    if (!searchFilter?.trim()) return true;
    const q = searchFilter.toLowerCase();
    const raw = req as unknown as Record<string, unknown>;
    const name = String(raw.senderName || raw.contactName || raw.name || '');
    return name.toLowerCase().includes(q) || (req.note || '').toLowerCase().includes(q) || req.id.toLowerCase().includes(q);
  });

  return {
    requests,
    displayedRequests,
    loading,
    fetchError,
    actionError,
    setActionError,
    actionLoadingId,
    currentUserId,
    triggerReload,
    handleAcceptRequest,
    handleUpdateRescueStatus,
    kpi: {
      newRequestsCount,
      newLast15MinCount,
      inProgressCount,
      assistedTodayCount,
      myAssignedCount,
      totalRequests: requests.length,
    },
  };
};
