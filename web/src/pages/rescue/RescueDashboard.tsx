import React, { useEffect, useState, useRef } from 'react';
import type { RescueRequest, SosStatus, UrgencyLevel } from '../../types/rescue';
import { rescueService } from '../../api/rescueService';
import { SosFilterBar } from './components/SosFilterBar';
import { SosPriorityBadge } from './components/SosPriorityBadge';
import { SosStatusBadge } from './components/SosStatusBadge';

export const RescueDashboard: React.FC = () => {
  const [requests, setRequests] = useState<RescueRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // CCF-106: State bộ lọc
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('');
  const [sortByPriority, setSortByPriority] = useState<boolean>(true);

  const latestRequestIdRef = useRef<number>(0);

  // Điểm 3: Parse localStorage an toàn tuyệt đối
  let currentUserId = '';
  let currentUserName = 'Rescue Staff';
  try {
    const userRaw = localStorage.getItem('floodguard_user');
    if (userRaw) {
      const parsed = JSON.parse(userRaw) as Record<string, unknown>;
      if (typeof parsed === 'object' && parsed !== null) {
        currentUserId = String(parsed.id || parsed.userId || '');
        currentUserName = String(parsed.name || parsed.fullName || currentUserId || 'Rescue Staff');
      }
    }
  } catch {
    // Dữ liệu localStorage bị lỗi/hỏng, reset về rỗng
    currentUserId = '';
  }

  useEffect(() => {
    let isCancelled = false;
    const currentRequestId = ++latestRequestIdRef.current;

    const loadData = async () => {
      try {
        setLoading(true);
        setErrorMsg(null);
        const data = await rescueService.getRescueRequests({
          status: statusFilter ? (statusFilter as SosStatus) : undefined,
          urgency: urgencyFilter ? (urgencyFilter as UrgencyLevel) : undefined,
          sort: sortByPriority ? 'priority' : undefined,
        });

        if (!isCancelled && currentRequestId === latestRequestIdRef.current) {
          setRequests(data);
        }
      } catch (err: unknown) {
        if (!isCancelled && currentRequestId === latestRequestIdRef.current) {
          const msg = err instanceof Error ? err.message : 'Lỗi khi tải danh sách SOS từ máy chủ';
          setErrorMsg(msg);
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
  }, [statusFilter, urgencyFilter, sortByPriority, refreshTrigger]);

  const triggerReload = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  // CCF-108: Tiếp nhận
  const handleAcceptRequest = async (id: string) => {
    try {
      setActionLoadingId(id);
      setErrorMsg(null);
      await rescueService.acceptRequest(id);
      triggerReload(); // Chỉ reload khi thành công
    } catch (err: unknown) {
      // Điểm 2: Giữ nguyên thông báo lỗi, KHÔNG gọi triggerReload để tránh bị ghi đè mất thông báo
      const msg = err instanceof Error ? err.message : 'Không thể tiếp nhận ca cứu hộ';
      setErrorMsg(msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  // CCF-109: Cập nhật trạng thái
  const handleUpdateRescueStatus = async (
    id: string,
    nextStatus: 'in_progress' | 'assisted'
  ) => {
    try {
      setActionLoadingId(id);
      setErrorMsg(null);
      const note =
        nextStatus === 'in_progress'
          ? 'Tác chiến cứu hộ đang diễn ra tại hiện trường'
          : 'Đã hoàn tất hỗ trợ an toàn';
      await rescueService.updateStatus(id, nextStatus, note);
      triggerReload(); // Chỉ reload khi thành công
    } catch (err: unknown) {
      // Điểm 2: Giữ nguyên thông báo lỗi, KHÔNG gọi triggerReload
      const msg = err instanceof Error ? err.message : 'Cập nhật trạng thái tác chiến thất bại';
      setErrorMsg(msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResetFilters = () => {
    setStatusFilter('');
    setUrgencyFilter('');
    setSortByPriority(true);
  };

  return (
    <div className="min-h-screen bg-[#010F1F] text-slate-100 flex flex-col font-sans">
      <aside className="fixed left-0 top-0 bottom-0 w-[260px] bg-[#051424] border-r border-[#1E3A5F]/60 flex flex-col z-20">
        <div className="p-6 border-b border-[#1E3A5F]/60">
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 bg-cyan-400 rounded-full animate-ping"></span>
            <span className="text-lg font-bold font-mono tracking-widest text-cyan-400">
              FLOODGUARD
            </span>
          </div>
          <p className="text-[11px] font-mono text-slate-400 mt-1">RESCUE OPERATION CENTER</p>
        </div>

        <nav className="p-4 space-y-1 font-mono text-xs">
          <div className="px-3 py-2 text-cyan-400 bg-cyan-950/40 border border-cyan-800/60 rounded flex items-center justify-between">
            <span>● Yêu cầu SOS</span>
            <span className="text-[10px] bg-cyan-500/20 px-1.5 py-0.5 rounded font-bold">
              {requests.length}
            </span>
          </div>
          <div className="px-3 py-2 text-slate-400 hover:text-slate-200 hover:bg-[#0A1C30] rounded cursor-pointer transition-colors">
            Bản đồ vị trí SOS
          </div>
          <div className="px-3 py-2 text-slate-400 hover:text-slate-200 hover:bg-[#0A1C30] rounded cursor-pointer transition-colors">
            Cảnh báo lũ
          </div>
          <div className="px-3 py-2 text-slate-400 hover:text-slate-200 hover:bg-[#0A1C30] rounded cursor-pointer transition-colors">
            Địa điểm an toàn
          </div>
          <div className="px-3 py-2 text-slate-400 hover:text-slate-200 hover:bg-[#0A1C30] rounded cursor-pointer transition-colors">
            Lịch sử cứu hộ
          </div>
        </nav>

        <div className="mt-auto p-4 border-t border-[#1E3A5F]/60 font-mono text-[11px] text-slate-400">
          <div className="text-slate-300 font-bold truncate">Staff: {currentUserName}</div>
          <div className="text-emerald-400 mt-0.5">Trạng thái: Trực chiến</div>
        </div>
      </aside>

      <main className="pl-[260px] flex-1 flex flex-col min-w-0">
        <div className="max-w-[1280px] w-full mx-auto p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#1E3A5F]/50 pb-5">
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-2xl font-bold font-mono tracking-tight text-white uppercase">
                  Bảng Điều Khiển Cứu Hộ
                </h1>
                <span className="bg-cyan-950 text-cyan-400 border border-cyan-800/80 px-2 py-0.5 rounded text-[11px] font-mono">
                  STAFF MODE
                </span>
              </div>
              <p className="text-xs font-mono text-slate-400 mt-1">
                Tiếp nhận yêu cầu SOS và cập nhật tiến độ điều phối theo thời gian thực
              </p>
            </div>

            <button
              type="button"
              onClick={triggerReload}
              disabled={loading}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-mono font-medium transition-colors shadow-lg shadow-cyan-950/50 flex items-center space-x-2 disabled:opacity-50"
            >
              <span>{loading ? 'Đang đồng bộ...' : 'Làm mới dữ liệu'}</span>
            </button>
          </div>

          {errorMsg && (
            <div className="bg-red-950/60 border border-red-700/80 p-4 rounded text-red-200 text-xs font-mono flex items-center justify-between">
              <div>[LỖI HỆ THỐNG]: {errorMsg}</div>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="text-red-400 hover:text-red-200 text-sm ml-4"
              >
                ✕
              </button>
            </div>
          )}

          <SosFilterBar
            status={statusFilter}
            urgency={urgencyFilter}
            sortByPriority={sortByPriority}
            onStatusChange={setStatusFilter}
            onUrgencyChange={setUrgencyFilter}
            onPrioritySortToggle={setSortByPriority}
            onReset={handleResetFilters}
          />

          <div className="bg-[#0A1A2F]/80 border border-[#1E3A5F] rounded-lg overflow-hidden backdrop-blur-sm shadow-xl">
            {loading ? (
              <div className="p-12 text-center font-mono text-xs text-slate-400 space-y-3">
                <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <div>Đang kết nối trung tâm điều phối Render...</div>
              </div>
            ) : errorMsg ? (
              <div className="p-12 text-center font-mono text-xs text-red-400">
                Không thể tải danh sách cứu hộ do sự cố máy chủ. Vui lòng bấm &quot;Làm mới dữ liệu&quot; để thử lại.
              </div>
            ) : requests.length === 0 ? (
              <div className="p-12 text-center font-mono text-xs text-slate-400">
                Không tìm thấy tín hiệu yêu cầu SOS phù hợp với bộ lọc hiện tại.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[#1E3A5F]/70 text-xs font-mono">
                  <thead className="bg-[#051424]">
                    <tr>
                      <th className="px-4 py-3.5 text-left text-slate-400 uppercase tracking-wider">Mã SOS</th>
                      <th className="px-4 py-3.5 text-left text-slate-400 uppercase tracking-wider">Độ Ưu Tiên</th>
                      <th className="px-4 py-3.5 text-left text-slate-400 uppercase tracking-wider">Trạng Thái</th>
                      <th className="px-4 py-3.5 text-left text-slate-400 uppercase tracking-wider">Số Người</th>
                      <th className="px-4 py-3.5 text-left text-slate-400 uppercase tracking-wider">Tọa Độ GPS</th>
                      <th className="px-4 py-3.5 text-left text-slate-400 uppercase tracking-wider">Ghi Chú</th>
                      <th className="px-4 py-3.5 text-right text-slate-400 uppercase tracking-wider">Tác Chiến</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E3A5F]/40 bg-[#07172A]/40">
                    {requests.map((item) => {
                      const isProcessing = actionLoadingId === item.id;
                      
                      // Điểm 1: Linh hoạt giữa assignment lồng nhau hoặc assignedStaffId phẳng từ Backend contract
                      const rawItem = item as unknown as Record<string, unknown>;
                      const assignedStaffId = String(
                        item.assignment?.rescueStaffId || rawItem.assignedStaffId || rawItem.assignedTo || ''
                      );
                      
                      const hasAssignment = Boolean(assignedStaffId);
                      const isAssignedToMe = Boolean(
                        currentUserId && assignedStaffId && assignedStaffId === currentUserId
                      );

                      return (
                        <tr key={item.id} className="hover:bg-[#0C243B]/60 transition-colors">
                          <td className="px-4 py-3 text-cyan-300 font-bold">#{item.id.slice(0, 8)}</td>
                          <td className="px-4 py-3"><SosPriorityBadge urgency={item.urgency} /></td>
                          <td className="px-4 py-3"><SosStatusBadge status={item.status} /></td>
                          <td className="px-4 py-3 text-slate-200 font-semibold">{item.numberOfPeople} người</td>
                          <td className="px-4 py-3 text-slate-400">
                            {item.location.latitude.toFixed(4)}, {item.location.longitude.toFixed(4)}
                          </td>
                          <td className="px-4 py-3 text-slate-300 max-w-xs truncate" title={item.note || ''}>
                            {item.note || <span className="text-slate-500 italic">Không có ghi chú</span>}
                          </td>
                          <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                            {/* CCF-108: Tiếp nhận SOS (ca submitted) */}
                            {item.status === 'submitted' && (
                              <button
                                type="button"
                                onClick={() => { void handleAcceptRequest(item.id); }}
                                disabled={isProcessing}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-mono tracking-wider uppercase font-semibold transition-colors disabled:opacity-50"
                              >
                                {isProcessing ? 'Đang nhận...' : 'Tiếp nhận'}
                              </button>
                            )}

                            {/* CCF-109: Bắt đầu cứu hộ */}
                            {item.status === 'received' && (
                              isAssignedToMe ? (
                                <button
                                  type="button"
                                  onClick={() => { void handleUpdateRescueStatus(item.id, 'in_progress'); }}
                                  disabled={isProcessing}
                                  className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-[11px] font-mono tracking-wider uppercase font-semibold transition-colors disabled:opacity-50"
                                >
                                  {isProcessing ? '...' : 'Bắt đầu cứu hộ'}
                                </button>
                              ) : (
                                <span className="text-[11px] font-mono text-slate-500 italic">
                                  {hasAssignment ? 'Đã giao nhân sự khác' : 'Chờ phân công'}
                                </span>
                              )
                            )}

                            {/* CCF-109: Hoàn tất */}
                            {item.status === 'in_progress' && (
                              isAssignedToMe ? (
                                <button
                                  type="button"
                                  onClick={() => { void handleUpdateRescueStatus(item.id, 'assisted'); }}
                                  disabled={isProcessing}
                                  className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-[11px] font-mono tracking-wider uppercase font-semibold transition-colors disabled:opacity-50"
                                >
                                  {isProcessing ? '...' : 'Hoàn tất'}
                                </button>
                              ) : (
                                <span className="text-[11px] font-mono text-slate-500 italic">
                                  {hasAssignment ? 'Đã giao nhân sự khác' : 'Chờ phân công'}
                                </span>
                              )
                            )}

                            {item.status === 'assisted' && (
                              <span className="text-[11px] font-mono text-emerald-400">
                                ✓ Hoàn tất tác chiến
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default RescueDashboard;
