import { useEffect, useRef, useState, type FormEvent } from "react";
import { SafeLocationMap } from "./SafeLocationMap";
import {
  locationTypeLabels,
  validCoordinates,
  type SafeLocation,
  type SafeLocationFields,
  type SafeLocationType,
} from "./safeLocationTypes";

const input = "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-water focus:outline-none";
const secondary = "rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-bg disabled:opacity-50";
const primary = "rounded-lg bg-safe px-4 py-2 text-sm font-bold text-bg hover:bg-safe/85 disabled:opacity-50";

interface Props {
  location: SafeLocation | null;
  demo: boolean;
  busy: boolean;
  error: { message: string; correctable: boolean } | null;
  onReview: () => void;
  onClose: () => void;
  onSave: (fields: SafeLocationFields) => void;
}

/** The API v2 form has no capacity or activate/deactivate controls. */
export function SafeLocationForm({ location, demo, busy, error, onReview, onClose, onSave }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(() => ({
    name: location?.name ?? "",
    address: location?.address ?? "",
    type: location?.type ?? "shelter" as SafeLocationType,
    description: location?.description ?? "",
    latitude: location?.location ? String(location.location.latitude) : "",
    longitude: location?.location ? String(location.location.longitude) : "",
  }));
  const [validation, setValidation] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [confirmation, setConfirmation] = useState<SafeLocationFields | null>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  function change<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setValidation("");
  }

  const point = { latitude: Number(draft.latitude), longitude: Number(draft.longitude) };
  const hasPoint = draft.latitude.trim() !== "" && draft.longitude.trim() !== "" && validCoordinates(point);

  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = draft.name.trim();
    const address = draft.address.trim();
    const description = draft.description.trim();
    if (!name || name.length > 200) {
      setValidation("Tên địa điểm phải có từ 1 đến 200 ký tự.");
      return;
    }
    if (!address || address.length > 500) {
      setValidation("Địa chỉ phải có từ 1 đến 500 ký tự.");
      return;
    }
    if (description.length > 2000) {
      setValidation("Mô tả tối đa 2000 ký tự.");
      return;
    }
    if (!hasPoint) {
      setValidation("Nhập đủ vĩ độ từ −90 đến 90 và kinh độ từ −180 đến 180.");
      return;
    }
    setConfirmation({ name, address, type: draft.type, description: description || null, location: point });
  }

  return (
    <dialog ref={dialog} aria-labelledby="safe-location-form-title"
      className="m-auto max-h-[90dvh] w-[min(94vw,48rem)] overflow-y-auto rounded-2xl border border-border bg-card p-0 text-text backdrop:bg-black/65"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <div className="border-b border-border px-5 py-4">
        <p className="text-xs font-semibold tracking-wide text-safe">HỒ SƠ ĐỊA ĐIỂM {demo && "· TEST ONLY"}</p>
        <h2 id="safe-location-form-title" className="mt-1 text-xl font-bold">
          {location ? "Chỉnh sửa địa điểm an toàn" : "Thêm địa điểm an toàn"}
        </h2>
      </div>
      <form className="space-y-4 p-5" onSubmit={confirm}>
        <fieldset disabled={!!confirmation || busy} className="space-y-4 disabled:opacity-65">
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-safe">01 · Thông tin và phân loại</h3>
            <label className="block space-y-1 text-sm"><span>Tên địa điểm</span>
              <input required maxLength={200} className={input} value={draft.name} onChange={(e) => change("name", e.target.value)} />
            </label>
            <label className="block space-y-1 text-sm"><span>Địa chỉ</span>
              <input required maxLength={500} className={input} value={draft.address} onChange={(e) => change("address", e.target.value)} />
            </label>
            <label className="block space-y-1 text-sm"><span id="ccf121-form-type">Loại địa điểm</span>
              <select aria-labelledby="ccf121-form-type" className={input} value={draft.type} onChange={(e) => change("type", e.target.value as SafeLocationType)}>
                {Object.entries(locationTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-sm"><span>Mô tả (không bắt buộc)</span>
              <textarea className={input} rows={3} maxLength={2000} value={draft.description} onChange={(e) => change("description", e.target.value)} />
            </label>
          </div>
          <div className="space-y-3 border-t border-border pt-4">
            <h3 className="text-sm font-bold text-safe">02 · Vị trí địa lý</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm"><span>Vĩ độ</span>
                <input required className={input} type="number" min="-90" max="90" step="any" value={draft.latitude} onChange={(e) => change("latitude", e.target.value)} />
              </label>
              <label className="space-y-1 text-sm"><span>Kinh độ</span>
                <input required className={input} type="number" min="-180" max="180" step="any" value={draft.longitude} onChange={(e) => change("longitude", e.target.value)} />
              </label>
            </div>
            <button type="button" className={secondary} aria-expanded={showMap} onClick={() => setShowMap((visible) => !visible)}>
              {showMap ? "Ẩn bản đồ" : "Chọn trên bản đồ"}
            </button>
            {showMap && <div className="space-y-2">
              <p className="text-xs text-muted">Bấm lên bản đồ để điền vĩ độ và kinh độ.</p>
              <SafeLocationMap point={hasPoint ? point : null} demo={demo} onPick={confirmation || busy ? undefined : ({ latitude, longitude }) => {
                setDraft((previous) => ({ ...previous, latitude: String(latitude), longitude: String(longitude) }));
                setValidation("");
              }} />
            </div>}
          </div>
        </fieldset>
        {validation && <p role="alert" className="text-sm text-sos">{validation}</p>}
        {error && <p role="alert" className="rounded-lg border border-sos/40 bg-sos/10 p-3 text-sm text-sos">{error.message}</p>}
        {confirmation && <p role="status" className="rounded-lg border border-safe/35 bg-safe/10 p-3 text-sm">
          Xác nhận {location ? "cập nhật" : "thêm"} <strong>{confirmation.name}</strong>{demo ? " trong dữ liệu thử?" : "?"}
        </p>}
        <footer className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <button type="button" className={secondary} disabled={busy} onClick={onClose}>Hủy</button>
          {confirmation ? <>
            <button type="button" className={secondary} disabled={busy || (error !== null && !error.correctable)} onClick={() => { onReview(); setConfirmation(null); }}>Sửa lại</button>
            <button type="button" className={primary} disabled={busy || !!error} onClick={() => onSave(confirmation)}>{busy ? "Đang lưu…" : "Xác nhận lưu"}</button>
          </> : <button type="submit" className={primary}>Tiếp tục</button>}
        </footer>
      </form>
    </dialog>
  );
}
