import React, { useState, useEffect } from 'react';
import { useRescue } from './useRescue';
import { FloodAlertBanner } from './components/FloodAlertBanner';
import { SosFilterBar, type SortMode } from './components/SosFilterBar';
import { SosPriorityBadge } from './components/SosPriorityBadge';
import { SosStatusBadge } from './components/SosStatusBadge';
import { RescueSosList } from './RescueSosList';
import { rescueService } from '../../api/rescueService';

interface FloodAlertItem {
  id?: string;
  title?: string;
  description?: string;
  severity?: string;
  level?: string;
  [key: string]: unknown;
}

export const RescueDashboard: React.FC = () => {
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('');
  const [sortFilter, setSortFilter] = useState<SortMode>('priority' as SortMode);

  // Khai báo kiểu tường minh, không dùng any
  const [alert, setAlert] = useState<FloodAlertItem | null>(null);
  const [otherCount, setOtherCount] = useState<number>(0);
  const [alertLoading, setAlertLoading] = useState<boolean>(true);

  useEffect(() => {
    let isCancelled = false;
    const fetchAlerts = async () => {
      try {
        setAlertLoading(true);
        const serviceRecord = rescueService as unknown as Record<string, unknown>;
        if (typeof serviceRecord.getActiveFloodAlerts === 'function') {
          const alerts = (await (serviceRecord.getActiveFloodAlerts as () => Promise<unknown>)()) as unknown[];
          if (!isCancelled && Array.isArray(alerts)) {
            setAlert((alerts[0] as FloodAlertItem) || null);
            setOtherCount(Math.max(0, alerts.length - 1));
          }
        }
      } catch {
        if (!isCancelled) {
          setAlert(null);
          setOtherCount(0);
        }
      } finally {
        if (!isCancelled) setAlertLoading(false);
      }
    };
    void fetchAlerts();
    return () => {
      isCancelled = true;
    };
  }, []);

  const {
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
    kpi,
  } = useRescue(statusFilter, urgencyFilter, sortFilter, searchFilter);

  const handleResetFilters = () => {
    setSearchFilter('');
    setStatusFilter('');
    setUrgencyFilter('');
    setSortFilter('priority' as SortMode);
  };

  const highPriorityRequests = requests
    .filter((r) => (r.urgency === 'critical' || r.urgency === 'high') && r.status !== 'assisted')
    .slice(0, 5);

  return (
    <div className="w-full space-y-6 text-slate-100 font-sans pb-12">
      {/* 1. Banner cảnh báo lũ */}
      <FloodAlertBanner alert={alert as never} otherCount={otherCount} loading={alertLoading} />

      {/* 2. Thống kê KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#081B30]/70 border border-[#1E3A5F]/60 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 font-medium">SOS mới</span>
            <span className="w-6 h-6 rounded bg-rose-950/60 border border-rose-600/40 text-rose-400 text-xs flex items-center justify-center font-bold">!</span>
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold font-mono text-rose-500">
              {kpi.newRequestsCount < 10 ? `0${kpi.newRequestsCount}` : kpi.newRequestsCount}
            </div>
            <p className="text-[11px] font-mono text-slate-400 mt-0.5">
              +{kpi.newLast15MinCount} trong 15 phút qua
            </p>
          </div>
          <div className="flex justify-between text-[11px] font-mono text-slate-400 border-t border-[#1E3A5F]/40 pt-2">
            <span>KHẨN CẤP CHƯA NHẬN</span>
            <span className="text-white font-bold">{kpi.newRequestsCount}</span>
          </div>
        </div>

        <div className="bg-[#081B30]/70 border border-[#1E3A5F]/60 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 font-medium">Đang xử lý</span>
            <span className="w-6 h-6 rounded bg-amber-950/60 border border-amber-600/40 text-amber-400 text-xs flex items-center justify-center">⚡</span>
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold font-mono text-amber-400">
              {kpi.inProgressCount < 10 ? `0${kpi.inProgressCount}` : kpi.inProgressCount}
            </div>
            <p className="text-[11px] font-mono text-slate-400 mt-0.5">Ca đang cứu hộ ngoài hiện trường</p>
          </div>
          <div className="flex justify-between text-[11px] font-mono text-slate-400 border-t border-[#1E3A5F]/40 pt-2">
            <span>PHÂN CÔNG CHO TÔI</span>
            <span className="text-white font-bold">{kpi.myAssignedCount}</span>
          </div>
        </div>

        <div className="bg-[#081B30]/70 border border-[#1E3A5F]/60 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 font-medium">Đã hỗ trợ hôm nay</span>
            <span className="w-6 h-6 rounded bg-emerald-950/60 border border-emerald-600/40 text-emerald-400 text-xs flex items-center justify-center">✓</span>
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold font-mono text-emerald-400">
              {kpi.assistedTodayCount < 10 ? `0${kpi.assistedTodayCount}` : kpi.assistedTodayCount}
            </div>
            <p className="text-[11px] font-mono text-slate-400 mt-0.5">
              {kpi.totalRequests > 0
                ? `${((kpi.assistedTodayCount / kpi.totalRequests) * 100).toFixed(1)}%`
                : '0%'} tổng ca đã hoàn tất
            </p>
          </div>
          <div className="flex justify-between text-[11px] font-mono text-slate-400 border-t border-[#1E3A5F]/40 pt-2">
            <span>TỔNG YÊU CẦU</span>
            <span className="text-white font-bold">{kpi.totalRequests}</span>
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
              {kpi.assistedTodayCount > 0 ? 'Duy trì dưới 15 phút' : 'Chưa có ca hoàn tất tính toán'}
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

      {/* 3. Bản đồ & SOS Ưu Tiên Cao */}
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

      {/* 4. Bảng SOS toàn diện */}
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
          <RescueSosList
            requests={displayedRequests}
            loading={loading}
            fetchError={fetchError}
            actionLoadingId={actionLoadingId}
            currentUserId={currentUserId}
            onAccept={handleAcceptRequest}
            onUpdateStatus={handleUpdateRescueStatus}
            onReload={triggerReload}
          />
        </div>
      </div>
    </div>
  );
};

export default RescueDashboard;
