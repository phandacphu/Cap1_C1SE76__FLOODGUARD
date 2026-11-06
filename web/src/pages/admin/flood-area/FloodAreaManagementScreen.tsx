// File: web/src/pages/admin/flood-area/FloodAreaManagementScreen.tsx
// CCF-119: Flood Area Management UI. Data comes from floodAreaService (mock until CCF-124).

import { useMemo, useState } from "react";
import { AdminHeader } from "../../../components/layout/AdminHeader";
import { AppShell } from "../../../components/layout/AppShell";
import { ADMIN_NAV } from "../../../components/layout/navConfig";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { KpiCard } from "../components/KpiCard";
import { MockTag, Panel } from "../components/Panel";
import { AreaFormModal } from "./components/AreaFormModal";
import { PolygonPreview } from "./components/PolygonPreview";
import { DATA_SOURCE } from "./floodAreaService";
import {
  SEVERITIES,
  SEVERITY_LABEL,
  STATUS_LABEL,
  type FloodAreaInput,
  type FloodAreaItem,
  type Severity,
} from "./floodAreaTypes";
import { useFloodAreas } from "./useFloodAreas";

const SEVERITY_CLASS: Record<Severity, string> = {
  low: "border-safe/40 bg-safe/10 text-safe",
  medium: "border-water/40 bg-water/10 text-water",
  high: "border-warn/40 bg-warn/10 text-warn",
  critical: "border-sos/40 bg-sos/10 text-sos",
};

const SELECT =
  "rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-water focus:outline-none";

type Dialog =
  | { kind: "form"; area: FloodAreaItem | null }
  | { kind: "delete"; area: FloodAreaItem }
  | null;

export default function FloodAreaManagementScreen() {
  const { areas, error, loading, refresh, create, update, remove } = useFloodAreas();

  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [offerInactive, setOfferInactive] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const list = useMemo(() => areas ?? [], [areas]);
  const loadFailed = areas === null && error !== null && !loading;
  const isMock = DATA_SOURCE === "mock";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter(
      (a) =>
        (q === "" || a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q)) &&
        (severityFilter === "all" || a.severity === severityFilter) &&
        (statusFilter === "all" || a.status === statusFilter),
    );
  }, [list, search, severityFilter, statusFilter]);

  const selected = list.find((a) => a.id === selectedId) ?? null;
  const kpi = (n: number) => (areas === null ? "—" : String(n));

  const closeDialog = () => {
    if (busy) return;
    setDialog(null);
    setDialogError(null);
    setOfferInactive(false);
  };

  const submitForm = async (input: FloodAreaInput) => {
    if (dialog?.kind !== "form") return;
    setBusy(true);
    setDialogError(null);
    const target = dialog.area;
    const result = target ? await update(target.id, input) : await create(input);
    setBusy(false);
    if (!result.ok) {
      setDialogError(result.error ?? "Lưu thất bại.");
      return;
    }
    setDialog(null);
    setNotice(target ? "Đã cập nhật vùng ngập." : "Đã tạo vùng ngập mới.");
  };

  const confirmDelete = async () => {
    if (dialog?.kind !== "delete") return;
    setBusy(true);
    setDialogError(null);
    const result = await remove(dialog.area.id);
    setBusy(false);
    if (!result.ok) {
      setDialogError(result.error ?? "Xóa thất bại.");
      // 409: alerts still reference this area -> propose inactive, never delete alerts.
      setOfferInactive(result.status === 409);
      return;
    }
    if (selectedId === dialog.area.id) setSelectedId(null);
    setDialog(null);
    setNotice("Đã xóa vùng ngập.");
  };

  const setInactiveInstead = async () => {
    if (dialog?.kind !== "delete") return;
    setBusy(true);
    const result = await update(dialog.area.id, { status: "inactive" });
    setBusy(false);
    if (!result.ok) {
      setDialogError(result.error ?? "Cập nhật thất bại.");
      return;
    }
    setDialog(null);
    setOfferInactive(false);
    setDialogError(null);
    setNotice("Đã chuyển vùng ngập sang ngừng hoạt động.");
  };

  return (
    <AppShell
      nav={ADMIN_NAV}
      brandSub="ADMIN COMMAND"
      roleLabel="QUẢN TRỊ VIÊN"
      accent="water"
      header={<AdminHeader title="Quản lý vùng ngập" />}
    >
      <div className="space-y-5 p-4 sm:p-6">
        {isMock && (
          <div role="note" className="flex items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
            <MockTag />
            <span>DỮ LIỆU MÔ PHỎNG / TEST ONLY — chưa kết nối API (sẽ tích hợp ở CCF-124).</span>
          </div>
        )}

        {notice && (
          <div role="status" className="flex items-center justify-between rounded-xl border border-safe/40 bg-safe/10 px-4 py-3 text-sm text-safe">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="text-xs underline">Đóng</button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard label="Tổng vùng ngập" icon="flood" tone="water" value={kpi(list.length)} mock={isMock} />
          <KpiCard label="Đang hoạt động" icon="alert" tone="safe" value={kpi(list.filter((a) => a.status === "active").length)} mock={isMock} />
          <KpiCard label="Ngừng hoạt động" icon="history" tone="text" value={kpi(list.filter((a) => a.status === "inactive").length)} mock={isMock} />
          <KpiCard label="Mức cao / khẩn cấp" icon="sos" tone="sos" value={kpi(list.filter((a) => a.severity === "high" || a.severity === "critical").length)} mock={isMock} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            aria-label="Tìm vùng ngập"
            placeholder="Tìm theo tên hoặc ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${SELECT} min-w-56 flex-1`}
          />
          <select aria-label="Lọc theo mức độ" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className={SELECT}>
            <option value="all">Mọi mức độ</option>
            {SEVERITIES.map((s) => (<option key={s} value={s}>{SEVERITY_LABEL[s]}</option>))}
          </select>
          <select aria-label="Lọc theo trạng thái" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={SELECT}>
            <option value="all">Mọi trạng thái</option>
            <option value="active">{STATUS_LABEL.active}</option>
            <option value="inactive">{STATUS_LABEL.inactive}</option>
          </select>
          <button type="button" onClick={() => { setSearch(""); setSeverityFilter("all"); setStatusFilter("all"); }} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-card">Đặt lại</button>
          <button type="button" disabled={areas === null} onClick={() => { setDialogError(null); setDialog({ kind: "form", area: null }); }} className="rounded-lg bg-water px-4 py-2 text-sm font-semibold text-bg hover:brightness-110 disabled:opacity-50">
            + Thêm vùng ngập
          </button>
        </div>

        {error && areas !== null && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
            <span>Không cập nhật được dữ liệu mới: {error} Đang hiển thị dữ liệu đã tải trước đó.</span>
            <button type="button" onClick={refresh} className="rounded border border-warn/50 px-3 py-1 text-xs">Thử lại</button>
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Panel title="Danh sách vùng ngập" icon="flood" mock={isMock}>
            {loadFailed ? (
              <div role="alert" className="rounded-xl border border-sos/40 bg-sos/10 p-5 text-sm">
                <p className="font-semibold text-red-200">Không tải được danh sách vùng ngập</p>
                <p className="mt-1 text-muted">{error}</p>
                <button type="button" onClick={refresh} className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-card">Thử lại</button>
              </div>
            ) : areas === null ? (
              <p className="py-8 text-center text-sm text-muted">Đang tải danh sách vùng ngập...</p>
            ) : list.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">Hệ thống chưa có vùng ngập nào. Nhấn “Thêm vùng ngập” để tạo mới.</p>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">Không có vùng ngập nào khớp bộ lọc.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="font-mono text-[11px] uppercase tracking-wider text-muted">
                    <tr>
                      <th className="pb-2 pr-3">ID</th>
                      <th className="pb-2 pr-3">Tên vùng</th>
                      <th className="pb-2 pr-3">Mức độ</th>
                      <th className="pb-2 pr-3">Trạng thái</th>
                      <th className="pb-2 pr-3">Nguồn</th>
                      <th className="pb-2 pr-3">Điểm</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a) => (
                      <tr key={a.id} className={`border-t border-border ${a.id === selectedId ? "bg-water/5" : ""}`}>
                        <td className="py-2.5 pr-3 whitespace-nowrap font-mono text-xs text-muted">{a.id}</td>
                        <td className="py-2.5 pr-3 font-medium">{a.name}</td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">
                          <span className={`rounded border px-2 py-0.5 font-mono text-[11px] ${SEVERITY_CLASS[a.severity]}`}>{SEVERITY_LABEL[a.severity]}</span>
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap text-xs">{STATUS_LABEL[a.status]}</td>
                        <td className="py-2.5 pr-3 text-xs text-muted">{a.source}</td>
                        <td className="py-2.5 pr-3 font-mono text-xs">{a.geometry.points.length}</td>
                        <td className="py-2.5 text-right whitespace-nowrap">
                          <button type="button" onClick={() => setSelectedId(a.id)} className="rounded border border-border px-2.5 py-1 text-xs hover:border-water/50">Chi tiết</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Chi tiết vùng ngập" icon="map" mock={isMock}>
            {!selected ? (
              <p className="py-8 text-center text-sm text-muted">Chọn “Chi tiết” ở một dòng để xem đa giác và thông tin.</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-lg font-bold">{selected.name}</p>
                  <p className="mt-1 font-mono text-xs text-muted">{selected.id}</p>
                </div>
                <p className="text-sm text-text/90">{selected.description || "Chưa có mô tả."}</p>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="font-mono text-[11px] uppercase text-muted">Mức độ</dt><dd>{SEVERITY_LABEL[selected.severity]} ({selected.severity})</dd></div>
                  <div><dt className="font-mono text-[11px] uppercase text-muted">Trạng thái</dt><dd>{STATUS_LABEL[selected.status]}</dd></div>
                  <div className="col-span-2"><dt className="font-mono text-[11px] uppercase text-muted">Nguồn dữ liệu</dt><dd>{selected.source}</dd></div>
                </dl>
                <PolygonPreview points={selected.geometry.points} />
                <p className="font-mono text-[11px] text-muted">Hình dạng vẽ từ tọa độ thật bên dưới — không phải bản đồ nền.</p>
                <ol className="max-h-40 space-y-1 overflow-y-auto font-mono text-xs">
                  {selected.geometry.points.map((p, i) => (
                    <li key={i}>{i + 1}. {p.latitude}, {p.longitude}</li>
                  ))}
                </ol>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setDialogError(null); setDialog({ kind: "form", area: selected }); }} className="flex-1 rounded-lg border border-border px-3 py-2 text-sm hover:border-water/50">Sửa</button>
                  <button type="button" onClick={() => { setDialogError(null); setOfferInactive(false); setDialog({ kind: "delete", area: selected }); }} className="flex-1 rounded-lg border border-sos/50 px-3 py-2 text-sm text-sos hover:bg-sos/10">Xóa</button>
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>

      {dialog?.kind === "form" && (
        <AreaFormModal
          key={dialog.area?.id ?? "new"}
          area={dialog.area}
          busy={busy}
          serverError={dialogError}
          onSubmit={submitForm}
          onClose={closeDialog}
        />
      )}

      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title="Xóa vùng ngập?"
          confirmLabel="Xóa vùng ngập"
          tone="danger"
          busy={busy}
          error={dialogError}
          onConfirm={confirmDelete}
          onCancel={closeDialog}
        >
          <p>Bạn sắp xóa “{dialog.area.name}”. Thao tác này không thể hoàn tác.</p>
          {offerInactive && (
            <div className="mt-3 rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
              <p>Vùng này đang được cảnh báo tham chiếu. Bạn có thể chuyển sang “Ngừng hoạt động” thay vì xóa (các cảnh báo không bị xóa).</p>
              <button type="button" disabled={busy} onClick={setInactiveInstead} className="mt-2 rounded border border-warn/60 px-3 py-1 font-semibold hover:bg-warn/20 disabled:opacity-60">Chuyển sang inactive</button>
            </div>
          )}
        </ConfirmDialog>
      )}
    </AppShell>
  );
}
