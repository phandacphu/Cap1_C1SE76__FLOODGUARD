import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RescueLayout } from "../../components/layout/RescueLayout";
import { Icon } from "../../components/ui/Icon";
import { useAuth } from "../../context/AuthContext";
import type { SosStatus, UrgencyLevel } from "../../types/rescue";
import { KpiCard } from "../admin/components/KpiCard";
import { formatNumber } from "../admin/adminStats";
import { SosActionButtons } from "./components/SosActionButtons";
import { SosFilterBar, type SortMode } from "./components/SosFilterBar";
import { SosPriorityBadge } from "./components/SosPriorityBadge";
import { SosStatusBadge } from "./components/SosStatusBadge";
import {
  computeKpis,
  formatCoords,
  isOpen,
  sortByNewest,
  sortByUrgency,
  sosCode,
  timeAgo,
} from "./rescueStats";
import { useRescueActions, useRescueRequests } from "./useRescue";

const PAGE_SIZES = [10, 20, 50];

/** Rescue "Yêu cầu SOS" list: filters (CCF-106), priority sort (CCF-107), accept/update (CCF-108/109). */
export function RescueSosList() {
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [urgency, setUrgency] = useState("");
  const [sort, setSort] = useState<SortMode>("priority");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);

  const { requests, error, updatedAt, loading, refresh } = useRescueRequests({
    status: status ? (status as SosStatus) : undefined,
    urgency: urgency ? (urgency as UrgencyLevel) : undefined,
    sort: sort === "priority" ? "priority" : undefined,
  });
  const actions = useRescueActions(refresh);

  const view = useMemo(() => {
    if (!requests || !updatedAt) return null;
    const term = search.trim().toLowerCase();
    const matched = term
      ? requests.filter((r) =>
          [sosCode(r.id), r.id, r.note ?? "", r.residentId, formatCoords(r.location)]
            .join(" ")
            .toLowerCase()
            .includes(term),
        )
      : requests;
    return {
      now: updatedAt,
      kpis: computeKpis(requests, updatedAt),
      rows: sort === "priority" ? sortByUrgency(matched) : sortByNewest(matched),
      criticalOpen: requests.filter((r) => r.urgency === "critical" && isOpen(r.status)).length,
    };
  }, [requests, updatedAt, search, sort]);

  const total = view?.rows.length ?? 0;
  const pageCount = Math.max(Math.ceil(total / pageSize), 1);
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = view?.rows.slice(safePage * pageSize, safePage * pageSize + pageSize) ?? [];

  const resetPage = () => setPage(0);
  const kpis = view?.kpis;

  return (
    <RescueLayout
      loading={loading}
      onRefresh={refresh}
      updatedAt={updatedAt}
      waitingCount={kpis?.waiting ?? 0}
    >
      <div className="mx-auto max-w-7xl space-y-5">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wide">Yêu cầu SOS</h1>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted">
            Tiếp nhận và cập nhật tiến độ cứu hộ theo thời gian thực
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <KpiCard
            label="Tổng yêu cầu"
            icon="sos"
            tone="text"
            value={kpis ? formatNumber(kpis.total) : "—"}
            sub="ca trong hệ thống"
          />
          <KpiCard
            label="Khẩn cấp chờ cứu"
            icon="alert"
            tone="sos"
            value={kpis ? String(kpis.criticalWaiting).padStart(2, "0") : "—"}
            sub="ca chưa có người nhận"
          />
          <KpiCard
            label="Đang xử lý thực địa"
            icon="pulse"
            tone="warn"
            value={kpis ? String(kpis.inProgress).padStart(2, "0") : "—"}
            sub="ca đang cứu hộ"
          />
          <KpiCard
            label="Đã an toàn hôm nay"
            icon="shield"
            tone="safe"
            value={kpis ? formatNumber(kpis.assistedToday) : "—"}
            sub="ca hoàn tất"
          />
        </div>

        <SosFilterBar
          search={search}
          status={status}
          urgency={urgency}
          sort={sort}
          onSearch={(v) => {
            setSearch(v);
            resetPage();
          }}
          onStatus={(v) => {
            setStatus(v);
            resetPage();
          }}
          onUrgency={(v) => {
            setUrgency(v);
            resetPage();
          }}
          onSort={(v) => {
            setSort(v);
            resetPage();
          }}
          onReset={() => {
            setSearch("");
            setStatus("");
            setUrgency("");
            setSort("priority");
            resetPage();
          }}
        />

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

        <section className="overflow-hidden rounded-2xl border border-border bg-card/80">
          <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
            <Icon name="sos" className="h-5 w-5 text-safe" />
            <h2 className="font-bold">Danh sách yêu cầu cứu hộ</h2>
            {view && view.criticalOpen > 0 && (
              <span className="rounded-full bg-sos/20 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-sos">
                {view.criticalOpen} ca khẩn cấp
              </span>
            )}
          </header>

          {error ? (
            <p className="p-8 text-center font-mono text-xs text-warn">
              Lỗi kết nối: Không thể tải danh sách SOS.
            </p>
          ) : !view || loading ? (
            <p className="p-8 text-center font-mono text-xs text-muted">
              Đang kết nối máy chủ...
            </p>
          ) : total === 0 ? (
            <p className="p-8 text-center font-mono text-xs text-muted">
              Không có yêu cầu SOS nào phù hợp với bộ lọc hiện tại.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-bg/60 font-mono text-[11px] uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Mã SOS</th>
                    <th className="px-4 py-3 font-medium">Người gửi</th>
                    <th className="px-4 py-3 font-medium">Tọa độ</th>
                    <th className="px-4 py-3 font-medium">Số người &amp; ghi chú</th>
                    <th className="px-4 py-3 font-medium">Mức độ</th>
                    <th className="px-4 py-3 font-medium">Trạng thái</th>
                    <th className="px-4 py-3 font-medium">Gửi lúc</th>
                    <th className="px-4 py-3 text-right font-medium">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageRows.map((item) => {
                    const hot = item.urgency === "critical" && isOpen(item.status);
                    const done = item.status === "assisted" || item.status === "cancelled";
                    
                    // Quyền thao tác chặt chẽ theo Backend
                    const isMine = !!item.assignment && item.assignment.rescueStaffId === user?.id;
                    const canProgress = item.status === "submitted" || isMine;

                    return (
                      <tr
                        key={item.id}
                        className={`${hot ? "bg-sos/10" : ""} ${done ? "opacity-60" : ""}`}
                      >
                        <td className="px-4 py-4 font-mono font-bold">
                          <Link
                            to={`/rescue/sos/${item.id}`}
                            className="text-water underline-offset-2 hover:underline"
                          >
                            {sosCode(item.id)}
                          </Link>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-medium">Cư dân</p>
                          <p className="font-mono text-[11px] text-muted">
                            #{item.residentId.slice(0, 8)}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 font-mono text-xs text-muted">
                          {formatCoords(item.location)}
                        </td>
                        <td className="max-w-xs px-4 py-4">
                          <p className="font-semibold">{item.numberOfPeople} người</p>
                          <p className="truncate text-xs text-muted" title={item.note ?? ""}>
                            {item.note || "Không có ghi chú"}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <SosPriorityBadge urgency={item.urgency} />
                        </td>
                        <td className="px-4 py-4">
                          <SosStatusBadge status={item.status} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 font-mono text-xs text-muted">
                          {timeAgo(item.createdAt, view.now)}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <SosActionButtons
                            item={item}
                            canProgress={canProgress}
                            busy={actions.busyId === item.id}
                            onAccept={(id) => void actions.accept(id)}
                            onAdvance={(id, next) => void actions.advance(id, next)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {view && total > 0 && (
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-sm text-muted">
              <span>
                Hiển thị{" "}
                <strong className="text-text">
                  {safePage * pageSize + 1} - {Math.min((safePage + 1) * pageSize, total)}
                </strong>{" "}
                trên tổng số <strong className="text-text">{total}</strong> yêu cầu
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage === 0}
                  onClick={() => setPage(safePage - 1)}
                  className="rounded-lg border border-border px-3 py-1 disabled:opacity-40"
                >
                  ‹
                </button>
                <span className="font-mono text-xs">
                  Trang {safePage + 1} / {pageCount}
                </span>
                <button
                  type="button"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage(safePage + 1)}
                  className="rounded-lg border border-border px-3 py-1 disabled:opacity-40"
                >
                  ›
                </button>
                <select
                  aria-label="Số hàng mỗi trang"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    resetPage();
                  }}
                  className="rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text"
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n} hàng / trang
                    </option>
                  ))}
                </select>
              </div>
            </footer>
          )}
        </section>
      </div>
    </RescueLayout>
  );
}

export default RescueSosList;