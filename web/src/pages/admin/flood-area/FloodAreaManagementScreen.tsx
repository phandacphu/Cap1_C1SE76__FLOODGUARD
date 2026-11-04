import { useMemo, useState, useEffect } from "react";
import { AdminHeader } from "../../../components/layout/AdminHeader";
import { AppShell } from "../../../components/layout/AppShell";
import { ADMIN_NAV } from "../../../components/layout/navConfig";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { KpiCard } from "../components/KpiCard";
import { MockTag, Panel } from "../components/Panel";
import { AreaFormModal } from "./components/AreaFormModal";
import { DATA_SOURCE } from "./floodAreaService";
import { fetchHistoricalPoints } from "./historicalMapService";
import { formatAreaId } from "./areaId";
import { type FloodAreaInput, type FloodAreaItem } from "./floodAreaTypes";
import { useFloodAreas } from "./useFloodAreas";

interface HistoricalPointFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    id?: string;
    name?: string;
    data_period?: string;
    coordinate_status?: string;
    source_url?: string;
  };
}

interface HistoricalPointsResponse {
  success?: boolean;
  data?: { geojson?: { features?: HistoricalPointFeature[] } };
}

const SELECT =
  "rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-water focus:outline-none";

const BANNER_WARN =
  "flex items-center justify-between gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn";

const BTN_SMALL = "rounded border border-border px-2.5 py-1 text-xs hover:border-water/50";

const BTN_DANGER = "rounded border border-sos/50 px-2.5 py-1 text-xs text-sos hover:bg-sos/10";

type Dialog =
  | { kind: "form"; area: FloodAreaItem | null }
  | { kind: "delete"; area: FloodAreaItem }
  | null;

export default function FloodAreaManagementScreen() {
  const { areas, error, loading, refresh, create, update, remove } = useFloodAreas();

  const isMock = DATA_SOURCE === "mock";

  const [historicalPoints, setHistoricalPoints] = useState<HistoricalPointFeature[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [offerInactive, setOfferInactive] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadHistory = async () => {
      try {
        setHistoryLoading(true);
        setHistoryError(null);
        const res = (await fetchHistoricalPoints()) as unknown as
          | HistoricalPointsResponse
          | undefined;
        const features = res?.success ? res.data?.geojson?.features : undefined;
        if (!isMounted) return;
        if (features) {
          setHistoricalPoints(features);
        } else {
          setHistoricalPoints([]);
          setHistoryError("Phản hồi từ API điểm ngập lịch sử không đúng định dạng.");
        }
      } catch (err) {
        console.error("Lỗi tải điểm ngập lịch sử:", err);
        if (isMounted) {
          setHistoryError("Không tải được điểm ngập lịch sử. Vui lòng thử lại.");
        }
      } finally {
        if (isMounted) setHistoryLoading(false);
      }
    };
    loadHistory();
    return () => {
      isMounted = false;
    };
  }, []);

  const list = useMemo(() => areas ?? [], [areas]);

  const referencePoints = useMemo(
    () =>
      historicalPoints.flatMap((pt) => {
        const lng = pt.geometry?.coordinates?.[0];
        const lat = pt.geometry?.coordinates?.[1];
        return typeof lat === "number" && typeof lng === "number"
          ? [{ latitude: lat, longitude: lng }]
          : [];
      }),
    [historicalPoints],
  );

  const filteredAreas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter(
      (a) =>
        q === "" ||
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        formatAreaId(a.id).toLowerCase().includes(q),
    );
  }, [list, search]);

  const filteredHistory = useMemo(() => {
    const q = search.trim().toLowerCase();
    return historicalPoints.filter((pt) => {
      const name = (pt.properties?.name ?? "").toLowerCase();
      const id = (pt.properties?.id ?? "").toLowerCase();
      return q === "" || name.includes(q) || id.includes(q);
    });
  }, [historicalPoints, search]);

  const totalRows = filteredAreas.length + filteredHistory.length;
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
      setOfferInactive(result.status === 409);
      return;
    }
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

  const openCreate = () => {
    setDialogError(null);
    setDialog({ kind: "form", area: null });
  };

  const openEdit = (area: FloodAreaItem) => {
    setDialogError(null);
    setDialog({ kind: "form", area });
  };

  const openDelete = (area: FloodAreaItem) => {
    setDialogError(null);
    setOfferInactive(false);
    setDialog({ kind: "delete", area });
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
          <div
            role="note"
            className="flex items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn"
          >
            <MockTag />
            <span>DỮ LIỆU MÔ PHỎNG / TEST ONLY (CCF-124).</span>
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="flex items-center justify-between rounded-xl border border-safe/40 bg-safe/10 px-4 py-3 text-sm text-safe"
          >
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="text-xs underline">
              Đóng
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Tổng vùng ngập"
            icon="flood"
            tone="water"
            value={kpi(list.length)}
            mock={isMock}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            aria-label="Tìm vùng ngập"
            placeholder="Tìm theo tên hoặc ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${SELECT} min-w-56 flex-1`}
          />
          <button
            type="button"
            disabled={areas === null}
            onClick={openCreate}
            className="rounded-lg bg-water px-4 py-2 text-sm font-semibold text-bg hover:brightness-110 disabled:opacity-50"
          >
            + Thêm vùng ngập
          </button>
        </div>

        {error && areas !== null && (
          <div role="alert" className={BANNER_WARN}>
            <span>
              Không cập nhật được dữ liệu mới: {error} Đang hiển thị dữ liệu đã tải trước đó.
            </span>
            <button
              type="button"
              onClick={refresh}
              className="rounded border border-warn/50 px-3 py-1 text-xs"
            >
              Thử lại
            </button>
          </div>
        )}

        <Panel title="Danh sách vùng ngập" icon="flood" mock={isMock}>
          <p className="mb-3 text-xs text-warn">
            Điểm ngập lịch sử (mã HIST-xx) chỉ để tham khảo, không phải cảnh báo ngập hiện tại.
          </p>

          {loading && (
            <p className="py-4 text-center text-sm text-muted">
              Đang tải danh sách vùng ngập...
            </p>
          )}
          {historyLoading && (
            <p className="py-4 text-center text-sm text-muted">
              Đang tải dữ liệu điểm ngập lịch sử...
            </p>
          )}
          {historyError && (
            <p role="alert" className="py-4 text-center text-sm text-warn">
              {historyError}
            </p>
          )}

          {!loading && !historyLoading && totalRows === 0 && (
            <p className="py-8 text-center text-sm text-muted">
              Không có vùng ngập hoặc điểm ngập nào phù hợp.
            </p>
          )}

          {totalRows > 0 && (
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="sticky top-0 bg-card font-mono text-[11px] uppercase tracking-wider text-muted">
                  <tr>
                    <th className="pb-2 pr-3">ID</th>
                    <th className="pb-2 pr-3">Tên vùng</th>
                    <th className="pb-2 pr-3">Điểm / Tọa độ</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {filteredAreas.map((a) => (
                    <tr key={`area-${a.id}`} className="border-t border-border">
                      <td
                        title={a.id}
                        className="whitespace-nowrap py-2.5 pr-3 font-mono text-xs text-muted"
                      >
                        {formatAreaId(a.id)}
                      </td>
                      <td className="py-2.5 pr-3 font-medium">{a.name}</td>
                      <td className="whitespace-nowrap py-2.5 pr-3 font-mono text-xs">
                        {a.geometry.points.length} điểm
                      </td>
                      <td className="whitespace-nowrap py-2.5 text-right">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => openEdit(a)} className={BTN_SMALL}>
                            Sửa
                          </button>
                          <button type="button" onClick={() => openDelete(a)} className={BTN_DANGER}>
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {filteredHistory.map((pt, idx) => {
                    const props = pt.properties ?? {};
                    const lng = pt.geometry?.coordinates?.[0];
                    const lat = pt.geometry?.coordinates?.[1];
                    const hasCoords = typeof lat === "number" && typeof lng === "number";
                    return (
                      <tr key={`hist-${props.id ?? idx}`} className="border-t border-border">
                        <td className="whitespace-nowrap py-2.5 pr-3 font-mono text-xs text-water">
                          {props.id ?? `HIST-${idx + 1}`}
                        </td>
                        <td className="py-2.5 pr-3 font-medium">
                          {props.name ?? "Điểm ngập lịch sử"}
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-3 font-mono text-xs text-muted">
                          {hasCoords ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : "—"}
                        </td>
                        <td className="py-2.5" />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {dialog?.kind === "form" && (
        <AreaFormModal
          key={dialog.area?.id ?? "new"}
          area={dialog.area}
          busy={busy}
          serverError={dialogError}
          onSubmit={submitForm}
          onClose={closeDialog}
          referencePoints={referencePoints}
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
          <p>Bạn sắp xóa &ldquo;{dialog.area.name}&rdquo;. Thao tác này không thể hoàn tác.</p>
          {offerInactive && (
            <div className="mt-3 rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
              <p>
                Vùng này đang được cảnh báo tham chiếu. Bạn có thể chuyển sang &ldquo;Ngừng hoạt
                động&rdquo; thay vì xóa (các cảnh báo không bị xóa).
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={setInactiveInstead}
                className="mt-2 rounded border border-warn/60 px-3 py-1 font-semibold hover:bg-warn/20 disabled:opacity-60"
              >
                Chuyển sang inactive
              </button>
            </div>
          )}
        </ConfirmDialog>
      )}
    </AppShell>
  );
}