import { useMemo } from "react";
import { AdminHeader } from "../../components/layout/AdminHeader";
import { AppShell } from "../../components/layout/AppShell";
import { ADMIN_NAV } from "../../components/layout/navConfig";
import { Icon } from "../../components/ui/Icon";
import { useAuth } from "../../context/AuthContext";
import { formatClock } from "../../components/layout/useClock";
import { ActiveAlertsPanel } from "./components/ActiveAlertsPanel";
import { AuditFeedPanel } from "./components/AuditFeedPanel";
import { InfraPanel } from "./components/InfraPanel";
import { KpiCard } from "./components/KpiCard";
import { Panel } from "./components/Panel";
import { SosDashboardPanel } from "./sos/SosDashboardPanel";
import { formatDashboardSosCount } from "./sos/sosFormat";
import { formatNumber } from "./adminStats";
import { useAdminOverview } from "./useAdminOverview";

const DAY_MS = 86_400_000;

/** CCF-117: Admin dashboard ("Tổng quan hệ thống điều hành & giám sát C4I"). */
export function AdminDashboard() {
  const { token, logout } = useAuth();
  const { overview, loading, refresh } = useAdminOverview(token, logout);

  const view = useMemo(() => {
    if (!overview) return null;
    const now = overview.updatedAt;
    const alerts = overview.alerts.ok ? overview.alerts.data : null;
    const areas = overview.areas.ok ? overview.areas.data : [];
    const safeLocationCount = overview.safeLocations.ok ? overview.safeLocations.data.length : null;
    const sos = overview.sos.ok ? overview.sos.data : null;
    const users = overview.users.ok ? overview.users.data : null;


    const staff = users ? users.filter((u) => u.role === "rescue") : null;
    const weekAgo = now.getTime() - 7 * DAY_MS;

    return {
      now,
      alerts,
      areaNames: new Map(areas.map((a) => [a.id, a.name])),
      floodAreas: areas.filter((a) => a.areaType === "flood"),
      lowLyingAreas: areas.filter((a) => a.areaType === "low_lying"),
      unclassifiedAreas: areas.filter((a) => a.areaType !== "flood" && a.areaType !== "low_lying"),
      safeLocationCount,
      sos,
      users,
      activeUsers: users ? users.filter((u) => u.isActive).length : null,
      newUsersThisWeek: users
        ? users.filter((u) => new Date(u.createdAt).getTime() >= weekAgo).length
        : null,
      staff,
      activeStaff: staff ? staff.filter((u) => u.isActive).length : null,
    };
  }, [overview]);

  const sosMock = view?.sos?.source === "mock";
  const usersMock = !view?.users;
  const anyMock = sosMock || usersMock;

  return (
    <AppShell
      nav={ADMIN_NAV}
      brandSub="COMMAND C4I"
      brandTag="ADMIN"
      roleLabel="QUẢN TRỊ VIÊN C4I"
      accent="water"
      header={<AdminHeader alertCount={view?.alerts?.length} />}
    >
      <div className="mx-auto max-w-[1500px] space-y-5">
        {/* Title bar */}
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card/80 p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold uppercase leading-tight tracking-wide">
              Tổng quan hệ thống điều hành &amp; giám sát C4I
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {anyMock && (
                <span className="rounded bg-warn/15 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-warn">
                  MỘT PHẦN DỮ LIỆU MÔ PHỎNG
                </span>
              )}
              {overview && (
                <span className="font-mono text-[11px] text-muted">
                  Cập nhật {formatClock(overview.updatedAt)}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-muted">
              Trung tâm quản trị hạ tầng, điều phối dữ liệu khẩn cấp và giám sát toàn hệ thống.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-border bg-bg/60 px-3 py-2 font-mono text-xs transition hover:border-water/50 disabled:opacity-60"
            >
              <Icon name="refresh" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Đang tải..." : "Làm mới"}
            </button>
            <button
              type="button"
              disabled
              title="Sắp ra mắt"
              className="flex cursor-not-allowed items-center gap-2 rounded-lg border border-border bg-bg/60 px-3 py-2 font-mono text-xs text-muted"
            >
              <Icon name="sliders" className="h-4 w-4" /> Cấu hình cảnh báo
            </button>
            <button
              type="button"
              disabled
              title="Sắp ra mắt"
              className="flex cursor-not-allowed items-center gap-2 rounded-lg bg-water/60 px-3 py-2 text-sm font-semibold text-bg"
            >
              <Icon name="download" className="h-4 w-4" /> Xuất báo cáo hệ thống (.PDF)
            </button>
          </div>
        </section>

        {!overview && (
          <p role="status" className="rounded-xl border border-border bg-card/60 p-4 text-center text-sm text-muted">
            Đang tải dữ liệu... Server demo có thể mất khoảng 1 phút để khởi động.
          </p>
        )}

        {view && (
          <>
            {/* KPI row */}
            <section aria-label="Chỉ số chính" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              <KpiCard
                label="Tổng SOS toàn hệ thống"
                icon="sos"
                tone="text"
                value={formatDashboardSosCount(view.sos?.total)}
                mock={sosMock}
                sub={view.sos ? "Từ thống kê tổng hợp SOS" : "Chưa tải được thống kê SOS"}
                footerLabel="Chờ cứu hộ"
                footerValue={formatDashboardSosCount(view.sos?.active)}
              />
              <KpiCard
                label="Cảnh báo đang hiệu lực"
                icon="alert"
                tone="sos"
                value={view.alerts === null ? "—" : String(view.alerts.length).padStart(2, "0")}
                sub={view.alerts === null ? "Chưa xác định — tải API cảnh báo thất bại" : view.alerts.length > 0 ? "Bản tin V2 đang bật" : "Không có cảnh báo đang bật"}
                footerLabel="Phạm vi"
                footerValue="Tất cả vùng công bố"
              />
              <KpiCard
                label="Vùng ngập Admin"
                icon="flood"
                tone="water"
                value={String(view.floodAreas.length).padStart(2, "0")}
                sub={`${view.lowLyingAreas.length} vùng trũng · ${view.unclassifiedAreas.length} chưa phân loại`}
                footerLabel="Tổng số vùng"
                footerValue={`${view.areaNames.size} vùng`}
              />
              <KpiCard
                label="Điểm an toàn được cung cấp"
                icon="shield"
                tone="safe"
                value={view.safeLocationCount !== null ? String(view.safeLocationCount).padStart(2, "0") : "—"}
                sub={view.safeLocationCount !== null ? "Từ danh sách Admin đã tải" : "Chưa thể tải danh sách điểm an toàn"}
              />
              <KpiCard
                label="Người dùng kích hoạt"
                icon="users"
                tone="text"
                value={view.activeUsers !== null ? formatNumber(view.activeUsers) : "—"}
                mock={usersMock}
                sub={
                  view.newUsersThisWeek !== null
                    ? `+${view.newUsersThisWeek} đăng ký tuần này`
                    : "Chưa tải được danh sách"
                }
              />
              <KpiCard
                label="Rescue Staff hoạt động"
                icon="staff"
                tone="safe"
                value={
                  view.activeStaff !== null && view.staff
                    ? `${view.activeStaff} / ${view.staff.length}`
                    : "—"
                }
                mock={usersMock}
                sub={
                  view.activeStaff !== null && view.staff && view.staff.length > 0
                    ? `${Math.round((view.activeStaff / view.staff.length) * 100)}% tài khoản đang bật`
                    : "Chưa tải được danh sách"
                }
              />
            </section>

            {/* Charts row */}
            <section className="grid gap-4 xl:grid-cols-[2fr_1fr]">
              <SosDashboardPanel summary={view.sos} loading={loading} retry={refresh}
                errorStatus={overview && !overview.sos.ok ? overview.sos.status : null} />

              <Panel
                title="Phạm vi cảnh báo V2"
                subtitle="Áp dụng cho toàn bộ vùng hệ thống đang công bố"
                tag={
                  <span className="rounded bg-sos/15 px-2 py-1 font-mono text-[10px] text-sos">
                    TOÀN HỆ THỐNG
                  </span>
                }
              >
                <p className="p-4 text-sm text-muted">Bản tin V2 không liên kết một vùng riêng hoặc mức độ. Xem danh sách và lịch sử tại <a className="text-water underline" href="/admin/flood-warnings">Quản lý cảnh báo lũ</a>.</p>
              </Panel>
            </section>

            {/* Bottom row */}
            <section className="grid gap-4 xl:grid-cols-[1.3fr_1fr_0.9fr]">
              <Panel
                title="Nhật ký điều hành (Audit feed)"
                icon="audit"
                mock
              >
                <AuditFeedPanel />
                <p className="mt-auto pt-4 font-mono text-[10px] tracking-wider text-muted">
                  CHƯA CÓ API ĐỌC AUDIT LOG · DỮ LIỆU MINH HỌA
                </p>
              </Panel>

              <Panel
                title={`Cảnh báo hiệu lực (${view.alerts === null ? "—" : String(view.alerts.length).padStart(2, "0")})`}
                icon="alert"
                tag={
                  <span className="rounded bg-sos/15 px-2 py-1 font-mono text-[10px] text-sos">
                    LIVE
                  </span>
                }
              >
                {view.alerts === null ? <p role="alert" className="py-6 text-sm text-warn">Chưa thể tải cảnh báo V2. Số lượng chưa xác định, vui lòng làm mới để thử lại.</p> : <ActiveAlertsPanel alerts={view.alerts} />}
              </Panel>

              <Panel title="Hạ tầng C4I" icon="server">
                <InfraPanel apiLatencyMs={overview?.apiLatencyMs ?? null} />
              </Panel>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
