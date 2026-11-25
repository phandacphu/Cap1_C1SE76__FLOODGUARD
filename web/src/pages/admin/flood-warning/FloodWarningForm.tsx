import { useEffect, useRef, useState, type FormEvent } from "react";
import type { FloodWarning, WarningFields } from "./floodWarningTypes";

const input = "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-water focus:outline-none";
const button = "rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50";
interface Props {
  warning: FloodWarning | null; initial?: WarningFields; busy: boolean; locked?: boolean; error: string;
  onClose(): void; onSave(fields: WarningFields): void;
}
export function FloodWarningForm({ warning, initial, busy, locked, error, onClose, onSave }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<WarningFields>(initial ?? { title: warning?.title ?? "", content: warning?.content ?? "" });
  const [validation, setValidation] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => { const el = dialog.current; el?.showModal(); return () => el?.close(); }, []);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const title = draft.title.trim(), content = draft.content.trim();
    if (![...title].length || [...title].length > 180 || ![...content].length || [...content].length > 4000) {
      setValidation("Tiêu đề cần 1–180 ký tự, nội dung cần 1–4000 ký tự sau khi bỏ khoảng trắng đầu/cuối."); return;
    }
    setDraft({ title, content }); setValidation(""); setConfirmed(true);
  };
  return <dialog ref={dialog} className="m-auto max-h-[90dvh] w-[min(94vw,44rem)] overflow-y-auto rounded-2xl border border-border bg-card p-0 text-text backdrop:bg-black/70"
    onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }} aria-labelledby="warning-dialog-title">
    <div className="border-b border-border p-5"><p className="text-xs tracking-widest text-water">CẢNH BÁO V2</p>
      <h2 id="warning-dialog-title" className="mt-1 text-xl font-bold">{warning ? "Chỉnh sửa bản tin đang bật" : "Tạo bản tin cảnh báo"}</h2></div>
    <form className="space-y-4 p-5" onSubmit={submit}>
      <fieldset disabled={busy || locked || confirmed} className="space-y-4 disabled:opacity-70">
        <label className="block space-y-1 text-sm">Tiêu đề * <input className={input} required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
        <label className="block space-y-1 text-sm">Nội dung cảnh báo và hướng dẫn * <textarea className={input} rows={6} required value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} /></label>
      </fieldset>
      <p className="rounded-lg border border-water/30 bg-water/10 p-3 text-xs text-muted">Phạm vi: tất cả vùng hệ thống công bố. Bản tin mới tự bật ngay; thời gian do Backend ghi nhận (GMT+7 khi hiển thị).</p>
      {confirmed && <p role="status" className="rounded-lg border border-water/30 p-3 text-sm">Xác nhận {warning ? "sửa" : "tạo"} bản tin “{draft.title}”?</p>}
      {validation && <p role="alert" className="text-sm text-sos">{validation}</p>}
      {error && <p role="alert" className="rounded-lg border border-sos/40 bg-sos/10 p-3 text-sm text-sos">{error}</p>}
      {locked && <p role="alert" className="text-sm text-warn">Thao tác tạo trước chưa xác định kết quả. Phải đối chiếu hoặc thử lại đúng nội dung và khóa cũ.</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <button type="button" className={button} disabled={busy} onClick={onClose}>Đóng</button>
        {confirmed && !locked && <button type="button" className={button} disabled={busy} onClick={() => setConfirmed(false)}>Sửa lại</button>}
        {confirmed ? <button type="button" className="rounded-lg bg-water px-4 py-2 text-sm font-bold text-bg disabled:opacity-50" disabled={busy || locked} onClick={() => onSave(draft)}>{busy ? "Đang gửi…" : "Xác nhận lưu"}</button>
          : <button className="rounded-lg bg-water px-4 py-2 text-sm font-bold text-bg disabled:opacity-50" disabled={busy || locked}>Tiếp tục</button>}
      </div>
    </form>
  </dialog>;
}
