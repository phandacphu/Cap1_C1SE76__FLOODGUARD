import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../../api/http";
import { AdminHeader } from "../../../components/layout/AdminHeader";
import { AppShell } from "../../../components/layout/AppShell";
import { ADMIN_NAV } from "../../../components/layout/navConfig";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { Icon } from "../../../components/ui/Icon";
import { SafeLocationForm } from "./SafeLocationForm";
import { SafeLocationOverviewMap } from "./SafeLocationMap";
import { locationTypeLabels, validCoordinates, type SafeLocation, type SafeLocationFields, type SafeLocationSource } from "./safeLocationTypes";

const input = "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-safe focus:outline-none";
const button = "inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-bg disabled:opacity-50";
const title = "Quản lý điểm an toàn";

type LoadState = {
  kind: "loading" | "ready" | "error";
  locations: SafeLocation[] | null;
  error: unknown | null;
};

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    if (error.status === 403) return "Bạn không có quyền quản lý điểm an toàn.";
    if (error.status === 404) return "Địa điểm không còn được cung cấp.";
    if (error.status === 504) return "Yêu cầu quá hạn. Hãy làm mới để kiểm tra trước khi thử thao tác ghi lần nữa.";
  }
  return error instanceof Error ? error.message : "Không thể thực hiện thao tác. Hãy thử lại.";
}

export default function SafeLocationManagementScreen({ source }: { source: SafeLocationSource }) {
  const [load, setLoad] = useState<LoadState>({ kind: "loading", locations: null, error: null });
  const [loadVersion, setLoadVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SafeLocation | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [editor, setEditor] = useState<SafeLocation | null | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<SafeLocation | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ message: string; uncertain: boolean } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "success" | "warn" } | null>(null);
  const savingRef = useRef(false);
  const loadedRef = useRef<SafeLocation[] | null>(null);

  useEffect(() => {
    let current = true;
    source.list().then(
      (locations) => {
        if (!current) return;
        loadedRef.current = locations;
        setLoad({ kind: "ready", locations, error: null });
        // Never keep a detail panel for an item that no longer exists in a refreshed list.
        setSelectedId((id) => id && locations.some((item) => item.id === id) ? id : null);
      },
      (error: unknown) => {
        if (!current) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          loadedRef.current = null;
          setSelectedId(null);
          setDetail(null);
          setLoad({ kind: "error", locations: null, error });
        } else {
          setLoad({ kind: "error", locations: loadedRef.current, error });
        }
      },
    );
    return () => { current = false; };
  }, [source, loadVersion]);

  // Selecting a row or pin reads the actual Admin detail by stable ID.
  // A deleted point returns 404; do not display stale detail or keep its pin.
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    source.get(selectedId).then(
      (item) => {
        if (!active) return;
        if (item.id !== selectedId) {
          setDetailError("Máy chủ trả chi tiết không khớp ID. Hãy làm mới danh sách.");
          setDetail(null);
          return;
        }
        setDetail(item);
        setDetailError(null);
      },
      (error: unknown) => {
        if (!active) return;
        setDetail(null);
        setDetailError(describeError(error));
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          loadedRef.current = null;
          setLoad({ kind: "error", locations: null, error });
          setSelectedId(null);
        } else if (error instanceof ApiError && error.status === 404) {
          setSelectedId(null);
          setLoadVersion((version) => version + 1);
        }
      },
    );
    return () => { active = false; };
  }, [source, selectedId, loadVersion]);

  function chooseLocation(id: string) {
    setDetail(null);
    setDetailError(null);
    setSelectedId(id);
  }

  const data = load.locations;
  const busy = saving || load.kind === "loading";
  const stale = load.kind === "error" && data !== null;

  function refresh() {
    if (savingRef.current || load.kind === "loading") return;
    setMessage(null);
    setLoad({ kind: "loading", locations: loadedRef.current, error: null });
    setLoadVersion((version) => version + 1);
  }

  function openEditor(location: SafeLocation | null) {
    setSaveError(null);
    setMessage(null);
    setEditor(location);
  }

  async function save(fields: SafeLocationFields) {
    if (savingRef.current || editor === undefined) return;
    const editingId = editor?.id ?? null;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await source.save(editingId, fields, editor ?? null);
      if (!saved?.id || (editingId && saved.id !== editingId)) {
        throw new Error("Nguồn dữ liệu không xác nhận đúng ID bản ghi đã sửa; cần tải lại danh sách.");
      }
      const current = loadedRef.current ?? [];
      if (!editingId && current.some((item) => item.id === saved.id)) {
        throw new Error("Nguồn dữ liệu trả ID đã tồn tại; cần tải lại để xác minh.");
      }
      const locations = editingId
        ? current.map((item) => item.id === editingId ? saved : item)
        : [saved, ...current];
      loadedRef.current = locations;
      setLoad({ kind: "ready", locations, error: null });
      setDetail(null);
      setDetailError(null);
      setSelectedId(saved.id);
      setEditor(undefined);
      setMessage({ tone: "success", text: source.demo ? "Đã lưu trong dữ liệu mẫu (không ghi lên hệ thống chung)." : "API đã xác nhận lưu thành công. Đang đồng bộ danh sách." });
      setLoadVersion((version) => version + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 504 && editingId) {
        // PATCH timeout: read the same ID to compare, never automatically repeat PATCH.
        try {
          const actual = await source.get(editingId);
          const matches = actual.name === fields.name && actual.address === fields.address &&
            actual.type === fields.type && actual.description === fields.description &&
            actual.location?.latitude === fields.location.latitude &&
            actual.location?.longitude === fields.location.longitude;
          setSaveError({
            message: matches
              ? "PATCH quá hạn nhưng GET chi tiết hiện khớp dữ liệu vừa nhập. Đóng form và làm mới để xác minh danh sách."
              : "PATCH quá hạn; GET chi tiết hiện chưa khớp dữ liệu vừa nhập. Hãy đối chiếu trước khi thử lại.",
            uncertain: true,
          });
        } catch {
          setSaveError({ message: "PATCH quá hạn, chưa đọc lại được chi tiết. Đóng form, làm mới và đối chiếu trước khi thử lại.", uncertain: true });
        }
      } else {
        setSaveError({ message: describeError(error), uncertain: error instanceof ApiError && error.status === 504 });
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || savingRef.current) return;
    const id = pendingDelete.id;
    savingRef.current = true;
    setSaving(true);
    setDeleteError(null);
    try {
      await source.remove(id);
      const locations = (loadedRef.current ?? []).filter((item) => item.id !== id);
      loadedRef.current = locations;
      setLoad({ kind: "ready", locations, error: null });
      setSelectedId((selected) => selected === id ? null : selected);
      setDetail(null);
      setPendingDelete(null);
      setMessage({ tone: "success", text: source.demo ? "Đã xóa mềm trong dữ liệu mẫu; ghim và dòng đã được gỡ." : "API đã xác nhận xóa mềm thành công. Đang đồng bộ danh sách." });
      setLoadVersion((version) => version + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 504) {
        setPendingDelete(null); // Do not offer immediate duplicate DELETE after an uncertain write.
        try {
          await source.get(id);
          setMessage({ tone: "warn", text: "DELETE quá hạn; GET chi tiết vẫn thấy địa điểm. Hãy tải lại và đối chiếu, không tự gửi lại." });
        } catch (lookupError) {
          setMessage({ tone: "warn", text: lookupError instanceof ApiError && lookupError.status === 404
            ? "DELETE quá hạn; GET chi tiết trả 404 (địa điểm không còn được cung cấp). Đang tải lại danh sách để đối chiếu."
            : "DELETE quá hạn và chưa đối chiếu được GET chi tiết. Hãy tải lại, không tự gửi lại." });
        }
        setLoadVersion((version) => version + 1);
      } else {
        setDeleteError(describeError(error));
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const search = query.trim().toLocaleLowerCase("vi");
  const visible = (data ?? []).filter((item) => !search ||
    [item.name, item.address].some((value) => value.toLocaleLowerCase("vi").includes(search)));
  const selected = visible.find((item) => item.id === selectedId) ?? null;
  const selectedDetail = selected && detail?.id === selected.id ? detail : null;
  const status = load.error instanceof ApiError ? load.error.status : 0;

  return (
    <AppShell nav={ADMIN_NAV} brandSub="COMMAND C4I" brandTag="ADMIN" roleLabel="QUẢN TRỊ VIÊN C4I" accent="water" header={<AdminHeader title={title} />}>
      <div className="mx-auto max-w-[96rem] space-y-5">
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs tracking-widest text-safe">ADMIN · ĐIỂM AN TOÀN</p>
              <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{title}</h1>
              <p className="mt-2 max-w-xl text-sm text-muted">Quản lý tên, địa chỉ, loại, tọa độ và mô tả của các điểm an toàn.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={button} onClick={refresh} disabled={busy}>
                <Icon name="refresh" className="h-4 w-4" /> Làm mới
              </button>
              <button type="button" className="rounded-lg bg-safe px-4 py-2 text-sm font-bold text-bg hover:bg-safe/85 disabled:opacity-50"
                disabled={!data || busy || stale} onClick={() => openEditor(null)}>+ Thêm địa điểm</button>
            </div>
          </div>
        </section>

        {source.demo && <aside role="note" className="rounded-xl border border-warn/35 bg-warn/10 px-4 py-3 text-sm text-warn">
          <strong>DỮ LIỆU MẪU · CHỈ KIỂM THỬ GIAO DIỆN</strong>
          <p className="mt-1">Mọi thao tác chỉ lưu trong phiên thử trên trình duyệt này. Không ghi Backend/Firebase và không cung cấp điểm thực cho Resident/Rescue.</p>
        </aside>}
        {message && <p role="status" className={`rounded-xl border p-3 text-sm ${message.tone === "warn"
          ? "border-warn/35 bg-warn/10 text-warn" : "border-safe/30 bg-safe/10 text-safe"}`}>{message.text}</p>}
        {load.kind === "loading" && <p role="status" className="rounded-xl border border-border bg-card p-4 text-sm text-muted">
          {data ? "Đang làm mới điểm an toàn…" : "Đang tải điểm an toàn…"}
        </p>}
        {load.kind === "error" && <section role="alert" className="space-y-3 rounded-xl border border-sos/35 bg-card p-5">
          <h2 className="font-semibold text-sos">{stale ? "Chưa thể cập nhật" : "Không thể tải danh sách điểm an toàn"}</h2>
          <p className="text-sm">{describeError(load.error)}</p>
          {stale && <p className="text-sm text-warn">Dữ liệu đã tải trước đó vẫn được giữ. Chưa xác nhận trạng thái mới nhất.</p>}
          {status === 401 ? <Link to="/login" className={button}>Đăng nhập lại</Link> : status !== 403 &&
            <button type="button" className={button} onClick={refresh}>Thử lại</button>}
        </section>}

        {data && <>
          <section className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-border bg-card p-4">
            <div>
              <h2 className="font-semibold">Danh sách điểm an toàn</h2>
              <p className="mt-1 text-sm text-muted">Tổng số địa điểm: {data.length}{query ? ` · Đang hiển thị: ${visible.length}` : ""}</p>
            </div>
            <label className="block w-full max-w-md space-y-1 text-xs text-muted"><span>Tìm theo tên hoặc địa chỉ</span>
              <input type="search" className={input} placeholder="Nhập tên hoặc địa chỉ" value={query}
                onChange={(event) => setQuery(event.target.value)} />
            </label>
          </section>

          <div className="grid min-w-0 items-start gap-4 2xl:grid-cols-[minmax(0,3fr)_minmax(20rem,1.3fr)]">
            <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
              <div className="border-b border-border p-4"><h2 className="font-bold">Bảng danh sách</h2></div>
              {!visible.length ? <p className="p-8 text-center text-sm text-muted">
                {data.length ? "Không tìm thấy điểm an toàn theo từ khóa." : "Chưa có điểm an toàn"}
              </p> : <div className="overflow-x-auto">
                <table className="w-full min-w-[54rem] text-left text-sm">
                  <thead className="bg-bg/65 text-xs text-muted">
                    <tr>{["Tên địa điểm", "Địa chỉ", "Loại", "Tọa độ", "Thao tác"].map((label) =>
                      <th key={label} scope="col" className="px-3 py-3 font-semibold">{label}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visible.map((item) => <tr key={item.id} onClick={() => chooseLocation(item.id)}
                      className={`cursor-pointer align-top hover:bg-bg/30 ${selectedId === item.id ? "bg-safe/10" : ""}`}>
                      <th scope="row" className="max-w-52 break-words px-3 py-4 font-medium">{item.name}</th>
                      <td className="max-w-60 break-words px-3 py-4 text-xs">{item.address}</td>
                      <td className="px-3 py-4 text-xs">{item.type ? locationTypeLabels[item.type] : "Chưa có loại hợp lệ"}</td>
                      <td className="whitespace-nowrap px-3 py-4 font-mono text-xs text-muted">
                        {validCoordinates(item.location)
                          ? `${item.location.latitude.toFixed(6)}, ${item.location.longitude.toFixed(6)}`
                          : "Chưa có tọa độ hợp lệ"}
                      </td>
                      <td className="px-3 py-4"><div className="flex flex-wrap gap-2">
                        <button type="button" className={button} aria-label={`Xem ${item.name}`}
                          onClick={(event) => { event.stopPropagation(); chooseLocation(item.id); }}>Xem</button>
                        <button type="button" className={button} disabled={busy || stale} aria-label={`Sửa ${item.name}`}
                          onClick={(event) => { event.stopPropagation(); openEditor(item); }}>Sửa</button>
                        <button type="button" className={button} disabled={busy || stale} aria-label={`Xóa ${item.name}`}
                          onClick={(event) => { event.stopPropagation(); setDeleteError(null); setPendingDelete(item); }}>Xóa</button>
                      </div></td>
                    </tr>)}
                  </tbody>
                </table>
              </div>}
            </section>

            <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
              <h2 className="font-bold">Bản đồ điểm an toàn</h2>
              <SafeLocationOverviewMap locations={visible} selectedId={selectedId} onSelect={chooseLocation} demo={source.demo} />
              <div aria-label="Chi tiết điểm an toàn" className="rounded-xl border border-border bg-bg/40 p-4">
                <h3 className="mb-3 font-semibold">Chi tiết địa điểm</h3>
                {detailError && <p role="alert" className="mb-3 text-sm text-sos">{detailError}</p>}
                {selectedDetail ? <dl className="space-y-3 text-sm">
                  {([
                    ["Tên", selectedDetail.name],
                    ["Địa chỉ", selectedDetail.address],
                    ["Loại", selectedDetail.type ? locationTypeLabels[selectedDetail.type] : "Chưa có loại hợp lệ"],
                    ["Tọa độ", validCoordinates(selectedDetail.location)
                      ? `${selectedDetail.location.latitude.toFixed(6)}, ${selectedDetail.location.longitude.toFixed(6)}` : "Chưa có tọa độ hợp lệ"],
                    ...(selectedDetail.description ? [["Mô tả", selectedDetail.description]] : []),
                  ] as [string, string][]).map(([label, value]) => <div key={label}>
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className="mt-1 break-words">{value}</dd>
                  </div>)}
                </dl> : <p className="text-sm text-muted">{selected ? "Đang tải chi tiết địa điểm theo ID…" : detailError ? "Hãy làm mới danh sách và chọn lại." : "Chọn dòng trong bảng hoặc ghim xanh lá trên bản đồ để xem chi tiết."}</p>}
              </div>
            </section>
          </div>
        </>}

        {editor !== undefined && <SafeLocationForm key={editor?.id ?? "new"} location={editor}
          demo={source.demo} busy={saving} error={saveError}
          onClose={() => { if (!saving) setEditor(undefined); }} onSave={save} />}

        {pendingDelete && <ConfirmDialog title="Xóa điểm an toàn?" confirmLabel="Xóa điểm" tone="danger"
          busy={saving} error={deleteError} onConfirm={confirmDelete}
          onCancel={() => { if (!saving) { setPendingDelete(null); setDeleteError(null); } }}>
          <p>Bạn có chắc muốn xóa mềm <strong>“{pendingDelete.name}”</strong>?</p>
          <p className="mt-2">{source.demo
            ? "Bản demo chỉ mô phỏng việc điểm rời danh sách, ghim và chi tiết."
            : "Sau khi API xác nhận xóa mềm, điểm sẽ không còn được cung cấp cho Resident/Rescue. Không thể khôi phục tại màn này."}</p>
        </ConfirmDialog>}
      </div>
    </AppShell>
  );
}
