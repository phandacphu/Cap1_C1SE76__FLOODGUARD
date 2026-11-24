import { useRef, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { AdminUiPreview, PreviewBadge, PreviewPanel, previewInputClass, previewSecondaryButton } from "../ui-preview/AdminUiPreview";
import { fetchNotificationLogs, NotificationLogError, type DeliveryLog, type LookupKey } from "./notificationLogApi";

const buttonClass = "rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50";
const statusText: Record<DeliveryLog["status"], string> = {
  queued: "Đã xếp hàng", sent: "Đã gửi tới nhà cung cấp", failed: "Gửi thất bại",
};
const dateOf = (date: string) => new Date(date).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

export default function AdminNotificationsUiScreen() {
  const { token, logout } = useAuth();
  const [key, setKey] = useState<LookupKey>("notificationId");
  const [value, setValue] = useState("");
  const [records, setRecords] = useState<DeliveryLog[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [locked, setLocked] = useState(false);
  const ticket = useRef(0);
  const busy = useRef(false);
  const lookupRef = useRef<{ key: LookupKey; value: string } | null>(null);

  function clear(nextKey: LookupKey, nextValue: string) {
    ticket.current++;
    setKey(nextKey); setValue(nextValue); setRecords([]); setCursor(null);
    setSelectedId(null); setLoaded(false); setError(""); setStale(false);
    lookupRef.current = null;
  }

  async function search(nextPage = false) {
    if (!token || locked || busy.current || (nextPage && (!cursor || !lookupRef.current))) return;
    const target = nextPage ? lookupRef.current! : { key, value };
    const currentTicket = ++ticket.current;
    busy.current = true; setLoading(true); setError("");
    try {
      const page = await fetchNotificationLogs(token, target.key, target.value, nextPage ? cursor! : undefined);
      if (currentTicket !== ticket.current) return;
      const combined = nextPage ? [...records, ...page.logs] : page.logs;
      if (new Set(combined.map((log) => log.id)).size !== combined.length) {
        throw new NotificationLogError("Nhật ký có ID trùng giữa các trang.", -1);
      }
      setRecords(combined); setCursor(page.nextCursor); setLoaded(true); setStale(false);
      lookupRef.current = target;
      setSelectedId((old) => combined.some((log) => log.id === old) ? old : combined[0]?.id ?? null);
    } catch (cause) {
      const permission = cause instanceof NotificationLogError && (cause.status === 401 || cause.status === 403);
      if (permission) {
        ticket.current++; setLocked(true); setRecords([]); setCursor(null);
        setSelectedId(null); setLoaded(false); lookupRef.current = null;
        if ((cause as NotificationLogError).status === 401) logout();
      }
      if (currentTicket === ticket.current || permission) {
        setError(cause instanceof Error ? cause.message : "Không thể tra cứu nhật ký.");
        setStale(loaded && !permission);
      }
    } finally {
      busy.current = false; setLoading(false);
    }
  }

  const selected = records.find((item) => item.id === selectedId) ?? null;
  return <AdminUiPreview preview={false} title="Thông báo & Nhật ký gửi"
    subtitle="Tra cứu nhật ký gửi thông báo của hệ thống. Đây không phải hộp thư đã đọc/chưa đọc của Admin."
    action={<button type="button" className={previewSecondaryButton} disabled={loading || locked || !loaded} onClick={() => void search()}>Làm mới kết quả</button>}>
    <PreviewPanel title="Tra cứu nhật ký" extra={<PreviewBadge tone="muted">Chỉ đọc · Admin</PreviewBadge>}>
      <form className="grid gap-3 p-5 sm:grid-cols-[minmax(180px,0.35fr)_minmax(0,1fr)_auto]"
        onSubmit={(event) => { event.preventDefault(); void search(); }}>
        <label className="space-y-1 text-sm"><span>Loại mã</span><select className={previewInputClass} value={key}
          disabled={loading || locked} onChange={(event) => clear(event.target.value as LookupKey, "")}>
          <option value="notificationId">Notification ID</option><option value="correlationId">Correlation ID</option><option value="eventId">Event ID</option>
        </select></label>
        <label className="space-y-1 text-sm"><span>Mã cần tra cứu</span><input className={previewInputClass} value={value}
          disabled={loading || locked} onChange={(event) => clear(key, event.target.value)} placeholder="Nhập chính xác một mã…" /></label>
        <button type="submit" className={`${buttonClass} self-end`} disabled={loading || locked || !value.trim()}>Tra cứu</button>
      </form>
      <p className="px-5 pb-4 text-xs text-slate-400">Kết quả phân trang theo ID nhật ký, không phải thời gian. “Đã gửi” không có nghĩa người dùng đã nhận hoặc đọc thông báo.</p>
    </PreviewPanel>

    {locked && <p role="alert" className="rounded-xl border border-red-500/40 p-4 text-sm">Phiên hoặc quyền Admin không hợp lệ. Đã khóa dữ liệu nhật ký.</p>}
    {error && <p role="alert" className="rounded-xl border border-amber-500/40 p-4 text-sm">{stale ? "Chưa cập nhật — đang giữ kết quả cũ. " : ""}{error}{!locked && <button className={`${buttonClass} ml-3`} onClick={() => void search()}>Thử lại</button>}</p>}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
      <PreviewPanel title="Kết quả nhật ký" extra={<PreviewBadge tone="muted">{loaded ? `${records.length} dòng đã tải` : "Chưa tra cứu"}</PreviewBadge>}>
        {loading && <p role="status" className="p-5 text-sm text-slate-400">Đang tải nhật ký…</p>}
        {!loaded && !loading && <p className="p-5 text-sm text-slate-400">Nhập mã và chọn Tra cứu để xem nhật ký.</p>}
        {loaded && records.length === 0 && <p className="p-5 text-sm text-slate-400">Không có nhật ký phù hợp.</p>}
        {records.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[660px] text-left text-sm">
          <thead className="bg-bg/50 text-xs uppercase text-slate-400"><tr><th className="px-4 py-3">Thời gian (GMT+7)</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3">Retry</th><th className="px-4 py-3">Mã phản hồi</th><th className="px-4 py-3">Thao tác</th></tr></thead>
          <tbody className="divide-y divide-border/80">{records.map((log) => <tr key={log.id} className={selectedId === log.id ? "bg-water/5" : ""}>
            <td className="px-4 py-3">{dateOf(log.timestamp)}</td><td className="px-4 py-3">{statusText[log.status]}</td>
            <td className="px-4 py-3">{log.retryCount}</td><td className="break-all px-4 py-3 text-xs">{log.providerResponseCode}</td>
            <td className="px-4 py-3"><button className={buttonClass} onClick={() => setSelectedId(log.id)}>Chi tiết</button></td>
          </tr>)}</tbody></table></div>}
        {cursor && <div className="border-t border-border p-4"><button className={buttonClass} disabled={loading || locked} onClick={() => void search(true)}>Xem thêm</button></div>}
      </PreviewPanel>
      <PreviewPanel title="Chi tiết nhật ký">{selected ? <dl className="grid gap-4 p-5 text-sm">{([
        ["Log ID", selected.id], ["Notification ID", selected.notificationId], ["Correlation ID", selected.correlationId],
        ["Event ID", selected.eventId], ["Trạng thái", statusText[selected.status]], ["Số lần thử lại", String(selected.retryCount)],
        ["Mã phản hồi", selected.providerResponseCode], ["Kết quả chưa xác định", selected.outcomeUnknown ? "Có" : "Không"],
        ["Thời gian (GMT+7)", dateOf(selected.timestamp)],
      ] as const).map(([label, content]) => <div key={label}><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-1 break-all">{content}</dd></div>)}</dl>
        : <p className="p-5 text-sm text-slate-400">Chọn một dòng nhật ký để xem chi tiết.</p>}
      </PreviewPanel>
    </div>
  </AdminUiPreview>;
}
