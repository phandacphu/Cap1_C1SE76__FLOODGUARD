import { useState } from "react";
import type { RescueRequest } from "../../../types/rescue";

interface Props {
  request: RescueRequest;
  /** True when this rescuer may move the request forward (assigned to them or unknown). */
  canProgress: boolean;
  busy: boolean;
  onAccept: () => Promise<boolean>;
  onAdvance: (next: "in_progress" | "assisted", note: string) => Promise<boolean>;
}

const BTN =
  "w-full rounded-xl px-4 py-3 text-sm font-bold transition disabled:cursor-wait disabled:opacity-60";

/** CCF-108/109 actions for one request: accept → start rescue → finish, with an optional note. */
export function SosCommandPanel({ request, canProgress, busy, onAccept, onAdvance }: Props) {
  const [note, setNote] = useState("");
  const { status } = request;
  const canWriteNote = canProgress && (status === "received" || status === "in_progress");

  const advance = async (next: "in_progress" | "assisted") => {
    const ok = await onAdvance(next, note);
    if (ok) setNote("");
  };

  return (
    <div className="space-y-3">
      {status === "submitted" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onAccept()}
          className={`${BTN} bg-safe text-bg hover:brightness-110`}
        >
          {busy ? "Đang tiếp nhận..." : "NHẬN XỬ LÝ TRỰC TIẾP"}
        </button>
      )}

      {canWriteNote && (
        <label className="block">
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
            Ghi chú diễn biến (không bắt buộc)
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder="Ví dụ: Đã tiếp cận, đang đưa 3 người lên xuồng..."
            className="mt-1 w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm placeholder:text-muted/70 focus:border-safe focus:outline-none"
          />
        </label>
      )}

      {status === "received" && canProgress && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void advance("in_progress")}
          className={`${BTN} bg-warn text-bg hover:brightness-110`}
        >
          {busy ? "Đang cập nhật..." : "BẮT ĐẦU CỨU HỘ"}
        </button>
      )}

      {status === "in_progress" && canProgress && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void advance("assisted")}
          className={`${BTN} bg-water text-bg hover:brightness-110`}
        >
          {busy ? "Đang cập nhật..." : "HOÀN TẤT HỖ TRỢ"}
        </button>
      )}

      {status === "assisted" && (
        <p className="rounded-xl border border-safe/40 bg-safe/10 p-3 text-center text-sm font-semibold text-safe">
          ✓ Ca cứu hộ đã hoàn tất
        </p>
      )}
      {status === "cancelled" && (
        <p className="rounded-xl border border-border p-3 text-center text-sm text-muted">
          Yêu cầu đã bị hủy, không thể thao tác.
        </p>
      )}
      {(status === "received" || status === "in_progress") && !canProgress && (
        <p className="rounded-xl border border-border p-3 text-center text-sm text-muted">
          Ca này do đội khác phụ trách. Bạn chỉ có quyền xem.
        </p>
      )}

      <p className="text-center font-mono text-[10px] text-muted">
        Mọi thao tác đều được ghi vào lịch sử trạng thái của ca.
      </p>
    </div>
  );
}
