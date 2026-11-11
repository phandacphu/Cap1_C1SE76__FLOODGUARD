import { useState } from "react";
import { PolygonDrawMap } from "./PolygonDrawMap";
import type { HistoricalFloodArea } from "../historicalFloodAreaService";
import {
  AREA_TYPES,
  AREA_TYPE_LABEL,
  isAreaType,
  validateArea,
  type AreaType,
  type FloodAreaInput,
  type FloodAreaItem,
  type GeoPoint,
} from "../floodAreaTypes";

interface Props {
  /** null = create a new area. */
  area: FloodAreaItem | HistoricalFloodArea | null;
  busy: boolean;
  serverError: string | null;
  onSubmit: (input: FloodAreaInput) => void;
  onClose: () => void;
  onVerifyTimeout: () => void;
  timeoutUncertain: boolean;
  /** Điểm ngập lịch sử hiển thị tham khảo trên bản đồ vẽ. */
  referencePoints?: GeoPoint[];
  referencePoint?: GeoPoint;
}

const FIELD =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-water focus:outline-none disabled:opacity-60";

const LABEL = "font-mono text-[11px] uppercase tracking-wider text-muted";

/** Create / edit form. The polygon is drawn on the map (at least 3 points). */
export function AreaFormModal({
  area,
  busy,
  serverError,
  onSubmit,
  onClose,
  onVerifyTimeout,
  timeoutUncertain,
  referencePoints,
  referencePoint,
}: Props) {
  const [name, setName] = useState(area?.name ?? "");
  const [description, setDescription] = useState(area?.description ?? "");
  const [areaType, setAreaType] = useState<AreaType | "">(area?.areaType ?? "");
  const [source, setSource] = useState(area?.source ?? "");
  const [points, setPoints] = useState<GeoPoint[]>(
    area?.geometry?.points.map((p) => ({ ...p })) ?? [],
  );
  const [errors, setErrors] = useState<string[]>([]);
  const isHistorical = area !== null && "referencePoint" in area;

  const submit = () => {
    if (busy || timeoutUncertain) return;
    if (!isAreaType(areaType)) {
      setErrors(["Vui lòng chọn Vùng ngập hoặc Vùng trũng trước khi lưu."]);
      return;
    }
    const input: FloodAreaInput = {
      name: name.trim(), description: description.trim(), areaType,
      source: source.trim(), geometry: { type: "polygon", points },
    };
    const found = validateArea(input);
    setErrors(found);
    if (found.length === 0) onSubmit(input);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Đóng"
        disabled={busy}
        onClick={onClose}
        className="absolute inset-0 bg-black/70"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={area ? "Sửa vùng" : "Thêm vùng"}
        className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl"
      >
        <h2 className="text-lg font-bold">{area ? "Sửa vùng" : "Thêm vùng"}</h2>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className={LABEL}>Tên vùng</span>
            <input
              aria-label="Tên vùng"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              className={`${FIELD} mt-1`}
            />
          </label>
          <label className="sm:col-span-2">
            <span className={LABEL}>Mô tả</span>
            <textarea
              aria-label="Mô tả"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
              className={`${FIELD} mt-1 resize-none`}
            />
          </label>
          {isHistorical && (
            <label className="sm:col-span-2">
              <span className={LABEL}>Loại vùng</span>
              <select
                aria-label="Loại vùng lịch sử"
                value="historical"
                disabled
                className={`${FIELD} mt-1`}
              >
                <option value="historical">Vùng ngập lịch sử</option>
              </select>
              <span className="mt-1 block text-xs text-muted">Nhóm lịch sử không đổi khi lưu. Đây không phải cảnh báo ngập hiện tại.</span>
            </label>
          )}
          <label className="sm:col-span-2">
            <span className={LABEL}>{isHistorical ? "Phân loại đa giác (theo API)" : "Loại vùng"}</span>
            <select
              aria-label={isHistorical ? "Phân loại đa giác" : "Loại vùng"}
              value={areaType}
              onChange={(e) => setAreaType(isAreaType(e.target.value) ? e.target.value : "")}
              disabled={busy}
              className={`${FIELD} mt-1`}
            >
              <option value="">Chọn loại vùng</option>
              {AREA_TYPES.map((type) => (
                <option key={type} value={type}>{AREA_TYPE_LABEL[type]}</option>
              ))}
            </select>
            {area && area.areaType === null && (
              <span className="mt-1 block text-xs text-warn">{isHistorical ? "Để lưu đa giác lịch sử, API yêu cầu chọn Vùng ngập hoặc Vùng trũng." : "Vùng cũ chưa phân loại. Chọn loại đúng trước khi lưu."}</span>
            )}
          </label>
          <label className="sm:col-span-2">
            <span className={LABEL}>Nguồn dữ liệu</span>
            <input
              aria-label="Nguồn dữ liệu"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              disabled={busy}
              placeholder="Ví dụ: Trung tâm khí tượng thủy văn"
              className={`${FIELD} mt-1`}
            />
          </label>
        </div>

        <fieldset className="mt-5" disabled={busy}>
          <legend className={LABEL}>Đa giác (vẽ trên bản đồ, tối thiểu 3 điểm)</legend>
          <div className="mt-2">
            <PolygonDrawMap
              points={points}
              onChange={setPoints}
              referencePoints={referencePoints}
              referencePoint={referencePoint}
              disabled={busy}
            />
          </div>
        </fieldset>

        {errors.length > 0 && (
          <ul
            role="alert"
            className="mt-4 list-disc space-y-1 rounded-lg border border-sos/50 bg-sos/10 p-3 pl-6 text-xs text-red-200"
          >
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {serverError && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-sos/50 bg-sos/10 p-3 text-xs text-red-200"
          >
            <strong>Lưu thất bại:</strong> {serverError}
          </p>
        )}

        {timeoutUncertain && !busy && (
          <div role="status" className="mt-3 space-y-2 rounded-lg border border-warn/50 p-3 text-xs text-warn">
            <p>Yêu cầu lưu đã quá hạn: máy chủ có thể đã xử lý. Đọc lại danh sách để kiểm tra trước khi quyết định làm gì tiếp theo; không tự gửi lại POST/PATCH.</p>
            <button type="button" onClick={onVerifyTimeout} className="rounded border border-warn/50 px-3 py-1.5 font-semibold hover:bg-warn/10">
              Đọc lại danh sách vùng (không gửi lại)
            </button>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-bg/60 disabled:opacity-60"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={busy || timeoutUncertain}
            onClick={submit}
            className="rounded-lg bg-water px-4 py-2 text-sm font-semibold text-bg hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? "Đang lưu..." : timeoutUncertain ? "Hãy kiểm tra trước khi lưu lại" : area ? "Lưu thay đổi" : "Tạo vùng"}
          </button>
        </div>
      </div>
    </div>
  );
}
