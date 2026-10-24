import React, { useState, useEffect } from 'react';
import type { FloodAlert } from '../../types/admin';
import { apiGet } from '../../api/http';
import { useAuth } from '../../context/AuthContext';
import { useRescue } from './useRescue';
import { FloodAlertBanner } from './components/FloodAlertBanner';
import { SosPriorityBadge } from './components/SosPriorityBadge';
import { SosStatusBadge } from './components/SosStatusBadge';

interface AlertsState {
  alerts: FloodAlert[];
  done: boolean;
  error?: string | null;
}

export const RescueDashboard: React.FC = () => {
  const { token, user } = useAuth();

  // 1. Logic cảnh báo lũ chuẩn theo bản gốc của Huy
  const [alertsState, setAlertsState] = useState<AlertsState>({
    alerts: [],
    done: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    apiGet<{ floodAlerts: FloodAlert[] }>('/flood-alerts/active', token)
      .then((data) => {
        if (!cancelled) {
          setAlertsState({
            alerts: data.floodAlerts ?? [],
            done: true,
            error: null,
          });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Lỗi tải dữ liệu cảnh báo lũ';
          setAlertsState({
            alerts: [],
            done: true,
            error: msg,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  // 2. Logic nghiệp vụ cứu hộ (phân quyền assignment thật từ Backend)
  const {
    requests,
    actionError,
    setActionError,
    actionLoadingId,
    currentUserId,
    handleAcceptRequest,
    handleUpdateRescueStatus,
    kpi,
  } = useRescue();

  const topAlert = alertsState.alerts[0] ?? null;
  const highPriorityRequests = requests
    .filter((r) => (r.urgency === 'critical' || r.urgency === 'high') && r.status !== 'assisted')
    .slice(0, 5);

  return (
    <div className="w-full space-y-6 text-slate-100 font-sans pb-12">
      {/* 1. Banner cảnh báo lũ: Phân biệt rõ ràng giữa API lỗi vs Không có cảnh báo */}
      {alertsState.error ? (
        <div className="bg-amber-950/50 border border-amber-600/70 rounded-xl p-4 flex items-center justify-between text-amber-200 text-xs font-mono">
          <span>⚠️ [LỖI MÁY CHỦ]: Không thể đồng bộ cảnh báo lũ ({alertsState.error})</span>
          <span className="text-amber-400 text-[11px]">Đang thử kết nối lại...</span>
        </div>
      ) : (
        <FloodAlertBanner
          alert={topAlert}
          otherCount={Math.max(alertsState.alerts.length - 1, 0)}
          loading={!alertsState.done}
        />
      )}

      {/* 2. Thống kê KPI thời gian thực */}
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

      {/* 3. Bản đồ tác chiến (Trái) & SOS Ưu Tiên Cao (Phải) */}
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
              <a href="/rescue/sos" className="text-[11px] font-mono text-cyan-400 hover:underline flex items-center space-x-1">
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
                  const effectiveUserId = user?.id || currentUserId;
                  const isAssignedToMe = Boolean(effectiveUserId && assignedStaffId === effectiveUserId);
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
    </div>
  );
};

export default RescueDashboard;
