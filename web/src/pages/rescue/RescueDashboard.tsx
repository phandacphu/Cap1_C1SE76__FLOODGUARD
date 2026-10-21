import React, { useEffect, useState, useRef } from 'react';
import type { RescueRequest, SosStatus, UrgencyLevel } from '../../types/rescue';
import { rescueService } from '../../api/rescueService';
import { SosFilterBar, type SortMode } from './components/SosFilterBar';
import { SosPriorityBadge } from './components/SosPriorityBadge';
import { SosStatusBadge } from './components/SosStatusBadge';

interface EnrichedRescueRequest extends RescueRequest {
  assignmentFetchFailed?: boolean;
  assignedStaffId?: string;
  senderName?: string;
}

export const RescueDashboard: React.FC = () => {
  const [requests, setRequests] = useState<EnrichedRescueRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const [searchFilter, setSearchFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('');
  const [sortFilter, setSortFilter] = useState<SortMode>('priority' as SortMode);

  const latestRequestIdRef = useRef<number>(0);

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

        const enrichedData: EnrichedRescueRequest[] = await Promise.all(
          data.map(async (req) => {
            const reqRecord = req as unknown as Record<string, unknown>;
            if (req.status === 'received' || req.status === 'in_progress') {
              try {
                const detail = (await rescueService.getRescueDetail(req.id)) as unknown as Record<string, unknown>;
                const detailAssignment = detail.assignment as Record<string, unknown> | undefined;
                const assignedStaffId = String(
                  detailAssignment?.rescueStaffId ||
                  detail.assignedStaffId ||
                  detail.assignedTo ||
                  reqRecord.assignedStaffId ||
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
              assignedStaffId: String(reqRecord.assignedStaffId || reqRecord.assignedTo || ''),
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

  const triggerReload = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

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

  const handleResetFilters = () => {
    setSearchFilter('');
    setStatusFilter('');
    setUrgencyFilter('');
    setSortFilter('priority' as SortMode);
  };

  const newRequestsCount = requests.filter((r) => r.status === 'submitted').length;
  const inProgressCount = requests.filter((r) => r.status === 'in_progress' || r.status === 'received').length;
  const assistedCount = requests.filter((r) => r.status === 'assisted').length;
  const myAssignedCount = requests.filter((r) => {
    const raw = r as unknown as Record<string, unknown>;
    const staffId = r.assignment?.rescueStaffId || r.assignedStaffId || raw.assignedTo;
    return staffId === currentUserId;
  }).length;

  const highPriorityRequests = requests
    .filter((r) => (r.urgency === 'critical' || r.urgency === 'high') && r.status !== 'assisted')
    .slice(0, 5);

  const displayedRequests = requests.filter((req) => {
    if (!searchFilter.trim()) return true;
    const query = searchFilter.toLowerCase();
    const raw = req as unknown as Record<string, unknown>;
    const name = String(raw.senderName || raw.contactName || raw.name || '');
    const note = req.note || '';
    const id = req.id || '';
    return name.toLowerCase().includes(query) || note.toLowerCase().includes(query) || id.toLowerCase().includes(query);
  });

  return (
    <div className="w-full space-y-6 text-slate-100 font-sans pb-12">
      {/* 1. Banner thông báo lũ */}
      <div className="bg-[#051424]/80 border border-[#1E3A5F]/70 rounded-xl p-4 flex items-center space-x-3.5 backdrop-blur-md">
        <div className="w-10 h-10 rounded-lg bg-emerald-950/60 border border-emerald-600/40 flex items-center justify-center text-emerald-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white tracking-wide">Hiện không có cảnh báo lũ đang hiệu lực</h2>
          <p className="text-xs text-slate-400 mt-0.5">Cảnh báo mới sẽ xuất hiện tại đây ngay khi quản trị viên ban hành.</p>
        </div>
      </div>

      {/* 2. Thống kê số liệu */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#081B30]/70 border border-[#1E3A5F]/60 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 font-medium">SOS mới</span>
            <span className="w-6 h-6 rounded bg-rose-950/60 border border-rose-600/40 text-rose-400 text-xs flex items-center justify-center font-bold">!</span>
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold font-mono text-rose-500">
              {newRequestsCount < 10 ? `0${newRequestsCount}` : newRequestsCount}
            </div>
            <p className="text-[11px] font-mono text-slate-400 mt-0.5">+0 trong 15 phút qua</p>
          </div>
          <div className="flex justify-between text-[11px] font-mono text-slate-400 border-t border-[#1E3A5F]/40 pt-2">
            <span>KHẨN CẤP CHƯA NHẬN</span>
            <span className="text-white font-bold">{newRequestsCount}</span>
          </div>
        </div>

        <div className="bg-[#081B30]/70 border border-[#1E3A5F]/60 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 font-medium">Đang xử lý</span>
            <span className="w-6 h-6 rounded bg-amber-950/60 border border-amber-600/40 text-amber-400 text-xs flex items-center justify-center">⚡</span>
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold font-mono text-amber-400">
              {inProgressCount < 10 ? `0${inProgressCount}` :inProgressCount}
            </div>
            <p className="text-[11px] font-mono text-slate-400 mt-0.5">Ca đang cứu hộ ngoài hiện trường</p>
          </div>
          <div className="flex justify-between text-[11px] font-mono text-slate-400 border-t border-[#1E3A5F]/40 pt-2">
            <span>PHÂN CÔNG CHO TÔI</span>
            <span className="text-white font-bold">{myAssignedCount}</span>
          </div>
        </div>

        <div className="bg-[#081B30]/70 border border-[#1E3A5F]/60 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 font-medium">Đã hỗ trợ hôm nay</span>
            <span className="w-6 h-6 rounded bg-emerald-950/60 border border-emerald-600/40 text-emerald-400 text-xs flex items-center justify-center">✓</span>
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold font-mono text-emerald-400">
              {assistedCount < 10 ? `0${assistedCount}` : assistedCount}
            </div>
            <p className="text-[11px] font-mono text-slate-400 mt-0.5">
              {requests.length > 0 ? `${((assistedCount / requests.length) * 100).toFixed(1)}%` : '0%'} tổng ca đã hoàn tất
            </p>
          </div>
          <div className="flex justify-between text-[11px] font-mono text-slate-400 border-t border-[#1E3A5F]/40 pt-2">
            <span>TỔNG YÊU CẦU</span>
            <span className="text-white font-bold">{requests.length}</span>
          </div>
        </div>

        <div className="bg-[#081B30]/70 border border-[#1E3A5F]/60 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 font-medium">Thời gian phản hồi TB</span>
            <span className="w-6 h-6 rounded bg-cyan-950/60 border border-cyan-600/40 text-cyan-400 text-xs flex items-center justify-center">⏱</span>
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold font-mono text-cyan-400">—</div>
            <p className="text-[11px] font-mono text-slate-400 mt-0.5">
              {assistedCount > 0 ? 'Duy trì dưới 15 phút' : 'Chưa có ca hoàn tất tính toán'}
            </p>
          </div>
          <div className="flex justify-between text-[11px] font-mono text-slate-400 border-t border-[#1E3A5F]/40 pt-2">
            <span>TÍNH TRÊN</span>
            <span className="text-white font-bold">ca đã có người nhận</span>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="bg-red-950/70 border border-red-600 p-3.5 rounded-lg text-red-200 text-xs font-mono flex items-center justify-between">
          <div>[LỖI THAO TÁC]: {actionError}</div>
          <button type="button" onClick={() => setActionError(null)} className="text-red-400 hover:text-red-200">✕</button>
        </div>
      )}

      {/* 3. Bản đồ & SOS Ưu tiên cao */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#081B30]/70 border border-[#1E3A5F]/60 rounded-xl p-5 flex flex-col">
          <div className="flex items-center space-x-2 pb-4">
            <span className="text-cyan-400 text-base">🗺</span>
            <div>
              <h2 className="text-sm font-bold font-mono tracking-wider text-white uppercase">Bản Đồ Tác Chiến</h2>
              <p className="text-[11px] font-mono text-slate-400">SƠ ĐỒ VỊ TRÍ SOS ĐANG MỞ • GOOGLE MAPS SẼ THAY THẾ Ở CCF-105</p>
            </div>
          </div>
          <div className="flex-1 min-h-[300px] bg-[#030D1A]/90 border border-[#1E3A5F]/50 rounded-lg relative overflow-hidden flex items-center justify-center">
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 border-slate-800 pointer-events-none">
              <div className="border-r border-b border-[#1E3A5F]/20"></div>
              <div className="border-r border-b border-[#1E3A5F]/20"></div>
              <div className="border-b border-[#1E3A5F]/20"></div>
              <div className="border-r border-b border-[#1E3A5F]/20"></div>
              <div className="border-r border-b border-[#1E3A5F]/20"></div>
              <div className="border-b border-[#1E3A5F]/20"></div>
              <div className="border-r border-b border-[#1E3A5F]/20"></div>
              <div className="border-r border-b border-[#1E3A5F]/20"></div>
              <div></div>
            </div>
            <div className="absolute bottom-4 left-4 flex items-center space-x-2">
              <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping"></span>
              <span className="text-[11px] font-mono text-slate-400">GPS Radar Online</span>
            </div>
          </div>
        </div>

        <div className="bg-[#081B30]/70 border border-[#1E3A5F]/60 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-[#1E3A5F]/40">
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-amber-400 text-xs">⚠️</span>
                  <h2 className="text-xs font-bold font-mono tracking-wider text-white uppercase">SOS Ưu Tiên Cao</h2>
                </div>
                <p className="text-[10px] font-mono text-slate-400 mt-0.5">CẦN XỬ LÝ VÀ ĐIỀU ĐỘNG TỨC THÌ</p>
              </div>
              <a href="#sos-full-table" className="text-[11px] font-mono text-cyan-400 hover:underline flex items-center space-x-1">
                <span>Xem tất cả</span>
                <span>→</span>
              </a>
            </div>

            <div className="space-y-3 mt-4 max-h-[380px] overflow-y-auto pr-1">
              {highPriorityRequests.length === 0 ? (
                <div className="text-center py-8 text-xs font-mono text-slate-400">
                  Không có ca SOS mức độ cao hoặc khẩn cấp chưa xử lý.
                </div>
              ) : (
                highPriorityRequests.map((item) => {
                  const isProcessing = actionLoadingId === item.id;
                  const rawItem = item as unknown as Record<string, unknown>;
                  const assignedStaffId = String(
                    item.assignment?.rescueStaffId || item.assignedStaffId || rawItem.assignedTo || ''
                  );
                  const isAssignedToMe = Boolean(currentUserId && assignedStaffId === currentUserId);
                  const displayName = String(rawItem.senderName || rawItem.contactName || rawItem.name || 'Yêu cầu cứu hộ khẩn cấp');

                  return (
                    <div key={item.id} className="bg-[#051424] border border-[#1E3A5F]/70 rounded-lg p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-cyan-300">#{item.id.slice(0, 8)}</span>
                        <div className="flex items-center space-x-1.5">
                          <SosPriorityBadge urgency={item.urgency} />
                          <SosStatusBadge status={item.status} />
                        </div>
                      </div>

                      <div className="text-xs font-mono text-slate-300">
                        <span className="text-white font-semibold">{item.numberOfPeople} người</span> — {item.note || displayName}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <div className="text-[10px] font-mono text-slate-400">
                          📍 {item.location.latitude.toFixed(4)}° N, {item.location.longitude.toFixed(4)}° E
                        </div>

                        <div>
                          {item.status === 'submitted' && (
                            <button
                              type="button"
                              onClick={() => { void handleAcceptRequest(item.id); }}
                              disabled={isProcessing}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-mono font-semibold transition-colors disabled:opacity-50"
                            >
                              {isProcessing ? 'Đang nhận...' : 'Tiếp nhận'}
                            </button>
                          )}
                          {item.status === 'received' && isAssignedToMe && (
                            <button
                              type="button"
                              onClick={() => { void handleUpdateRescueStatus(item.id, 'in_progress'); }}
                              disabled={isProcessing}
                              className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-[11px] font-mono font-semibold transition-colors disabled:opacity-50"
                            >
                              {isProcessing ? '...' : 'Bắt đầu'}
                            </button>
                          )}
                          {item.status === 'in_progress' && isAssignedToMe && (
                            <button
                              type="button"
                              onClick={() => { void handleUpdateRescueStatus(item.id, 'assisted'); }}
                              disabled={isProcessing}
                              className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-[11px] font-mono font-semibold transition-colors disabled:opacity-50"
                            >
                              {isProcessing ? '...' : 'Hoàn tất'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Danh sách SOS toàn diện */}
      <div id="sos-full-table" className="pt-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#1E3A5F]/50 pb-3">
          <div>
            <h2 className="text-lg font-bold font-mono tracking-tight text-white uppercase">
              Danh Sách Yêu Cầu SOS Toàn Khu Vực
            </h2>
            <p className="text-xs font-mono text-slate-400 mt-0.5">
              Bộ lọc nâng cao, quản lý trạng thái và tiếp nhận nhiệm vụ
            </p>
          </div>

          <button
            type="button"
            onClick={triggerReload}
            disabled={loading}
            className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-mono font-medium transition-colors shadow-lg shadow-cyan-950/50 flex items-center space-x-1.5 disabled:opacity-50 self-start sm:self-auto"
          >
            <span>{loading ? 'Đang đồng bộ...' : 'Làm mới dữ liệu'}</span>
          </button>
        </div>

        <SosFilterBar
          search={searchFilter}
          status={statusFilter}
          urgency={urgencyFilter}
          sort={sortFilter}
          onSearch={setSearchFilter}
          onStatus={setStatusFilter}
          onUrgency={setUrgencyFilter}
          onSort={(mode) => setSortFilter(mode)}
          onReset={handleResetFilters}
        />

        <div className="bg-[#081B30]/80 border border-[#1E3A5F] rounded-xl overflow-hidden backdrop-blur-sm shadow-xl">
          {loading ? (
            <div className="p-12 text-center font-mono text-xs text-slate-400 space-y-3">
              <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <div>Đang kết nối trung tâm điều phối Render...</div>
            </div>
          ) : fetchError ? (
            <div className="p-12 text-center font-mono text-xs text-red-400">
              Không thể tải danh sách cứu hộ do sự cố máy chủ. Vui lòng bấm &quot;Làm mới dữ liệu&quot; để thử lại.
            </div>
          ) : displayedRequests.length === 0 ? (
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
                  {displayedRequests.map((item) => {
                    const isProcessing = actionLoadingId === item.id;
                    const rawItem = item as unknown as Record<string, unknown>;
                    const assignedStaffId = String(
                      item.assignment?.rescueStaffId || item.assignedStaffId || rawItem.assignedTo || ''
                    );
                    const hasAssignment = Boolean(assignedStaffId);
                    const isAssignedToMe = Boolean(currentUserId && assignedStaffId === currentUserId);

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

                          {item.status === 'received' && (
                            item.assignmentFetchFailed ? (
                              <span className="text-[11px] font-mono text-amber-400 italic">
                                Lỗi tải thông tin ca
                              </span>
                            ) : isAssignedToMe ? (
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

                          {item.status === 'in_progress' && (
                            item.assignmentFetchFailed ? (
                              <span className="text-[11px] font-mono text-amber-400 italic">
                                Lỗi tải thông tin ca
                              </span>
                            ) : isAssignedToMe ? (
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
    </div>
  );
};

export default RescueDashboard;
