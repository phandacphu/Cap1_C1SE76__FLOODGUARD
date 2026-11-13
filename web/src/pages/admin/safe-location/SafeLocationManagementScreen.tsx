import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../../api/http";
import { useAuth } from "../../../context/AuthContext";
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
type DetailState = {
  id: string | null;
  kind: "idle" | "loading" | "ready" | "error";
  item: SafeLocation | null;
  error: unknown | null;
};
type Review = {
  kind: "post" | "patch" | "delete";
  id: string | null;
  fields: SafeLocationFields | null;
  previousIds: string[];
  status: "checking" | "checked" | "error";
  notice: string;
};

const emptyDetail: DetailState = { id: null, kind: "idle", item: null, error: null };

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    if (error.status === 403) return "Bạn không có quyền quản lý điểm an toàn hoặc tài khoản không còn hoạt động.";
    if (error.status === 404) return "Địa điểm không còn được cung cấp.";
    if (error.status === 504) return "Yêu cầu quá hạn. Cần đọc lại dữ liệu trước khi thử ghi lần nữa.";
  }
  return error instanceof Error ? error.message : "Không thể thực hiện thao tác. Hãy thử lại.";
}

function authFailure(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

// No response, timeout, server error, malformed or unconfirmed 2xx response: the write may have happened.
function unconfirmedWrite(error: unknown): boolean {
  return !(error instanceof ApiError && [400, 401, 403, 404, 409, 422].includes(error.status));
}

function sameFields(actual: SafeLocation, fields: SafeLocationFields): boolean {
  return actual.name === fields.name && actual.address === fields.address &&
    actual.type === fields.type && actual.description === fields.description &&
    actual.location?.latitude === fields.location.latitude &&
    actual.location?.longitude === fields.location.longitude;
}

export default function SafeLocationManagementScreen({ source }: { source: SafeLocationSource }) {
  const { logout } = useAuth();
  const [load, setLoad] = useState<LoadState>({ kind: "loading", locations: null, error: null });
  const [loadVersion, setLoadVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<DetailState>(emptyDetail);
  const [detailRetry, setDetailRetry] = useState(0);
  const [editor, setEditor] = useState<SafeLocation | null | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<SafeLocation | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ message: string; uncertain: boolean } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "success" | "warn" } | null>(null);
  const [authError, setAuthError] = useState<ApiError | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const authRef = useRef<ApiError | null>(null);
  const reviewRef = useRef(false);
  const savingRef = useRef(false);
  const loadedRef = useRef<SafeLocation[] | null>(null);
  const missingIdsRef = useRef<Set<string>>(new Set());
  const listEpoch = useRef(0);
  const detailEpoch = useRef(0);

  // Lock synchronously, so a late successful list/detail/verification cannot restore protected data.
  const lockAccess = useCallback((error: ApiError) => {
    if (authRef.current) return;
    authRef.current = error;
    listEpoch.current += 1;
    detailEpoch.current += 1;
    loadedRef.current = null;
    reviewRef.current = false;
    setAuthError(error);
    setLoad({ kind: "error", locations: null, error });
    setSelectedId(null);
    setDetailState(emptyDetail);
    setEditor(undefined);
    setPendingDelete(null);
    setReview(null);
    setSaveError(null);
    setDeleteError(null);
    setMessage(null);
  }, []);

  const reload = useCallback(() => {
    if (authRef.current) return;
    listEpoch.current += 1;
    setLoad({ kind: "loading", locations: loadedRef.current, error: null });
    setLoadVersion((version) => version + 1);
  }, []);

  const applyList = useCallback((locations: SafeLocation[]) => {
    if (authRef.current) return;
    // Known missing/soft-deleted IDs must not be revived by stale list responses.
    locations = locations.filter((item) => !missingIdsRef.current.has(item.id));
    loadedRef.current = locations;
    setLoad({ kind: "ready", locations, error: null });
    setSelectedId((id) => id && locations.some((item) => item.id === id) ? id : null);
  }, []);

  // If a specific ID is confirmed missing, immediately remove that row/marker before the reload.
  const missingLocation = useCallback((id: string) => {
    if (authRef.current) return;
    missingIdsRef.current.add(id);
    const current = loadedRef.current;
    if (current !== null) {
      const rest = current.filter((item) => item.id !== id);
      loadedRef.current = rest;
      setLoad({ kind: "ready", locations: rest, error: null });
    }
    setSelectedId((selected) => selected === id ? null : selected);
    setDetailState((state) => state.id === id ? emptyDetail : state);
    setEditor(undefined);
    setPendingDelete(null);
    setMessage({ tone: "warn", text: "Địa điểm không còn được cung cấp. Đang tải lại danh sách để đồng bộ bảng và ghim." });
    reload();
  }, [reload]);

  useEffect(() => {
    if (authRef.current) return;
    let current = true;
    const epoch = listEpoch.current;
    source.list().then(
      (locations) => {
        if (!current || authRef.current || epoch !== listEpoch.current) return;
        applyList(locations);
      },
      (error: unknown) => {
        if (!current || authRef.current || epoch !== listEpoch.current) return;
        if (authFailure(error)) {
          lockAccess(error);
        } else {
          setLoad({ kind: "error", locations: loadedRef.current, error });
        }
      },
    );
    return () => { current = false; };
  }, [source, loadVersion, applyList, lockAccess]);

  useEffect(() => {
    if (!selectedId || authRef.current) return;
    let current = true;
    const id = selectedId;
    const epoch = ++detailEpoch.current;
    source.get(selectedId).then(
      (item) => {
        if (!current || authRef.current || epoch !== detailEpoch.current) return;
        if (item.id !== id) {
          setDetailState({ id, kind: "error", item: null,
            error: new Error("Máy chủ trả chi tiết không khớp ID. Hãy thử lại.") });
        } else {
          setDetailState({ id, kind: "ready", item, error: null });
        }
      },
      (error: unknown) => {
        if (!current || authRef.current || epoch !== detailEpoch.current) return;
        if (authFailure(error)) {
          lockAccess(error);
        } else if (error instanceof ApiError && error.status === 404) {
          missingLocation(id);
        } else {
          setDetailState({ id, kind: "error", item: null, error });
        }
      },
    );
    return () => { current = false; };
  }, [source, selectedId, detailRetry, loadVersion, lockAccess, missingLocation]);

  function chooseLocation(id: string) {
    if (authRef.current) return;
    if (selectedId === id) {
      // Keep the successful detail. Retry explicitly when the previous detail failed.
      if (detailState.id === id && detailState.kind === "error") {
        setDetailState({ id, kind: "loading", item: null, error: null });
        setDetailRetry((retry) => retry + 1);
      }
      return;
    }
    setSelectedId(id);
    setDetailState({ id, kind: "loading", item: null, error: null });
  }

  const data = authError ? null : load.locations;
  const busy = saving || load.kind === "loading" || !!authError;
  const stale = load.kind === "error" && data !== null;

  function refresh() {
    if (savingRef.current || load.kind === "loading" || authRef.current) return;
    setMessage(null);
    reload();
  }

  function openEditor(location: SafeLocation | null) {
    if (authRef.current || savingRef.current || reviewRef.current) return;
    setSaveError(null);
    setMessage(null);
    setEditor(location);
  }

  /** Read-only reconciliation; never auto-reissue a POST, PATCH or DELETE. */
  async function compareWrite(attempt: Review) {
    if (authRef.current) return;
    const checking = { ...attempt, status: "checking" as const, notice: "Đang đọc lại dữ liệu để đối chiếu…" };
    setReview(checking);
    try {
      if (attempt.kind === "post") {
        const locations = await source.list();
        if (authRef.current) return;
        applyList(locations);
        const matchingNew = locations.filter((row) =>
          !attempt.previousIds.includes(row.id) && attempt.fields && sameFields(row, attempt.fields));
        const notice = matchingNew.length
          ? `Danh sách có ${matchingNew.length} ID mới khớp đủ trường đã nhập (${matchingNew.map((row) => row.id).join(", ")}). Không tự POST lại; hãy xác minh bản ghi trước khi tiếp tục.`
          : "Đã đọc lại danh sách nhưng chưa thấy ID mới khớp đầy đủ. Chưa thể khẳng định POST thất bại; không tự gửi lại.";
        setReview({ ...checking, status: "checked", notice });
      } else {
        const id = attempt.id;
        if (!id) throw new Error("Thiếu ID cần đối chiếu.");
        let actual: SafeLocation | null = null;
        let missing = false;
        try {
          actual = await source.get(id);
        } catch (error) {
          if (authFailure(error)) { lockAccess(error); return; }
          if (error instanceof ApiError && error.status === 404) missing = true;
          else throw error;
        }
        if (authRef.current) return;
        if (missing) {
          missingIdsRef.current.add(id);
          // The ID is gone, regardless of whether the previous write caused it.
          const current = loadedRef.current;
          if (current) {
            loadedRef.current = current.filter((row) => row.id !== id);
            setLoad({ kind: "ready", locations: loadedRef.current, error: null });
          }
          setSelectedId((selected) => selected === id ? null : selected);
          setDetailState((state) => state.id === id ? emptyDetail : state);
        }
        const locations = await source.list();
        if (authRef.current) return;
        applyList(locations);
        const notice = missing
          ? `GET chi tiết ID ${id} trả 404. Địa điểm không còn được cung cấp, nhưng thao tác ghi trước đó chưa có phản hồi xác nhận.`
          : attempt.kind === "patch" && actual && attempt.fields && sameFields(actual, attempt.fields)
            ? `GET chi tiết ID ${id} khớp đầy đủ dữ liệu đã nhập. PATCH trước đó vẫn chưa có phản hồi xác nhận; không tự gửi lại.`
            : `GET chi tiết ID ${id} còn trả dữ liệu nhưng chưa xác nhận kết quả ${attempt.kind.toUpperCase()}. Hãy đối chiếu trước khi thao tác lại.`;
        setReview({ ...checking, status: "checked", notice });
      }
    } catch (error) {
      if (authRef.current) return;
      if (authFailure(error)) { lockAccess(error); return; }
      setReview({ ...checking, status: "error", notice: `Chưa thể cập nhật/đối chiếu: ${describeError(error)}. Không gửi lại thao tác ghi.` });
      setLoad({ kind: "error", locations: loadedRef.current, error });
    }
  }

  async function save(fields: SafeLocationFields) {
    if (savingRef.current || editor === undefined || authRef.current || reviewRef.current) return;
    const editingId = editor?.id ?? null;
    const previousIds = (loadedRef.current ?? []).map((row) => row.id);
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await source.save(editingId, fields, editor ?? null);
      if (authRef.current) return;
      if (!saved?.id || (editingId && saved.id !== editingId)) {
        throw new Error("Nguồn chưa xác nhận đúng ID của thao tác ghi.");
      }
      const current = loadedRef.current ?? [];
      if (!editingId && current.some((row) => row.id === saved.id)) {
        throw new Error("Nguồn trả ID đã tồn tại; cần đọc lại danh sách trước khi thử tiếp.");
      }
      const locations = editingId
        ? current.map((row) => row.id === editingId ? saved : row)
        : [saved, ...current];
      loadedRef.current = locations;
      setLoad({ kind: "ready", locations, error: null });
      setDetailState({ id: saved.id, kind: "loading", item: null, error: null });
      setSelectedId(saved.id);
      // Editing a selected ID does not change selectedId; explicitly reload its detail.
      setDetailRetry((retry) => retry + 1);
      setEditor(undefined);
      setMessage({ tone: "success", text: source.demo
        ? "Đã lưu trong dữ liệu mẫu." : "API đã xác nhận lưu thành công. Đang đồng bộ danh sách." });
      reload();
    } catch (error) {
      if (authRef.current) return;
      if (authFailure(error)) { lockAccess(error); return; }
      if (error instanceof ApiError && error.status === 404 && editingId) {
        missingLocation(editingId);
        return;
      }
      if (unconfirmedWrite(error)) {
        reviewRef.current = true;
        setSaveError({ message: `Chưa xác nhận kết quả ghi: ${describeError(error)}. Đang đọc lại dữ liệu. Không thử gửi lại.`, uncertain: true });
        await compareWrite({ kind: editingId ? "patch" : "post", id: editingId, fields, previousIds,
          status: "checking", notice: "Đang đọc lại để đối chiếu…" });
      } else {
        setSaveError({ message: describeError(error), uncertain: false });
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || savingRef.current || authRef.current || reviewRef.current) return;
    const id = pendingDelete.id;
    const previousIds = (loadedRef.current ?? []).map((row) => row.id);
    savingRef.current = true;
    setSaving(true);
    setDeleteError(null);
    try {
      await source.remove(id);
      if (authRef.current) return;
      missingIdsRef.current.add(id);
      const locations = (loadedRef.current ?? []).filter((row) => row.id !== id);
      loadedRef.current = locations;
      setLoad({ kind: "ready", locations, error: null });
      setSelectedId((selected) => selected === id ? null : selected);
      setDetailState(emptyDetail);
      setPendingDelete(null);
      setMessage({ tone: "success", text: source.demo
        ? "Đã xóa mềm trong dữ liệu mẫu." : "API đã xác nhận xóa mềm thành công. Đang đồng bộ danh sách." });
      reload();
    } catch (error) {
      if (authRef.current) return;
      if (authFailure(error)) { lockAccess(error); return; }
      if (error instanceof ApiError && error.status === 404) {
        missingLocation(id); // A missing record is not a confirmed successful DELETE.
        return;
      }
      if (unconfirmedWrite(error)) {
        reviewRef.current = true;
        setPendingDelete(null); // No button to send the same DELETE again while unconfirmed.
        setMessage({ tone: "warn", text: "Chưa xác nhận kết quả DELETE. Đang đọc lại theo ID, không gửi lại thao tác." });
        await compareWrite({ kind: "delete", id, fields: null, previousIds,
          status: "checking", notice: "Đang đối chiếu xóa mềm…" });
      } else {
        setDeleteError(describeError(error));
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function finishReview() {
    if (authRef.current || !review || review.status !== "checked") return;
    reviewRef.current = false;
    setReview(null);
    setSaveError(null);
    setEditor(undefined);
    setPendingDelete(null);
    setMessage({ tone: "warn", text: "Đã kết thúc bước đối chiếu thủ công. Chỉ thực hiện ghi mới sau khi xác minh ID và dữ liệu trên danh sách." });
  }

  const search = query.trim().toLocaleLowerCase("vi");
  const visible = (data ?? []).filter((item) => !search ||
    [item.name, item.address].some((value) => value.toLocaleLowerCase("vi").includes(search)));
  const selected = visible.find((item) => item.id === selectedId) ?? null;
  const selectedDetail = selected && detailState.id === selected.id && detailState.kind === "ready"
    ? detailState.item : null;
  const status = authError?.status ?? (load.error instanceof ApiError ? load.error.status : 0);

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
                disabled={!data || busy || stale || !!review} onClick={() => openEditor(null)}>+ Thêm địa điểm</button>
            </div>
          </div>
        </section>

        {review && <section role="alert" className="space-y-3 rounded-xl border border-warn/50 bg-warn/10 p-4 text-sm text-warn">
          <h2 className="font-semibold">Kết quả ghi chưa được xác nhận – cần đối chiếu</h2>
          <p>{review.notice}</p>
          <p>Đã khóa thao tác ghi tiếp để tránh tạo trùng hoặc gửi lại ngoài ý muốn. Không coi kết quả GET là phản hồi POST/PATCH/DELETE thành công.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={review.status === "checking" || saving || !!authError}
              onClick={() => void compareWrite(review)}>{review.status === "checking" ? "Đang đối chiếu…" : "Đọc lại để đối chiếu"}</button>
            {review.status === "checked" && <button type="button" className={button} onClick={finishReview}>
              Tôi đã kiểm tra ID và danh sách, kết thúc đối chiếu
            </button>}
          </div>
        </section>}
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
          {status === 401 ? <Link to="/login" onClick={logout} className={button}>Đăng nhập lại</Link> : status !== 403 &&
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
                        <button type="button" className={button} disabled={busy || stale || !!review} aria-label={`Sửa ${item.name}`}
                          onClick={(event) => { event.stopPropagation(); openEditor(item); }}>Sửa</button>
                        <button type="button" className={button} disabled={busy || stale || !!review} aria-label={`Xóa ${item.name}`}
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
                {selected && detailState.id === selected.id && detailState.kind === "error" && <div role="alert" className="mb-3 space-y-2 text-sm text-sos">
                  <p>Không thể tải chi tiết: {describeError(detailState.error)}</p>
                  <button type="button" className={button} disabled={!!authError}
                    onClick={() => {
                      setDetailState({ id: selected.id, kind: "loading", item: null, error: null });
                      setDetailRetry((retry) => retry + 1);
                    }}>Thử lại chi tiết</button>
                </div>}
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
                </dl> : <p className="text-sm text-muted">{selected
                  ? detailState.kind === "loading" ? "Đang tải chi tiết địa điểm theo ID…" : "Chi tiết chưa tải được. Chọn Thử lại chi tiết."
                  : "Chọn dòng trong bảng hoặc ghim xanh lá trên bản đồ để xem chi tiết."}</p>}
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
