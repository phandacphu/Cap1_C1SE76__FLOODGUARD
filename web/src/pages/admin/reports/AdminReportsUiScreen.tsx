import { useEffect, useRef, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { Link } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { ApiError } from "../../../api/http";
import type { SosSummary } from "../sos/sosTypes";
import { AdminUiPreview, PreviewBadge, PreviewPanel, PreviewStat, previewSecondaryButton } from "../ui-preview/AdminUiPreview";
import { locationTypeLabels } from "../safe-location/safeLocationTypes";
import { fetchSosReport, fetchWarningReport, fetchFloodAreaReport, fetchManagedAreaReport, fetchSafeLocationReport, combineAreaReports, reportWindow, type ReportRange, type WarningSummary, type CombinedAreaSummary, type SafeLocationSummary } from "./reportApi";

type Load<T> = { data: T | null; loading: boolean; error: string; stale: boolean };
const empty = <T,>(): Load<T> => ({ data: null, loading: true, error: "", stale: false });
const formatDate = (iso: string) => new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
const failed = (cause: unknown) => cause instanceof Error ? cause.message : "Không thể tải dữ liệu.";

export default function AdminReportsUiScreen() {
  const { token, logout } = useAuth();
  const [range, setRange] = useState<ReportRange>("7d");
  const [refreshKey, setRefreshKey] = useState(0);
  const [sos, setSos] = useState<Load<SosSummary>>(empty);
  const [warning, setWarning] = useState<Load<WarningSummary>>(empty);
  const [areas, setAreas] = useState<Load<CombinedAreaSummary>>(empty);
  const [locations, setLocations] = useState<Load<SafeLocationSummary>>(empty);
  const [locked, setLocked] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    let cancelled = false;
    const allowed = () => !cancelled && current === generation.current;
    if (!token || locked) return;
    // A new date range invalidates the previous SOS statistics; refresh errors retain the previous range only when unchanged.
    const sosRequest = fetchSosReport(token, range);
    const warningRequest = fetchWarningReport(token);
    const areaRequest = Promise.all([fetchFloodAreaReport(), fetchManagedAreaReport(token)])
      .then(([history, managed]) => combineAreaReports(history, managed));
    const locationRequest = fetchSafeLocationReport(token);
    void sosRequest.then((data) => {
      if (allowed()) setSos({ data, loading: false, error: "", stale: false });
    }, (cause: unknown) => {
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) { deny(cause); return; }
      if (!allowed()) return;
      setSos((old) => ({ ...old, loading: false, error: failed(cause), stale: old.data !== null }));
    });
    void warningRequest.then((data) => {
      if (allowed()) setWarning({ data, loading: false, error: "", stale: false });
    }, (cause: unknown) => {
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) { deny(cause); return; }
      if (!allowed()) return;
      setWarning((old) => ({ ...old, loading: false, error: failed(cause), stale: old.data !== null }));
    });
    void areaRequest.then((data) => {
      if (allowed()) setAreas({ data, loading: false, error: "", stale: false });
    }, (cause: unknown) => {
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) { deny(cause); return; }
      if (allowed()) setAreas((old) => ({ ...old, loading: false, error: failed(cause), stale: old.data !== null }));
    });
    void locationRequest.then((data) => {
      if (allowed()) setLocations({ data, loading: false, error: "", stale: false });
    }, (cause: unknown) => {
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) { deny(cause); return; }
      if (allowed()) setLocations((old) => ({ ...old, loading: false, error: failed(cause), stale: old.data !== null }));
    });
    function deny(cause: ApiError) {
      generation.current++;
      setLocked(true); setSos({ data: null, loading: false, error: failed(cause), stale: false });
      setWarning({ data: null, loading: false, error: failed(cause), stale: false });
      setAreas({ data: null, loading: false, error: failed(cause), stale: false });
      setLocations({ data: null, loading: false, error: failed(cause), stale: false });
      if (cause.status === 401) logout();
    }
    return () => { cancelled = true; };
  }, [token, range, refreshKey, locked, logout]);

  function chooseRange(next: ReportRange) {
    if (next === range || locked) return;
    setRange(next); setSos(empty());
  }
  function refresh() {
    if (locked || sos.loading || warning.loading || areas.loading || locations.loading) return;
    setSos((old) => ({ ...old, loading: true, error: "" }));
    setWarning((old) => ({ ...old, loading: true, error: "" }));
    setAreas((old) => ({ ...old, loading: true, error: "" }));
    setLocations((old) => ({ ...old, loading: true, error: "" }));
    setRefreshKey((value) => value + 1);
  }
  const window = reportWindow(range);
  const value = (n: number | undefined) => n === undefined ? "—" : n.toLocaleString("vi-VN");
  const total = sos.data?.total ?? 0;
  const completion = total ? Math.round((100 * (sos.data?.rescued ?? 0)) / total) : 0;
  const other = sos.data?.legacyOther ?? 0;
  const sectionLink = (path: string, title: string) => <Link to={path} className="text-sm font-semibold text-water hover:underline">{title} →</Link>;

  return <AdminUiPreview preview={false} title="Báo cáo & thống kê"
    subtitle="Tổng hợp tình hình cứu hộ, cảnh báo lũ, vùng ngập và điểm an toàn."
    action={<div className="flex gap-2"><button type="button" className={previewSecondaryButton} disabled={locked || sos.loading || warning.loading || areas.loading || locations.loading} onClick={refresh}>Làm mới</button>
      <button type="button" disabled title="Chưa có chức năng xuất báo cáo được duyệt" className={`${previewSecondaryButton} inline-flex cursor-not-allowed items-center gap-2 opacity-50`}>
        <Icon name="download" className="h-4 w-4" /> Xuất báo cáo
      </button></div>}>
    {locked && <p role="alert" className="rounded-xl border border-red-500/40 p-4 text-sm">Phiên hoặc quyền Admin không hợp lệ. Dữ liệu báo cáo đã bị khóa.</p>}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4">
      <div><p className="text-sm font-semibold text-white">Khoảng thời gian SOS</p>
        <p className="mt-1 text-xs text-slate-400">Từ {formatDate(window.from)} đến {formatDate(window.to)} (GMT+7)</p></div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Chọn khoảng thời gian báo cáo">
        {([["7d", "7 ngày"], ["30d", "30 ngày"], ["90d", "90 ngày"]] as const).map(([key, label]) => <button type="button" key={key}
          aria-pressed={range === key} disabled={locked} onClick={() => chooseRange(key)}
          className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${range === key ? "bg-water text-slate-950" : "bg-slate-800 text-slate-400 hover:text-white"}`}>{label}</button>)}
      </div>
    </div>
    {sos.loading && <p role="status" className="text-sm text-slate-400">Đang tải thống kê SOS…</p>}
    {warning.loading && <p role="status" className="text-sm text-slate-400">Đang tải thống kê cảnh báo lũ…</p>}
    {areas.loading && <p role="status" className="text-sm text-slate-400">Đang tải thống kê vùng ngập…</p>}
    {locations.loading && <p role="status" className="text-sm text-slate-400">Đang tải thống kê điểm an toàn…</p>}
    {sos.error && <p role="alert" className="rounded-xl border border-amber-600/40 p-4 text-sm">SOS: {sos.stale ? "Chưa cập nhật, đang hiển thị dữ liệu cũ. " : ""}{sos.error}<button className={`${previewSecondaryButton} ml-3`} disabled={locked} onClick={refresh}>Thử lại</button></p>}
    {warning.error && <p role="alert" className="rounded-xl border border-amber-600/40 p-4 text-sm">Cảnh báo lũ: {warning.stale ? "Chưa cập nhật, đang hiển thị dữ liệu cũ. " : ""}{warning.error}<button className={`${previewSecondaryButton} ml-3`} disabled={locked} onClick={refresh}>Thử lại</button></p>}
    {areas.error && <p role="alert" className="rounded-xl border border-amber-600/40 p-4 text-sm">Vùng ngập: {areas.stale ? "Chưa cập nhật, đang hiển thị dữ liệu cũ. " : ""}{areas.error}<button className={`${previewSecondaryButton} ml-3`} disabled={locked} onClick={refresh}>Thử lại</button></p>}
    {locations.error && <p role="alert" className="rounded-xl border border-amber-600/40 p-4 text-sm">Điểm an toàn: {locations.stale ? "Chưa cập nhật, đang hiển thị dữ liệu cũ. " : ""}{locations.error}<button className={`${previewSecondaryButton} ml-3`} disabled={locked} onClick={refresh}>Thử lại</button></p>}
    <div className="grid gap-4 sm:grid-cols-3">
      <PreviewStat title="Tổng SOS" value={value(sos.data?.total)} detail="Trong kỳ đã chọn" />
      <PreviewStat title="Đã cứu" value={value(sos.data?.rescued)} detail="Trong kỳ đã chọn" tone="safe" />
      <PreviewStat title="SOS đang hoạt động" value={value(sos.data?.active)} detail="Trong kỳ đã chọn" tone="warn" />
    </div>
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Theo dõi SOS · Trong kỳ</h2>{sectionLink("/admin/sos", "Xem SOS")}</div>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
      <PreviewPanel title="Phân loại SOS trong kỳ" extra={<PreviewBadge tone="muted">Theo trạng thái</PreviewBadge>}>
        {sos.data ? <div className="space-y-4 p-6">
          {([
            ["Đã cứu", sos.data.rescued, "bg-safe"], ["Đang hoạt động", sos.data.active, "bg-warn"],
            ["Dữ liệu lịch sử khác", other, "bg-slate-500"],
          ] as const).map(([label, amount, color]) => <div key={label}>
            <div className="mb-2 flex justify-between text-sm"><span>{label}</span><strong>{amount}</strong></div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-800"><div className={`h-full ${color}`} style={{ width: `${total ? (amount / total) * 100 : 0}%` }} /></div>
          </div>)}
        </div> : <p className="p-6 text-sm text-slate-400">Chưa có số liệu SOS được xác nhận.</p>}
      </PreviewPanel>
      <PreviewPanel title="Tiến độ cứu hộ" extra={<PreviewBadge tone="muted">{sos.data ? `${completion}% đã cứu` : "Chưa xác định"}</PreviewBadge>}>
        {sos.data ? <div className="flex flex-col items-center gap-5 p-6"><div role="img" aria-label={`${completion}% SOS đã cứu`} className="flex h-40 w-40 items-center justify-center rounded-full"
          style={{ background: `conic-gradient(#2ee88a 0% ${completion}%, #334155 ${completion}% 100%)` }}>
          <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-card"><strong className="text-3xl">{completion}%</strong><span className="text-xs text-slate-400">Đã cứu</span></div>
        </div><p className="text-center text-sm text-slate-400">Đã cứu {sos.data.rescued} / {sos.data.total} yêu cầu SOS trong kỳ.</p></div>
          : <p className="p-6 text-sm text-slate-400">Chưa xác định tiến độ.</p>}
      </PreviewPanel>
    </div>
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Quản lý cảnh báo lũ · Toàn hệ thống</h2>{sectionLink("/admin/flood-warnings", "Xem cảnh báo lũ")}</div>
    <PreviewPanel title="Cảnh báo lũ">
      {warning.data ? <div className="grid gap-4 p-5 sm:grid-cols-3"><PreviewStat title="Tổng bản tin" value={warning.data.total} detail="Toàn hệ thống" />
        <PreviewStat title="Đang bật" value={warning.data.active} detail="Cảnh báo đang hiệu lực" tone="safe" />
        <PreviewStat title="Đã tắt" value={warning.data.inactive} detail="Lịch sử cảnh báo" tone="warn" /></div>
        : <p className="p-5 text-sm text-slate-400">Chưa có số liệu cảnh báo lũ.</p>}
    </PreviewPanel>
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Quản lý vùng ngập</h2>{sectionLink("/admin/flood-areas", "Xem vùng ngập")}</div>
    <PreviewPanel title="Thống kê vùng ngập và vùng trũng">
      {areas.data ? <div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <PreviewStat title="Tổng vùng" value={areas.data.total} detail="Toàn hệ thống" />
          <PreviewStat title="Vùng ngập" value={areas.data.flood} detail="Toàn hệ thống" tone="warn" />
          <PreviewStat title="Vùng trũng" value={areas.data.lowLying} detail="Toàn hệ thống" tone="water" />
        </div>
        {([ ["Vùng ngập", areas.data.flood, "bg-warn"], ["Vùng trũng", areas.data.lowLying, "bg-water"] ] as const).map(([label, count, color]) =>
          <div key={label}><div className="mb-2 flex justify-between text-sm"><span>{label}</span><strong>{count}</strong></div><div className="h-3 overflow-hidden rounded-full bg-slate-800"><div className={`h-full ${color}`} style={{ width: `${areas.data!.total ? count / areas.data!.total * 100 : 0}%` }} /></div></div>)}
      </div> : <p className="p-5 text-sm text-slate-400">Chưa có số liệu vùng ngập.</p>}
    </PreviewPanel>
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Quản lý điểm an toàn · Toàn hệ thống</h2>{sectionLink("/admin/safe-locations", "Xem điểm an toàn")}</div>
    <PreviewPanel title="Phân loại điểm an toàn">
      {locations.data ? <div className="space-y-5 p-5">
        <PreviewStat title="Tổng điểm an toàn" value={locations.data.total} detail="Toàn hệ thống" />
        {(Object.entries({ ...locationTypeLabels, unclassified: "Chưa phân loại" }) as [keyof SafeLocationSummary["byType"], string][]).map(([key, label]) => {
          const count = locations.data!.byType[key];
          return <div key={key}><div className="mb-2 flex justify-between text-sm"><span>{label}</span><strong>{count}</strong></div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-water" style={{ width: `${locations.data!.total ? count / locations.data!.total * 100 : 0}%` }} /></div></div>;
        })}
      </div> : <p className="p-5 text-sm text-slate-400">Chưa có số liệu điểm an toàn.</p>}
    </PreviewPanel>
  </AdminUiPreview>;
}
