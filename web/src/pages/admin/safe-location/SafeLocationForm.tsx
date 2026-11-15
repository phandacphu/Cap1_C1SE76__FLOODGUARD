import { useEffect, useRef, useState, type FormEvent } from "react";
import { SafeLocationMap } from "./SafeLocationMap";
import {
  locationTypeLabels, validCoordinates,
  type SafeLocation, type SafeLocationFields,
} from "./safeLocationTypes";

import { validateSafeLocationDraft, type SafeLocationDraft, type SafeLocationDraftField, type SafeLocationErrors } from "./safeLocationValidation";

const input = "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-safe focus:outline-none";
const secondary = "rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-bg disabled:opacity-50";
const primary = "rounded-lg bg-safe px-4 py-2 text-sm font-bold text-bg hover:bg-safe/85 disabled:opacity-50";

interface Props {
  location: SafeLocation | null;
  demo: boolean;
  busy: boolean;
  error: { message: string; uncertain: boolean } | null;
  onClose: () => void;
  onSave: (fields: SafeLocationFields) => void;
}

export function SafeLocationForm({ location, demo, busy, error, onClose, onSave }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<SafeLocationDraft>(() => ({
    name: location?.name ?? "",
    address: location?.address ?? "",
    type: location?.type ?? "",
    description: location?.description ?? "",
    latitude: location?.location ? String(location.location.latitude) : "",
    longitude: location?.location ? String(location.location.longitude) : "",
  }));
  const [errors, setErrors] = useState<SafeLocationErrors>({});

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  function change(key: SafeLocationDraftField, value: string) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  }

  const lat = Number(draft.latitude);
  const lng = Number(draft.longitude);
  const point = draft.latitude.trim() && draft.longitude.trim() &&
    validCoordinates({ latitude: lat, longitude: lng }) ? { latitude: lat, longitude: lng } : null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || error?.uncertain) return;
    const result = validateSafeLocationDraft(draft);
    setErrors(result.errors);
    if (result.fields) onSave(result.fields);
  }

  const fieldError = (key: SafeLocationDraftField) => errors[key]
    ? <p id={`safe-${key}-error`} role="alert" className="mt-1 text-xs text-sos">{errors[key]}</p> : null;

  return (
    <dialog ref={dialog} aria-labelledby="safe-location-form-title"
      className="m-auto max-h-[92dvh] w-[min(94vw,49rem)] overflow-y-auto rounded-2xl border border-border bg-card p-0 text-text backdrop:bg-black/65"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <div className="border-b border-border px-5 py-4">
        {demo && <p className="text-xs font-semibold tracking-wide text-warn">DỮ LIỆU MẪU · KHÔNG ĐỒNG BỘ SANG RESIDENT/RESCUE</p>}
        <h2 id="safe-location-form-title" className="mt-1 text-xl font-bold">
          {location ? "Sửa điểm an toàn" : "Thêm điểm an toàn"}
        </h2>
        {location && <p className="mt-1 break-all font-mono text-xs text-muted">ID nội bộ: {location.id} (không thay đổi)</p>}
      </div>
      <form noValidate onSubmit={submit} className="space-y-4 p-5">
        <fieldset disabled={busy || !!error?.uncertain} className="space-y-4 disabled:opacity-65">
          <label className="block text-sm"><span>Tên địa điểm *</span>
            <input className={input} value={draft.name} aria-invalid={!!errors.name} aria-describedby={errors.name ? "safe-name-error" : undefined}
              onChange={(event) => change("name", event.target.value)} />
            {fieldError("name")}
          </label>
          <label className="block text-sm"><span>Địa chỉ *</span>
            <input className={input} value={draft.address} aria-invalid={!!errors.address} aria-describedby={errors.address ? "safe-address-error" : undefined}
              onChange={(event) => change("address", event.target.value)} />
            {fieldError("address")}
          </label>
          <label className="block text-sm"><span>Loại địa điểm *</span>
            <select className={input} value={draft.type} aria-invalid={!!errors.type} aria-describedby={errors.type ? "safe-type-error" : undefined}
              onChange={(event) => change("type", event.target.value)}>
              <option value="">Chọn loại địa điểm</option>
              {Object.entries(locationTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            {fieldError("type")}
          </label>
          <label className="block text-sm"><span>Mô tả (không bắt buộc)</span>
            <textarea className={input} rows={3} value={draft.description} aria-invalid={!!errors.description}
              aria-describedby={errors.description ? "safe-description-error" : undefined}
              onChange={(event) => change("description", event.target.value)} />
            {fieldError("description")}
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm"><span>Vĩ độ *</span>
              <input className={input} inputMode="decimal" value={draft.latitude} aria-invalid={!!errors.latitude}
                aria-describedby={errors.latitude ? "safe-latitude-error" : undefined}
                onChange={(event) => change("latitude", event.target.value)} />
              {fieldError("latitude")}
            </label>
            <label className="block text-sm"><span>Kinh độ *</span>
              <input className={input} inputMode="decimal" value={draft.longitude} aria-invalid={!!errors.longitude}
                aria-describedby={errors.longitude ? "safe-longitude-error" : undefined}
                onChange={(event) => change("longitude", event.target.value)} />
              {fieldError("longitude")}
            </label>
          </div>
          <section aria-label="Bản đồ xem trước vị trí" className="space-y-2">
            <h3 className="font-semibold">Bản đồ xem trước</h3>
            <p className="text-xs text-muted">Nhập tọa độ hoặc bấm bản đồ để chọn. Khi chưa có tọa độ hợp lệ sẽ không có ghim; vị trí nhìn ban đầu không được tự điền vào form.</p>
            <SafeLocationMap point={point} name={draft.name} demo={demo}
              onPick={({ latitude, longitude }) => {
                change("latitude", String(latitude));
                change("longitude", String(longitude));
              }} />
          </section>
        </fieldset>
        {error && <p role="alert" className="rounded-lg border border-sos/40 bg-sos/10 p-3 text-sm text-sos">
          {error.message}
          {error.uncertain && <span className="mt-1 block">Chưa xác nhận kết quả ghi. Đóng form rồi làm mới để đối chiếu trước khi thực hiện thao tác khác.</span>}
        </p>}
        <footer className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <button type="button" className={secondary} disabled={busy} onClick={onClose}>Hủy</button>
          <button type="submit" className={primary} disabled={busy || !!error?.uncertain}>
            {busy ? "Đang lưu…" : location ? "Lưu thay đổi" : "Thêm địa điểm"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
