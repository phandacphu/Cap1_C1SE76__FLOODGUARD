import { useState } from "react";
import { PolygonPreview } from "./PolygonPreview";
import {
  SEVERITIES,
  SEVERITY_LABEL,
  STATUS_LABEL,
  validateArea,
  type AreaStatus,
  type FloodAreaInput,
  type FloodAreaItem,
  type Severity,
} from "../floodAreaTypes";

interface Props {
  /** null = create a new area. */
  area: FloodAreaItem | null;
  busy: boolean;
  serverError: string | null;
  onSubmit: (input: FloodAreaInput) => void;
  onClose: () => void;
}

const FIELD =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-water focus:outline-none disabled:opacity-60";

/** Create / edit form with a polygon editor (at least 3 points, latitude/longitude as numbers). */
export function AreaFormModal({ area, busy, serverError, onSubmit, onClose }: Props) {
  const [name, setName] = useState(area?.name ?? "");
  const [description, setDescription] = useState(area?.description ?? "");
  const [severity, setSeverity] = useState<Severity>(area?.severity ?? "medium");
  const [status, setStatus] = useState<AreaStatus>(area?.status ?? "active");
  const [source, setSource] = useState(area?.source ?? "");
  // Coordinates stay as text while typing so a half-typed "16." is not lost.
  const [points, setPoints] = useState<{ lat: string; lng: string }[]>(
    area
      ? area.geometry.points.map((p) => ({ lat: String(p.latitude), lng: String(p.longitude) }))
      : [{ lat: "", lng: "" }, { lat: "", lng: "" }, { lat: "", lng: "" }],
  );
  const [errors, setErrors] = useState<string[]>([]);

  const toInput = (): FloodAreaInput => ({
    name: name.trim(),
    description: description.trim(),
    severity,
    status,
    source: source.trim(),
    geometry: {
      type: "polygon",
      points: points.map((p) => ({
        latitude: p.lat.trim() === "" ? NaN : Number(p.lat),
        longitude: p.lng.trim() === "" ? NaN : Number(p.lng),
      })),
    },
  });

  const submit = () => {
    const input = toInput();
    const found = validateArea(input);
    setErrors(found);
    if (found.length === 0) onSubmit(input);
  };

  const setPoint = (i: number, key: "lat" | "lng", value: string) =>
    setPoints((prev) => prev.map((p, idx) => (idx === i ? { ...p, [key]: value } : p)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Đóng" disabled={busy} onClick={onClose} className="absolute inset-0 bg-black/70" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={area ? "Sửa vùng ngập" : "Thêm vùng ngập"}
        className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl"
      >
        <h2 className="text-lg font-bold">{area ? "Sửa vùng ngập" : "Thêm vùng ngập"}</h2>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted">Tên vùng ngập</span>
            <input aria-label="Tên vùng ngập" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} className={`${FIELD} mt-1`} />
          </label>
          <label className="sm:col-span-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted">Mô tả</span>
            <textarea aria-label="Mô tả" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} className={`${FIELD} mt-1 resize-none`} />
          </label>
          <label>
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted">Mức độ</span>
            <select aria-label="Mức độ" value={severity} onChange={(e) => setSeverity(e.target.value as Severity)} disabled={busy} className={`${FIELD} mt-1`}>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>{SEVERITY_LABEL[s]} ({s})</option>
              ))}
            </select>
          </label>
          <label>
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted">Trạng thái</span>
            <select aria-label="Trạng thái" value={status} onChange={(e) => setStatus(e.target.value as AreaStatus)} disabled={busy} className={`${FIELD} mt-1`}>
              <option value="active">{STATUS_LABEL.active} (active)</option>
              <option value="inactive">{STATUS_LABEL.inactive} (inactive)</option>
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted">Nguồn dữ liệu</span>
            <input aria-label="Nguồn dữ liệu" value={source} onChange={(e) => setSource(e.target.value)} disabled={busy} placeholder="Ví dụ: Trung tâm khí tượng thủy văn" className={`${FIELD} mt-1`} />
          </label>
        </div>

        <fieldset className="mt-5">
          <legend className="font-mono text-[11px] uppercase tracking-wider text-muted">
            Đa giác (tối thiểu 3 điểm, vĩ độ / kinh độ dạng số)
          </legend>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <ul className="space-y-2">
              {points.map((p, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-5 text-center font-mono text-xs text-muted">{i + 1}</span>
                  <input aria-label={`Vĩ độ điểm ${i + 1}`} inputMode="decimal" placeholder="Vĩ độ" value={p.lat} onChange={(e) => setPoint(i, "lat", e.target.value)} disabled={busy} className={FIELD} />
                  <input aria-label={`Kinh độ điểm ${i + 1}`} inputMode="decimal" placeholder="Kinh độ" value={p.lng} onChange={(e) => setPoint(i, "lng", e.target.value)} disabled={busy} className={FIELD} />
                  <button
                    type="button"
                    aria-label={`Xóa điểm ${i + 1}`}
                    disabled={busy || points.length <= 3}
                    onClick={() => setPoints((prev) => prev.filter((_, idx) => idx !== i))}
                    title={points.length <= 3 ? "Cần giữ tối thiểu 3 điểm" : "Xóa điểm"}
                    className="rounded border border-border px-2 py-1 text-xs text-muted hover:text-text disabled:opacity-30"
                  >
                    ✕
                  </button>
                </li>
              ))}
              <li>
                <button type="button" disabled={busy} onClick={() => setPoints((prev) => [...prev, { lat: "", lng: "" }])} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-water/50">
                  + Thêm điểm
                </button>
              </li>
            </ul>
            <PolygonPreview points={toInput().geometry.points} />
          </div>
        </fieldset>

        {errors.length > 0 && (
          <ul role="alert" className="mt-4 list-disc space-y-1 rounded-lg border border-sos/50 bg-sos/10 p-3 pl-6 text-xs text-red-200">
            {errors.map((e) => (<li key={e}>{e}</li>))}
          </ul>
        )}
        {serverError && (
          <p role="alert" className="mt-4 rounded-lg border border-sos/50 bg-sos/10 p-3 text-xs text-red-200">
            <strong>Lưu thất bại:</strong> {serverError}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-bg/60 disabled:opacity-60">Hủy</button>
          <button type="button" disabled={busy} onClick={submit} className="rounded-lg bg-water px-4 py-2 text-sm font-semibold text-bg hover:brightness-110 disabled:cursor-wait disabled:opacity-60">
            {busy ? "Đang lưu..." : area ? "Lưu thay đổi" : "Tạo vùng ngập"}
          </button>
        </div>
      </div>
    </div>
  );
}
