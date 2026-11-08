import { useEffect, useRef, useState, type FormEvent } from "react";
import { severityLabels, toIctInput, type FloodWarning, type WarningArea, type WarningFields } from "./floodWarningTypes";

const input = "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-water focus:outline-none";
const secondary = "rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-bg disabled:opacity-50";
const primary = "rounded-lg bg-water px-4 py-2 text-sm font-bold text-bg hover:bg-water/85 disabled:opacity-50";

interface Props {
  warning: FloodWarning | null;
  areas: WarningArea[];
  demo: boolean;
  busy: boolean;
  error: { message: string; correctable: boolean } | null;
  onReview: () => void;
  onClose: () => void;
  onSave: (fields: WarningFields) => void;
}

export function FloodWarningForm({ warning, areas, demo, busy, error, onReview, onClose, onSave }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<WarningFields>(() => ({
    title: warning?.title ?? "",
    content: warning?.content ?? "",
    severity: warning?.severity ?? "low",
    status: warning?.status ?? "inactive",
    areaId: warning?.areaId ?? "",
    startAt: toIctInput(warning?.startAt ?? ""),
    endAt: toIctInput(warning?.endAt ?? ""),
  }));
  const [validation, setValidation] = useState("");
  const [confirmedFields, setConfirmedFields] = useState<WarningFields | null>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  function change<K extends keyof WarningFields>(key: K, value: WarningFields[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setValidation("");
  }

  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const start = new Date(`${draft.startAt}+07:00`);
    const end = new Date(`${draft.endAt}+07:00`);
    const title = draft.title.trim();
    const content = draft.content.trim();
    if (!title || !content || !areas.some((area) => area.id === draft.areaId)) {
      setValidation("Nhập tiêu đề, nội dung và chọn một vùng ngập trong danh sách.");
      return;
    }
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || +start >= +end) {
      setValidation("Thời gian bắt đầu phải trước thời gian kết thúc.");
      return;
    }
    setConfirmedFields({ ...draft, title, content, startAt: start.toISOString(), endAt: end.toISOString() });
  }

  return (
    <dialog ref={dialog} aria-labelledby="warning-form-title"
      className="m-auto max-h-[90dvh] w-[min(94vw,44rem)] overflow-y-auto rounded-2xl border border-border bg-card p-0 text-text backdrop:bg-black/65"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <div className="border-b border-border px-5 py-4">
        <p className="text-xs font-semibold tracking-wide text-water">THÔNG TIN CẢNH BÁO {demo && "· TEST ONLY"}</p>
        <h2 id="warning-form-title" className="mt-1 text-xl font-bold">{warning ? "Chỉnh sửa cảnh báo lũ" : "Tạo cảnh báo lũ"}</h2>
      </div>
      <form onSubmit={confirm} className="space-y-4 p-5">
        <fieldset disabled={busy || !!confirmedFields} className="space-y-4 disabled:opacity-65">
          <label className="block space-y-1 text-sm"><span>Tiêu đề</span>
            <input className={input} required value={draft.title} onChange={(e) => change("title", e.target.value)} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm"><span id="ccf120-form-severity">Mức độ</span>
              <select aria-labelledby="ccf120-form-severity" className={input} value={draft.severity} onChange={(e) => change("severity", e.target.value as WarningFields["severity"])}>
                {Object.entries(severityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm"><span id="ccf120-form-state">Trạng thái lưu</span>
              <select aria-labelledby="ccf120-form-state" className={input} value={draft.status} onChange={(e) => change("status", e.target.value as WarningFields["status"])}>
                <option value="inactive">Đã tắt</option><option value="active">Đã bật</option>
              </select>
            </label>
          </div>
          <label className="block space-y-1 text-sm"><span id="ccf120-form-area">Vùng ngập</span>
            <select aria-labelledby="ccf120-form-area" className={input} required value={areas.some((area) => area.id === draft.areaId) ? draft.areaId : ""} onChange={(e) => change("areaId", e.target.value)}>
              <option value="">Chọn vùng ngập có sẵn</option>
              {areas.map((area) => <option key={area.id} value={area.id}>{area.name} · {area.id}</option>)}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm"><span>Bắt đầu (ICT)</span>
              <input className={input} type="datetime-local" step="0.001" required value={draft.startAt} onChange={(e) => change("startAt", e.target.value)} />
            </label>
            <label className="space-y-1 text-sm"><span>Kết thúc (ICT)</span>
              <input className={input} type="datetime-local" step="0.001" required value={draft.endAt} onChange={(e) => change("endAt", e.target.value)} />
            </label>
          </div>
          <label className="block space-y-1 text-sm"><span>Nội dung và hướng dẫn</span>
            <textarea className={input} rows={4} required value={draft.content} onChange={(e) => change("content", e.target.value)} />
          </label>
        </fieldset>
        {validation && <p role="alert" className="text-sm text-sos">{validation}</p>}
        {error && <p role="alert" className="rounded-lg border border-sos/40 bg-sos/10 p-3 text-sm text-sos">{error.message}</p>}
        {confirmedFields && <p role="status" className="rounded-lg border border-water/35 bg-water/10 p-3 text-sm">
          Xác nhận {warning ? "cập nhật" : "tạo"} cảnh báo <strong>{confirmedFields.title}</strong>{demo ? " trong dữ liệu thử?" : "?"}
        </p>}
        <footer className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <button type="button" className={secondary} onClick={onClose} disabled={busy}>Hủy</button>
          {confirmedFields ? <>
            <button type="button" className={secondary} disabled={busy || (error !== null && !error.correctable)} onClick={() => { onReview(); setConfirmedFields(null); }}>Sửa lại</button>
            <button type="button" className={primary} disabled={busy || !!error} onClick={() => onSave(confirmedFields)}>
              {busy ? "Đang lưu…" : "Xác nhận lưu"}
            </button>
          </> : <button type="submit" className={primary}>Tiếp tục</button>}
        </footer>
      </form>
    </dialog>
  );
}
