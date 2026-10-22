import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../../api/http";
import { RescueLayout } from "../../components/layout/RescueLayout";
import { Icon } from "../../components/ui/Icon";
import { useAuth } from "../../context/AuthContext";
import type { FloodAlert } from "../../types/admin";
import { KpiCard } from "../admin/components/KpiCard";
import { Panel } from "../admin/components/Panel";
import { SEVERITY_WEIGHT, formatNumber } from "../admin/adminStats";
import { FloodAlertBanner } from "./components/FloodAlertBanner";
import { SosActionButtons } from "./components/SosActionButtons";
import { SosPriorityBadge } from "./components/SosPriorityBadge";
import { SosScatterMap } from "./components/SosScatterMap";
import { SosStatusBadge } from "./components/SosStatusBadge";
import {
  computeKpis,
  formatCoords,
  isOpen,
  sortByUrgency,
  sosCode,
  timeAgo,
} from "./rescueStats";
import { useRescueActions, useRescueRequests } from "./useRescue";

interface AlertsState {
  alerts: FloodAlert[];
  done: boolean;
  error: boolean;
}

/** CCF-102: Rescue Staff home ("Tổng quan cứu hộ"). */
export function RescueDashboard() {
  const { user, token } = useAuth();
  const { requests, error, updatedAt, loading, refresh } = useRescueRequests({ sort: "priority" });
  const actions = useRescueActions(refresh);

  const [alertsState, setAlertsState] = useState<AlertsState>({ alerts: [], done: false, error: false });
  
  useEffect(() => {
    let cancelled = false;
    apiGet<{ floodAlerts: FloodAlert[] }>("/flood-alerts/active", token)
      .then((data) => {
        if (!cancelled) setAlertsState({ alerts: data.floodAlerts ?? [], done: true, error: false });
      })
      .catch(() => {
        if (!cancelled) setAlertsState({ alerts: [], done: true, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const view = useMemo(() => {
    if (!requests || !updatedAt) return null;
    
    // Chỉ kiểm tra quyền dựa vào assignment từ Backend, không dùng localStorage
    const isMine = (r: NonNullable<typeof requests>[number]) =>
      r.assignment?.rescueStaffId === user?.id;

    return {
      now: updatedAt,
      kpis: computeKpis(requests, updatedAt),
      priority: sortByUrgency(requests.filter((r) => r.status === "submitted" || r.status === "received")).slice(0, 3),
      mine: sortByUrgency(
        requests.filter((r) => (r.status === "received" || r.status === "in_progress") && isMine(r)),
      ),
      openCount: requests.filter((r) => isOpen(r.status)).length,
    };
  }, [requests, updatedAt, user?.id]);

  const topAlert = useMemo(
    () => [...alertsState.alerts].sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity])[0] ?? null,
    [alertsState.alerts],
  );

  const kpis = view?.kpis;
  
  // Quyền tiếp nhận/cập nhật phụ thuộc tuyệt đối vào assignment
  const canProgress = (assignedTo: string | undefined) =>
    !assignedTo || assignedTo === user?.id;

  return (
    <RescueLayout
      loading={loading}
      onRefresh={refresh}
      updatedAt={updatedAt}
      waitingCount={kpis?.waiting ?? 0}
    >
      <div className="mx-auto max-w-7xl space-y-5">
        
        {/* Phân biệt lỗi tải cảnh báo và không có cảnh báo */}
        {alertsState.error ? (
          <div className="flex items-center justify-center rounded-xl border border-border bg-card/60 p-4 text-sm text-warn">
            Lỗi kết nối máy chủ: Hiện không thể tải danh sách cảnh báo lũ.
          </div>
        ) : (
          <FloodAlertBanner
            alert={topAlert}
            otherCount={Math.max(alertsState.alerts.length - 1, 0)}
            loading={!alertsState.done}
          />
        )}

        {(error || actions.error) && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-xl border border-sos/50 bg-sos/10 p-3 text-sm text-red-200"
          >
            <span>{actions.error ?? error}</span>
            {actions.error && (
              <button type="button" onClick={actions.clearError} className="shrink-0 text-xs underline">
                Đóng
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="SOS mới"
            icon="sos"
            tone="sos"
            value={kpis ? String(kpis.waiting).padStart(2, "0") : "—"}
            sub={kpis ? `+${kpis.waitingLast15Min} trong 15 phút qua` : undefined}
            footerLabel="Khẩn cấp chưa nhận"
            footerValue={kpis ? String(kpis.criticalWaiting) : "—"}
          />
          <KpiCard
            label="Đang xử lý"
            icon="pulse"
            tone="warn"
            value={kpis ? String(kpis.inProgress).padStart(2, "0") : "—"}
            sub="Ca đang cứu hộ ngoài hiện trường"
            footerLabel="Phân công cho tôi"
            footerValue={view ? String(view.mine.length) : "—"}
          />
          <KpiCard
            label="Đã hỗ trợ hôm nay"
            icon="shield"
            tone="safe"
            value={kpis ? formatNumber(kpis.assistedToday) : "—"}
            sub={kpis?.successRate != null ? `${kpis.successRate.toFixed(1)}% tổng ca đã hoàn tất` : undefined}
            footerLabel="Tổng yêu cầu"
            footerValue={kpis ? formatNumber(kpis.total) : "—"}
          />
          <KpiCard
            label="Thời gian phản hồi TB"
            icon="clock"
            tone="water"
            value={kpis?.avgResponseMin != null ? kpis.avgResponseMin.toFixed(1) : "—"}
            sub={kpis?.avgResponseMin != null ? "phút từ lúc gửi đến lúc tiếp nhận" : "Chưa có ca được tiếp nhận"}
            footerLabel="Tính trên"
            footerValue="ca đã có người nhận"
          />
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <Panel
            title="Bản đồ tác chiến"
            subtitle="Sơ đồ vị trí SOS đang mở · Google Maps sẽ thay thế ở CCF-105"
            icon="map"
            className="xl:col-span-2"
          >
            {requests ? (
              <SosScatterMap requests={requests} />
            ) : (
              <div className="flex h-72 items-center justify-center font-mono text-xs text-muted">
                {error ? <span className="text-warn">Lỗi tải dữ liệu SOS.</span> : loading ? "Đang tải dữ liệu SOS..." : "Chưa có dữ liệu."}
              </div>
            )}
          </Panel>

          <Panel
            title="SOS ưu tiên cao"
            subtitle="Cần xử lý và điều động tức thì"
            icon="sos"
            tag={
              <Link to="/rescue/sos" className="font-mono text-[11px] text-safe hover:underline">
                Xem tất cả →
              </Link>
            }
          >
            {!view ? (
              <p className="font-mono text-xs text-muted">
                {error ? <span className="text-warn">Lỗi tải dữ liệu SOS.</span> : loading ? "Đang tải..." : "Chưa có dữ liệu."}
              </p>
            ) : view.priority.length === 0 ? (
              <p className="font-mono text-xs text-muted">Không có SOS nào đang chờ xử lý.</p>
            ) : (
              <ul className="space-y-3">
                {view.priority.map((item) => (
                  <li key={item.id} className="rounded-xl border border-border bg-bg/60 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-water">{sosCode(item.id)}</span>
                      <SosPriorityBadge urgency={item.urgency} />
                      <SosStatusBadge status={item.status} />
                      <span className="ml-auto font-mono text-[11px] text-muted">
                        {timeAgo(item.createdAt, view.now)}
                      </span>
                    </div>
                    <p className="mt-2 flex items-start gap-1.5 text-sm text-text/90">
                      <Icon name="map" className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                      <span className="font-mono text-xs">{formatCoords(item.location)}</span>
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-text/80">
                      <strong>{item.numberOfPeople} người</strong>
                      {item.note ? ` — ${item.note}` : ""}
                    </p>
                    <div className="mt-3 flex justify-end">
                      <SosActionButtons
                        item={item}
                        canProgress={canProgress(item.assignment?.rescueStaffId)}
                        busy={actions.busyId === item.id}
                        onAccept={(id) => void actions.accept(id)}
                        onAdvance={(id, next) => void actions.advance(id, next)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel
          title="SOS phân công cho tôi"
          subtitle="Các ca tôi đã tiếp nhận và đang xử lý"
          icon="staff"
          tag={
            view && view.mine.length > 0 ? (
              <span className="rounded-full bg-safe/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-safe">
                {view.mine.length} nhiệm vụ
              </span>
            ) : undefined
          }
        >
          {!view ? (
            <p className="font-mono text-xs text-muted">
              {error ? <span className="text-warn">Lỗi tải dữ liệu.</span> : loading ? "Đang tải..." : "Chưa có dữ liệu."}
            </p>
          ) : view.mine.length === 0 ? (
            <p className="font-mono text-xs text-muted">
              Bạn chưa có ca nào đang xử lý. Bấm “Tiếp nhận” ở một SOS đang chờ để bắt đầu.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="font-mono text-[11px] uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Mã SOS</th>
                    <th className="px-3 py-2 font-medium">Tọa độ</th>
                    <th className="px-3 py-2 font-medium">Số người</th>
                    <th className="px-3 py-2 font-medium">Mức độ</th>
                    <th className="px-3 py-2 font-medium">Trạng thái</th>
                    <th className="px-3 py-2 text-right font-medium">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {view.mine.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-3 font-mono font-bold text-water">{sosCode(item.id)}</td>
                      <td className="px-3 py-3 font-mono text-xs text-muted">{formatCoords(item.location)}</td>
                      <td className="px-3 py-3">{item.numberOfPeople} người</td>
                      <td className="px-3 py-3">
                        <SosPriorityBadge urgency={item.urgency} />
                      </td>
                      <td className="px-3 py-3">
                        <SosStatusBadge status={item.status} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <SosActionButtons
                          item={item}
                          canProgress={true} // Các SOS trong bảng này đã qua bộ lọc isMine phía trên
                          busy={actions.busyId === item.id}
                          onAccept={(id) => void actions.accept(id)}
                          onAdvance={(id, next) => void actions.advance(id, next)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </RescueLayout>
  );
}

export default RescueDashboard;