import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../../api/http";
import { AdminHeader } from "../../../components/layout/AdminHeader";
import { AppShell } from "../../../components/layout/AppShell";
import { ADMIN_NAV } from "../../../components/layout/navConfig";
import { KpiCard } from "../components/KpiCard";
import { FloodWarningForm } from "./FloodWarningForm";
import { WarningRequestError } from "./floodWarningApi";
import { warningOrder, warningTime, type FloodWarning, type WarningFields, type WarningSource, type WarningStatus, type WarningSummary } from "./floodWarningTypes";

const button = "rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-bg disabled:opacity-50";
const field = "rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text";
type Pending = { account: string; key: string; body: WarningFields };
const STORAGE = "floodguard_warning_v2_pending";
function account() {
  try { const token = localStorage.getItem("floodguard_token") || ""; const claims = JSON.parse(atob(token.split(".")[1])) as { sub?: string }; return claims.sub || ""; }
  catch { return ""; }
}
function readPending(): Pending | null {
  try { const value = JSON.parse(sessionStorage.getItem(STORAGE) || "null") as Pending | null; return value?.account && value.account === account() ? value : null; }
  catch { return null; }
}
function describe(error: unknown): string {
  if (error instanceof WarningRequestError) {
    if (error.code === "ALERT_REVISION_CONFLICT") return "Bản tin đã được người khác chỉnh sửa. Đã tải lại chi tiết để đối chiếu; không tự ghi đè.";
    if (error.code === "ALERT_ALREADY_INACTIVE") return "Bản tin đã tắt, chỉ còn quyền xem lịch sử.";
    if (error.status === 429) return "Máy chủ giới hạn yêu cầu. Vui lòng chờ trước khi thử lại.";
  }
  if (error instanceof ApiError) {
    if (error.status === 401) return "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.";
    if (error.status === 403) return "Bạn không có quyền quản lý cảnh báo.";
    if (error.status === 404) return "Không tìm thấy bản tin V2 này.";
    return error.message;
  }
  return "Không thể cập nhật dữ liệu. Vui lòng thử lại sau.";
}
export default function FloodWarningManagementScreen({ source }: { source: WarningSource }) {
  const [rows, setRows] = useState<FloodWarning[] | null>(null);
  const [summary, setSummary] = useState<WarningSummary | null>(null);
  const [status, setStatus] = useState<WarningStatus | "">("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [detail, setDetail] = useState<FloodWarning | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [editor, setEditor] = useState<FloodWarning | null | undefined>(undefined);
  const [confirmOff, setConfirmOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState<Pending | null>(() => source.demo ? null : readPending());
  const generation = useRef(0);
  const selectedRequest = useRef(0);
  const inFlight = useRef(false);
  const latest = useRef({ status, query });
  useEffect(() => { latest.current = { status, query }; }, [status, query]);

  const refresh = useCallback(async (filter = latest.current.status, q = latest.current.query) => {
    const id = ++generation.current;
    setLoading(true); setError("");
    try {
      const [list, stats] = await Promise.all([source.list(filter || undefined, q || undefined), source.summary()]);
      if (generation.current !== id) return;
      setRows(list.sort(warningOrder)); setSummary(stats); setNotice("");
    } catch (err) {
      if (generation.current !== id) return;
      if (err instanceof ApiError && [401, 403].includes(err.status)) { setRows(null); setSummary(null); setDetail(null); setEditor(undefined); }
      setError(describe(err));
    } finally { if (generation.current === id) setLoading(false); }
  }, [source]);
  useEffect(() => {
    const task = Promise.resolve().then(() => refresh(status, query));
    const currentGeneration = generation;
    return () => { void task; currentGeneration.current++; };
  }, [refresh, status, query]);

  async function openDetail(id: string) {
    const request = ++selectedRequest.current;
    setDetail(null); setDetailBusy(true); setFormError("");
    try { const result = await source.detail(id); if (selectedRequest.current === request) setDetail(result); }
    catch (err) { if (selectedRequest.current === request) { setDetail(null); setNotice(describe(err)); } }
    finally { if (selectedRequest.current === request) setDetailBusy(false); }
  }
  function closeDetail() { selectedRequest.current++; setDetail(null); setDetailBusy(false); }
  async function reconcile() {
    if (!pending || inFlight.current) return;
    inFlight.current = true; setBusy(true); setFormError("");
    try {
      const result = await source.creationRequest(pending.key);
      sessionStorage.removeItem(STORAGE); setPending(null); setEditor(undefined);
      setNotice(`Đã đối chiếu được bản tin ${result.id}.`); await refresh(); await openDetail(result.id);
    } catch (err) {
      setFormError(err instanceof WarningRequestError && err.code === "CREATION_REQUEST_NOT_FOUND"
        ? "Chưa tìm thấy yêu cầu. Request cũ vẫn có thể đang xử lý; chỉ được gửi lại cùng khóa và nội dung."
        : describe(err));
    } finally { inFlight.current = false; setBusy(false); }
  }
  async function save(fields: WarningFields, retry = false) {
    if (inFlight.current) return;
    if (pending && !retry) { setFormError("Cần xử lý thao tác tạo chưa xác định trước."); return; }
    const target = editor;
    if (target === undefined && !retry) return;
    inFlight.current = true; setBusy(true); setFormError("");
    let operation: Pending | null = null;
    try {
      let saved: FloodWarning;
      if (target && !retry) {
        saved = await source.update(target.id, target.revision, { title: fields.title, content: fields.content });
      } else {
        operation = retry && pending ? pending : { account: account(), key: crypto.randomUUID(), body: fields };
        if (!source.demo && !operation.account) throw new Error("Không xác định được tài khoản Admin.");
        if (!source.demo) { sessionStorage.setItem(STORAGE, JSON.stringify(operation)); setPending(operation); }
        saved = await source.create(operation.body, operation.key);
        if (!source.demo) sessionStorage.removeItem(STORAGE);
        setPending(null);
      }
      setEditor(undefined); setNotice(`Đã lưu bản tin ${saved.id}. Công việc phát thông báo được ghi nhận, không đồng nghĩa mọi thiết bị đã nhận.`);
      await refresh(); await openDetail(saved.id);
    } catch (err) {
      if (target && !retry && err instanceof WarningRequestError && (err.status === 409 || err.uncertain)) {
        try { const fresh = await source.detail(target.id); setDetail(fresh); setEditor(undefined); setNotice("Đã tải lại bản tin để đối chiếu. Nếu còn active, mở Chỉnh sửa lần nữa sau khi kiểm tra nội dung mới."); }
        catch (readError) { setNotice(`Không đối chiếu được chi tiết: ${describe(readError)}`); }
      }
      if (operation && err instanceof WarningRequestError && err.uncertain) {
        setFormError("Tạo chưa rõ kết quả. Đối chiếu yêu cầu trước; khi cần retry dùng đúng khóa và nội dung cũ.");
      } else if (operation && err instanceof WarningRequestError && !err.uncertain && err.status < 500 && err.status !== 429) {
        sessionStorage.removeItem(STORAGE); setPending(null); setFormError(describe(err));
      } else setFormError(describe(err));
    } finally { inFlight.current = false; setBusy(false); }
  }
  async function deactivate() {
    if (!detail || inFlight.current) return;
    inFlight.current = true; setBusy(true); setConfirmOff(false);
    const id = detail.id;
    try { const updated = await source.deactivate(id); setDetail(updated); setNotice("Đã tắt cảnh báo. Bản tin được giữ trong lịch sử."); await refresh(); }
    catch (err) {
      try { const fresh = await source.detail(id); setDetail(fresh); setNotice(fresh.status === "inactive" ? "Bản tin đã tắt; đã đối chiếu trạng thái mới." : `Chưa xác nhận đã tắt: ${describe(err)}. Đã tải lại trạng thái.`); }
      catch (readError) { setNotice(`Tắt chưa rõ kết quả; không tự gửi lại. ${describe(readError)}`); }
    } finally { inFlight.current = false; setBusy(false); }
  }
  const authError = /phiên đăng nhập|không có quyền/i.test(error);
  return <AppShell nav={ADMIN_NAV} brandSub="COMMAND C4I" brandTag="ADMIN" roleLabel="QUẢN TRỊ VIÊN C4I" accent="water" header={<AdminHeader title="Quản lý cảnh báo lũ" />}>
    <div className="mx-auto max-w-[96rem] space-y-5">
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-card p-6">
        <div><p className="font-mono text-xs tracking-widest text-water">ADMIN · CẢNH BÁO V2</p><h1 className="mt-2 text-2xl font-bold">Quản lý cảnh báo mưa lớn và nguy cơ ngập</h1>
          <p className="mt-2 text-sm text-muted">Bản tin áp dụng cho tất cả vùng công bố của hệ thống · Giờ hiển thị GMT+7.</p></div>
        <div className="flex gap-2"><button className={button} disabled={loading || busy} onClick={() => void refresh()}>Làm mới</button>
          <button className="rounded-lg bg-water px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50" disabled={busy || !!pending || authError} onClick={() => { setFormError(""); setEditor(null); }}>+ Tạo cảnh báo</button></div>
      </section>
      {source.demo && <p className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-warn">TEST ONLY · Mọi bản tin trong chế độ mô phỏng không được gửi tới người dân.</p>}
      {pending && <section className="space-y-2 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm" role="alert">
        <strong>Thao tác tạo chưa xác định kết quả</strong><p>“{pending.body.title}” · Khóa: <code>{pending.key}</code>. Không tạo bản tin mới hoặc thay nội dung khi chưa giải quyết thao tác này.</p>
        <div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => void reconcile()}>Đối chiếu yêu cầu</button>
          <button className={button} disabled={busy} onClick={() => void save(pending.body, true)}>Thử lại cùng nội dung/khóa</button></div>
        {formError && <p role="alert" className="text-sos">{formError}</p>}
      </section>}
      {notice && <p role="status" className="rounded-lg border border-water/30 bg-water/10 p-3 text-sm">{notice}</p>}
      {error && <section role="alert" className="rounded-lg border border-sos/35 bg-sos/10 p-4 text-sm"><strong>{rows ? "Chưa thể cập nhật — đang giữ dữ liệu lần đọc trước" : "Không tải được dữ liệu"}</strong><p>{error}</p>
        {authError ? <Link className={button} to="/login">Đăng nhập lại</Link> : <button className={button} disabled={loading} onClick={() => void refresh()}>Thử lại</button>}</section>}
      {loading && <p role="status" className="text-sm text-muted">{rows ? "Đang cập nhật…" : "Đang tải dữ liệu V2…"}</p>}
      {summary && <div className="grid gap-3 sm:grid-cols-3"><KpiCard label="Tổng bản tin V2" icon="alert" value={String(summary.total)} tone="text" />
        <KpiCard label="Đang bật" icon="pulse" value={String(summary.active)} tone="safe" />
        <KpiCard label="Đã tắt" icon="history" value={String(summary.inactive)} tone="warn" /></div>}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); }}>
          <label className="flex min-w-52 flex-1 flex-col gap-1 text-xs text-muted">Tìm tiêu đề hoặc nội dung<input className={field} maxLength={180} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm cảnh báo…" /></label>
          <button className={button}>Tìm kiếm</button>
          <div className="flex gap-1" aria-label="Trạng thái cảnh báo">{([{ value: "", label: "Tất cả" }, { value: "active", label: "Đang bật" }, { value: "inactive", label: "Đã tắt" }] as const).map((tab) =>
            <button key={tab.value} type="button" aria-pressed={status === tab.value} className={`${button} ${status === tab.value ? "border-water text-water" : ""}`} onClick={() => setStatus(tab.value)}>{tab.label}</button>)}</div>
        </form>
        {rows && (rows.length === 0 ? <p className="p-8 text-center text-sm text-muted">Không có bản tin V2 phù hợp.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[44rem] text-left text-sm"><thead className="border-b border-border text-xs text-muted"><tr>
          <th className="p-3">Bản tin</th><th className="p-3">Trạng thái</th><th className="p-3">Bắt đầu (GMT+7)</th><th className="p-3">Kết thúc (GMT+7)</th><th className="p-3">Thao tác</th></tr></thead>
          <tbody className="divide-y divide-border">{rows.map((row) => <tr key={row.id}><td className="max-w-xs p-3"><strong>{row.title}</strong><p className="mt-1 line-clamp-2 text-xs text-muted">{row.content}</p></td>
            <td className="p-3">{row.status === "active" ? <span className="text-safe">Đang bật</span> : <span className="text-muted">Đã tắt</span>}</td>
            <td className="p-3">{warningTime(row.startAt)}</td><td className="p-3">{warningTime(row.endAt)}</td>
            <td className="p-3"><button className={button} onClick={() => void openDetail(row.id)} disabled={detailBusy}>Xem chi tiết</button></td></tr>)}</tbody></table></div>)}
      </section>
      {detailBusy && <p role="status">Đang tải chi tiết…</p>}
      {detail && <section className="space-y-3 rounded-2xl border border-border bg-card p-5" aria-label="Chi tiết cảnh báo">
        <div className="flex justify-between gap-3"><h2 className="text-xl font-bold">Chi tiết bản tin</h2><button className={button} onClick={closeDetail}>Đóng</button></div>
        <h3 className="font-semibold">{detail.title}</h3><p className="whitespace-pre-wrap text-sm">{detail.content}</p>
        <dl className="grid gap-2 text-xs text-muted sm:grid-cols-2"><div>Mã: {detail.id}</div><div>Phiên bản nội dung: {detail.revision}</div>
          <div>Trạng thái: {detail.status === "active" ? "Đang bật" : "Đã tắt"}</div><div>Phạm vi: Tất cả vùng hệ thống công bố</div>
          <div>Bắt đầu: {warningTime(detail.startAt)}</div><div>Kết thúc: {warningTime(detail.endAt)}</div>
          <div>Tạo lúc: {warningTime(detail.createdAt)}</div><div>Cập nhật: {warningTime(detail.updatedAt)}</div></dl>
        {detail.status === "active" && <div className="flex gap-2"><button className={button} disabled={busy} onClick={() => { setFormError(""); setEditor(detail); }}>Chỉnh sửa</button>
          <button className={`${button} text-sos`} disabled={busy} onClick={() => setConfirmOff(true)}>Tắt cảnh báo</button></div>}
        {detail.status === "inactive" && <p className="text-sm text-muted">Bản tin lịch sử chỉ xem. Đợt mới cần tạo bản tin mới.</p>}
      </section>}
      {confirmOff && detail && <section role="alertdialog" aria-modal="true" aria-label="Xác nhận tắt cảnh báo" className="rounded-xl border border-sos/40 bg-card p-5">
        <p>Bạn chắc chắn muốn tắt “{detail.title}”? Không thể bật lại hoặc sửa bản tin đã tắt.</p><div className="mt-3 flex gap-2">
          <button className={button} disabled={busy} onClick={() => setConfirmOff(false)}>Hủy</button>
          <button className={`${button} text-sos`} disabled={busy} onClick={() => void deactivate()}>{busy ? "Đang tắt…" : "Xác nhận tắt"}</button></div></section>}
      {editor !== undefined && <FloodWarningForm key={editor?.id ?? "create"} warning={editor} busy={busy} locked={!!pending} error={formError}
        onClose={() => setEditor(undefined)} onSave={(fields) => void save(fields)} />}
    </div>
  </AppShell>;
}
