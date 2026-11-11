import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../../api/http";
import { AdminHeader } from "../../../components/layout/AdminHeader";
import { AppShell } from "../../../components/layout/AppShell";
import { ADMIN_NAV } from "../../../components/layout/navConfig";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { Icon } from "../../../components/ui/Icon";
import { KpiCard } from "../components/KpiCard";
import { Panel } from "../components/Panel";
import { SafeLocationForm } from "./SafeLocationForm";
import { SafeLocationMap } from "./SafeLocationMap";
import { locationTypeLabels, validCoordinates, type SafeLocation, type SafeLocationFields, type SafeLocationSource } from "./safeLocationTypes";

const input = "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-safe focus:outline-none";
const button = "inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-bg disabled:opacity-50";
const title = "Quản lý địa điểm an toàn";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; locations: SafeLocation[] }
  | { kind: "error"; error: unknown; previous: SafeLocation[] | null };

function describeError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    if (error.status === 403) return "Bạn không có quyền quản lý địa điểm an toàn.";
    if (error.status === 404) return "Địa điểm không còn được cung cấp.";
    if (error.status === 400) return error.message;
    if (error.status === 504) return "Kết nối quá hạn. Nếu đã gửi yêu cầu ghi, hãy làm mới để xác minh trước khi gửi lại.";
  }
  return error instanceof Error ? error.message : "Không thể hoàn tất yêu cầu. Hãy làm mới để kiểm tra dữ liệu trước khi thử lại.";
}

export default function SafeLocationManagementScreen({ source }: { source: SafeLocationSource }) {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [loadVersion, setLoadVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<SafeLocation | null | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<SafeLocation | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ message: string; correctable: boolean } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const savingRef = useRef(false);
  const loadedRef = useRef<SafeLocation[] | null>(null);

  useEffect(() => {
    let current = true;
    source.list().then(
      (locations) => {
        if (!current) return;
        loadedRef.current = locations;
        setLoad({ kind: "ready", locations });
      },
      (error: unknown) => {
        if (current) setLoad({ kind: "error", error, previous: loadedRef.current });
      },
    );
    return () => { current = false; };
  }, [source, loadVersion]);

  function refresh() {
    if (savingRef.current || load.kind === "loading") return;
    setMessage("");
    setLoad({ kind: "loading" });
    setLoadVersion((version) => version + 1);
  }

  function openEditor(location: SafeLocation | null) {
    setSaveError(null);
    setMessage("");
    setEditor(location);
  }

  async function save(fields: SafeLocationFields) {
    if (savingRef.current || editor === undefined) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await source.save(editor?.id ?? null, fields);
      const current = loadedRef.current ?? [];
      const locations = editor
        ? current.map((location) => location.id === saved.id ? saved : location)
        : [saved, ...current];
      loadedRef.current = locations;
      setLoad({ kind: "ready", locations });
      setSelectedId(saved.id);
      setEditor(undefined);
      setMessage(source.demo ? "Đã lưu địa điểm trong dữ liệu thử." : "Đã lưu địa điểm an toàn. Đang xác minh danh sách qua API.");
      setLoadVersion((version) => version + 1);
    } catch (error) {
      setSaveError({ message: describeError(error), correctable: error instanceof ApiError && error.status === 400 });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setDeleteError(null);
    try {
      await source.remove(pendingDelete.id);
      const locations = (loadedRef.current ?? []).filter((location) => location.id !== pendingDelete.id);
      loadedRef.current = locations;
      setLoad({ kind: "ready", locations });
      setSelectedId(null);
      setPendingDelete(null);
      setMessage(source.demo ? "Đã xóa địa điểm thử." : "Đã xóa mềm địa điểm. Đang xác minh danh sách qua API.");
      setLoadVersion((version) => version + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 504) {
        setPendingDelete(null); // Never offer immediate repeat after an uncertain DELETE.
        setMessage("Xóa có thể đã thành công dù yêu cầu quá hạn. Hãy làm mới danh sách trước khi thực hiện tiếp.");
      } else {
        setDeleteError(describeError(error));
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const data = load.kind === "ready" ? load.locations : load.kind === "error" ? load.previous : null;
  const search = query.trim().toLocaleLowerCase("vi");
  const visible = (data ?? []).filter((location) =>
    (!type || location.type === type) &&
    (!search || [location.name, location.address, location.id].some((value) => value.toLocaleLowerCase("vi").includes(search))));
  const selected = visible.find((location) => location.id === selectedId) ?? visible[0];
  const selectedPoint = selected && validCoordinates(selected.location) ? selected.location : null;
  const status = load.kind === "error" && load.error instanceof ApiError ? load.error.status : 0;
  const isStale = load.kind === "error" && load.previous !== null;

  return (
    <AppShell nav={ADMIN_NAV} brandSub="COMMAND C4I" brandTag="ADMIN" roleLabel="QUẢN TRỊ VIÊN C4I" accent="water" header={<AdminHeader title={title} />}>
      <div className="mx-auto max-w-[96rem] space-y-5">
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs tracking-widest text-safe">ADMIN · ĐIỂM SƠ TÁN</p>
              <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{title}</h1>
              <p className="mt-2 max-w-xl text-sm text-muted">Quản lý tên, địa chỉ, loại, mô tả và tọa độ của các điểm được cung cấp.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={button} onClick={refresh} disabled={load.kind === "loading" || saving}>
                <Icon name="refresh" className="h-4 w-4" /> Làm mới
              </button>
              <button type="button" className="rounded-lg bg-safe px-4 py-2 text-sm font-bold text-bg hover:bg-safe/85 disabled:opacity-50"
                disabled={!data || isStale || saving} onClick={() => openEditor(null)}>+ Thêm địa điểm</button>
            </div>
          </div>
        </section>

        {source.demo && <aside className="rounded-xl border border-warn/35 bg-warn/10 px-4 py-3 text-sm text-warn">
          <strong>TEST ONLY · Dữ liệu mô phỏng</strong>
          <p className="mt-1">Các điểm chỉ để kiểm thử. Thay đổi được lưu trong phiên thử và đặt lại khi tải lại trình duyệt.</p>
        </aside>}
        {message && <p role="status" className="rounded-xl border border-safe/30 bg-safe/10 p-3 text-sm text-safe">{message}</p>}
        {load.kind === "loading" && <p role="status" className="rounded-xl border border-border bg-card p-8 text-center text-muted">Đang tải địa điểm an toàn…</p>}
        {load.kind === "error" && <section role="alert" className="space-y-3 rounded-xl border border-sos/35 bg-card p-5">
          <h2 className="font-semibold text-sos">Tải danh sách thất bại</h2>
          <p className="text-sm">{describeError(load.error)}</p>
          {isStale && <p className="text-sm text-warn">Đang hiển thị dữ liệu đã tải trước đó. Chưa xác nhận được trạng thái mới nhất.</p>}
          {status === 401 ? <Link to="/login" className={button}>Đăng nhập lại</Link> : status !== 403 && <button type="button" className={button} onClick={refresh}>Thử lại</button>}
        </section>}

        {data && <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiCard label="Tổng địa điểm" icon="map" value={String(data.length)} tone="text" />
            <KpiCard label="Điểm sơ tán" icon="shield" value={String(data.filter((item) => item.type === "shelter").length)} tone="safe" />
            <KpiCard label="Trường học" icon="map" value={String(data.filter((item) => item.type === "school").length)} tone="water" />
            <KpiCard label="Bệnh viện" icon="shield" value={String(data.filter((item) => item.type === "hospital").length)} tone="safe" />
          </div>

          <section className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[2fr_1fr_auto]" aria-label="Bộ lọc địa điểm">
            <label className="space-y-1 text-xs text-muted"><span>Tìm địa điểm</span>
              <input type="search" className={input} placeholder="Tên, mã hoặc địa chỉ" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <label className="space-y-1 text-xs text-muted"><span id="ccf121-managementscreen-type">Loại địa điểm</span>
              <select aria-labelledby="ccf121-managementscreen-type" className={input} value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">Tất cả</option>
                {Object.entries(locationTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <button type="button" className={`${button} self-end`} disabled={!query && !type} onClick={() => { setQuery(""); setType(""); }}>Xóa bộ lọc</button>
          </section>

          <div className="grid min-w-0 items-start gap-4 2xl:grid-cols-[minmax(0,3fr)_minmax(18rem,1fr)]">
            <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border p-4">
                <h2 className="font-bold">Danh sách địa điểm</h2>
                <span className="text-xs text-muted">{visible.length} / {data.length} địa điểm</span>
              </div>
              {!visible.length ? <p className="p-8 text-center text-sm text-muted">{data.length ? "Không có kết quả theo bộ lọc." : "Chưa có địa điểm an toàn."}</p> :
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[46rem] text-left text-sm">
                    <thead className="bg-bg/65 text-xs text-muted">
                      <tr>{["Tên / Địa chỉ", "Loại", "Mô tả", "Tọa độ", "Thao tác"].map((label) => <th key={label} scope="col" className="px-3 py-3 font-semibold">{label}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {visible.map((location) => <tr key={location.id} className="align-top hover:bg-bg/30">
                        <th scope="row" className="max-w-64 break-words px-3 py-4 font-medium">
                          <button type="button" aria-pressed={selected?.id === location.id} className="text-left text-water hover:underline"
                            onClick={() => setSelectedId(location.id)}>{location.name || "Chưa có tên"}</button>
                          <span className="mt-1 block text-xs text-muted">{location.address || "Chưa có địa chỉ"}</span>
                          <span className="mt-1 block font-mono text-xs text-muted">{location.id}</span>
                        </th>
                        <td className="px-3 py-4 text-xs">{location.type ? locationTypeLabels[location.type] : "Chưa có loại hợp lệ"}</td>
                        <td className="max-w-60 break-words px-3 py-4 text-xs text-muted">{location.description || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-4 font-mono text-xs text-muted">
                          {validCoordinates(location.location) ? <>{location.location.latitude.toFixed(6)} / {location.location.longitude.toFixed(6)}</> : "Chưa có tọa độ hợp lệ"}
                        </td>
                        <td className="px-3 py-4">
                          <div className="flex flex-wrap gap-2">
                            <button type="button" className={button} disabled={saving || isStale} aria-label={`Chỉnh sửa ${location.name}`} onClick={() => openEditor(location)}>Chỉnh sửa</button>
                            <button type="button" className={button} disabled={saving || isStale} aria-label={`Xóa ${location.name}`} onClick={() => { setDeleteError(null); setPendingDelete(location); }}>Xóa</button>
                          </div>
                        </td>
                      </tr>)}
                    </tbody>
                  </table>
                </div>}
            </section>
            {selected && <Panel title="Vị trí địa điểm" icon="map">
              <p className="mb-1 break-words text-sm font-semibold">{selected.name || "Chưa có tên"}</p>
              <p className="mb-3 break-words text-xs text-muted">{selected.address || "Chưa có địa chỉ"} · {selected.id}</p>
              {selectedPoint
                ? <SafeLocationMap key={`${selected.id}:${selectedPoint.latitude}:${selectedPoint.longitude}`} point={selectedPoint} name={selected.name} demo={source.demo} />
                : <p className="text-sm text-muted">Địa điểm chưa có tọa độ hợp lệ.</p>}
            </Panel>}
          </div>
        </>}

        {editor !== undefined && <SafeLocationForm key={editor?.id ?? "new"} location={editor} demo={source.demo} busy={saving}
          error={saveError} onReview={() => setSaveError(null)} onClose={() => { if (!saving) setEditor(undefined); }} onSave={save} />}

        {pendingDelete && <ConfirmDialog title="Xóa địa điểm an toàn?" confirmLabel="Xóa địa điểm" tone="danger"
          busy={saving} error={deleteError} onConfirm={confirmDelete} onCancel={() => { if (!saving) { setPendingDelete(null); setDeleteError(null); } }}>
          <p>Bạn sắp xóa mềm &ldquo;{pendingDelete.name}&rdquo;. Địa điểm sẽ không còn hiển thị trong danh sách và bản đồ của người dùng sau khi tải lại.</p>
        </ConfirmDialog>}
      </div>
    </AppShell>
  );
}
