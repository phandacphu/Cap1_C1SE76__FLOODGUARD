import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../../api/http";
import { AdminHeader } from "../../../components/layout/AdminHeader";
import { AppShell } from "../../../components/layout/AppShell";
import { ADMIN_NAV } from "../../../components/layout/navConfig";
import { Icon } from "../../../components/ui/Icon";
import { KpiCard } from "../components/KpiCard";
import { Panel } from "../components/Panel";
import { SafeLocationForm, type LocationChange, type LocationEditor } from "./SafeLocationForm";
import { SafeLocationMap } from "./SafeLocationMap";
import { locationStatusLabels, locationTypeLabels, validCoordinates, type SafeLocation, type SafeLocationSource } from "./safeLocationTypes";

const input = "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-safe focus:outline-none";
const button = "inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-bg disabled:opacity-50";
const title = "Quản lý địa điểm an toàn";
const number = new Intl.NumberFormat("vi-VN");

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; locations: SafeLocation[] }
  | { kind: "error"; error: unknown };

function describeError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Phiên đăng nhập đã hết hạn.";
    if (error.status === 403) return "Bạn không có quyền quản lý địa điểm an toàn.";
    if (error.status === 404) return "Địa điểm an toàn không còn tồn tại.";
    if (error.status === 400) return error.message;
  }
  return "Không thể hoàn tất yêu cầu. Hãy làm mới để kiểm tra dữ liệu trước khi thử lại.";
}

export default function SafeLocationManagementScreen({ source }: { source: SafeLocationSource }) {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [loadVersion, setLoadVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<LocationEditor | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ message: string; correctable: boolean } | null>(null);
  const [message, setMessage] = useState("");
  const savingRef = useRef(false);
  const request = useRef<{ source: SafeLocationSource; version: number; result: Promise<SafeLocation[]> } | null>(null);

  useEffect(() => {
    let current = true;
    if (request.current?.source !== source || request.current.version !== loadVersion) {
      request.current = { source, version: loadVersion, result: source.list() };
    }
    request.current.result.then(
      (locations) => { if (current) setLoad({ kind: "ready", locations }); },
      (error: unknown) => { if (current) setLoad({ kind: "error", error }); },
    );
    return () => { current = false; };
  }, [source, loadVersion]);

  function refresh() {
    if (load.kind === "loading" || savingRef.current) return;
    setLoad({ kind: "loading" });
    setMessage("");
    setLoadVersion((version) => version + 1);
  }

  function openEditor(next: LocationEditor) {
    setSaveError(null);
    setMessage("");
    setEditor(next);
  }

  async function save(change: LocationChange) {
    if (savingRef.current || !editor || load.kind !== "ready") return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = change.kind === "status" && editor.kind === "status"
        ? await source.setStatus(editor.location.id, change.status)
        : change.kind === "form" && editor.kind === "form"
          ? await source.save(editor.location?.id ?? null, change.fields)
          : null;
      if (!saved) return;
      const locations = editor.location
        ? load.locations.map((location) => location.id === saved.id ? saved : location)
        : [saved, ...load.locations];
      setLoad({ kind: "ready", locations });
      setSelectedId(saved.id);
      setEditor(null);
      setMessage(source.demo ? "Đã lưu địa điểm trong dữ liệu thử." : "Đã lưu địa điểm an toàn.");
    } catch (error) {
      setSaveError({ message: describeError(error), correctable: error instanceof ApiError && error.status === 400 });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const data = load.kind === "ready" ? load.locations : null;
  const active = data?.filter((location) => location.status === "active") ?? [];
  const search = query.trim().toLocaleLowerCase("vi");
  const visible = (data ?? []).filter((location) =>
    (!type || location.type === type) && (!statusFilter || location.status === statusFilter) &&
    (!search || [location.name, location.address, location.id].some((value) => value.toLocaleLowerCase("vi").includes(search))));
  const selected = visible.find((location) => location.id === selectedId) ?? visible[0];
  const selectedPoint = selected && validCoordinates(selected.location) ? selected.location : null;
  const status = load.kind === "error" && load.error instanceof ApiError ? load.error.status : 0;

  return (
    <AppShell nav={ADMIN_NAV} brandSub="COMMAND C4I" brandTag="ADMIN" roleLabel="QUẢN TRỊ VIÊN C4I" accent="water" header={<AdminHeader title={title} />}>
      <div className="mx-auto max-w-[96rem] space-y-5">
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs tracking-widest text-safe">ADMIN · ĐIỂM SƠ TÁN</p>
              <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{title}</h1>
              <p className="mt-2 max-w-xl text-sm text-muted">Quản lý vị trí, sức chứa và trạng thái hoạt động của các điểm sơ tán.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={button} onClick={refresh} disabled={load.kind === "loading" || saving}>
                <Icon name="refresh" className="h-4 w-4" /> Làm mới
              </button>
              <button type="button" className="rounded-lg bg-safe px-4 py-2 text-sm font-bold text-bg hover:bg-safe/85 disabled:opacity-50"
                disabled={!data || saving} onClick={() => openEditor({ kind: "form", location: null })}>+ Thêm địa điểm</button>
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
          {status === 401 ? <Link to="/login" className={button}>Đăng nhập lại</Link> : status !== 403 && <button type="button" className={button} onClick={refresh}>Thử lại</button>}
        </section>}

        {data && <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiCard label="Tổng địa điểm" icon="map" value={String(data.length)} tone="text" />
            <KpiCard label="Đang hoạt động" icon="shield" value={String(active.length)} tone="safe" />
            <KpiCard label="Tạm đóng" icon="clock" value={String(data.length - active.length)} tone="warn" />
            <KpiCard label="Sức chứa điểm hoạt động" icon="users" value={number.format(active.reduce((sum, location) => sum + location.capacity, 0))} tone="water" sub="người" />
          </div>

          <section className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[2fr_1fr_1fr_auto]" aria-label="Bộ lọc địa điểm">
            <label className="space-y-1 text-xs text-muted"><span>Tìm địa điểm</span>
              <input type="search" className={input} placeholder="Tên, mã hoặc địa chỉ" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <label className="space-y-1 text-xs text-muted"><span id="ccf121-managementscreen-type">Loại địa điểm</span>
              <select aria-labelledby="ccf121-managementscreen-type" className={input} value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">Tất cả</option>
                {Object.entries(locationTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted"><span id="ccf121-managementscreen-status">Trạng thái</span>
              <select aria-labelledby="ccf121-managementscreen-status" className={input} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">Tất cả</option>
                {Object.entries(locationStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <button type="button" className={`${button} self-end`} disabled={!query && !type && !statusFilter} onClick={() => { setQuery(""); setType(""); setStatusFilter(""); }}>Xóa bộ lọc</button>
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
                      <tr>{["Tên / Địa chỉ", "Loại", "Sức chứa", "Tọa độ", "Trạng thái", "Thao tác"].map((label) => <th key={label} scope="col" className="px-3 py-3 font-semibold">{label}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {visible.map((location) => <tr key={location.id} className="align-top hover:bg-bg/30">
                        <th scope="row" className="max-w-64 break-words px-3 py-4 font-medium">
                          <button type="button" aria-pressed={selected?.id === location.id} className="text-left text-water hover:underline"
                            onClick={() => setSelectedId(location.id)}>{location.name}</button>
                          <span className="mt-1 block text-xs text-muted">{location.address}</span>
                        </th>
                        <td className="px-3 py-4 text-xs">{locationTypeLabels[location.type]}</td>
                        <td className="px-3 py-4 font-mono">{number.format(location.capacity)}</td>
                        <td className="whitespace-nowrap px-3 py-4 font-mono text-xs text-muted">
                          {validCoordinates(location.location) ? <>{location.location.latitude.toFixed(6)}<br />{location.location.longitude.toFixed(6)}</> : "Chưa có"}
                        </td>
                        <td className="px-3 py-4"><span className={`inline-block rounded-full border px-2 py-1 text-xs ${location.status === "active" ? "border-safe/30 bg-safe/10 text-safe" : "border-border text-muted"}`}>
                          {locationStatusLabels[location.status]}
                        </span></td>
                        <td className="space-y-1 px-3 py-4">
                          <button type="button" className={button} aria-label={`Chỉnh sửa ${location.name}`} onClick={() => openEditor({ kind: "form", location })}>Chỉnh sửa</button>
                          <button type="button" className={button} aria-label={`${location.status === "active" ? "Tạm đóng" : "Kích hoạt"} ${location.name}`}
                            onClick={() => openEditor({ kind: "status", location })}>{location.status === "active" ? "Tạm đóng" : "Kích hoạt"}</button>
                        </td>
                      </tr>)}
                    </tbody>
                  </table>
                </div>}
            </section>
            {selected && <Panel title="Vị trí địa điểm" icon="map">
              <p className="mb-1 break-words text-sm font-semibold">{selected.name}</p>
              <p className="mb-3 break-words text-xs text-muted">{selected.address} · {selected.id}</p>
              {selectedPoint
                ? <SafeLocationMap key={`${selected.id}:${selectedPoint.latitude}:${selectedPoint.longitude}`} point={selectedPoint} name={selected.name} demo={source.demo} />
                : <p className="text-sm text-muted">Địa điểm chưa có tọa độ hợp lệ.</p>}
            </Panel>}
          </div>
        </>}

        {editor && <SafeLocationForm editor={editor} demo={source.demo} busy={saving} error={saveError} onReview={() => setSaveError(null)} onClose={() => setEditor(null)} onSave={save} />}
      </div>
    </AppShell>
  );
}
