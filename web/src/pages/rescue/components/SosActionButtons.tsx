import type { RescueRequest } from "../../../types/rescue";

interface Props {
  item: RescueRequest;
  /** True when this rescuer may move the request forward (assigned to them or unknown). */
  canProgress: boolean;
  busy: boolean;
  onAccept: (id: string) => void;
  onAdvance: (id: string, next: "in_progress" | "assisted") => void;
}

const BASE =
  "whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-60";

/** The one action that applies to a request right now (accept → start → finish). */
export function SosActionButtons({ item, canProgress, busy, onAccept, onAdvance }: Props) {
  if (item.status === "submitted") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onAccept(item.id)}
        className={`${BASE} bg-safe text-bg hover:brightness-110`}
      >
        {busy ? "Đang nhận..." : "Tiếp nhận"}
      </button>
    );
  }
  if (item.status === "received" && canProgress) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onAdvance(item.id, "in_progress")}
        className={`${BASE} bg-warn text-bg hover:brightness-110`}
      >
        {busy ? "Đang cập nhật..." : "Bắt đầu cứu hộ"}
      </button>
    );
  }
  if (item.status === "in_progress" && canProgress) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onAdvance(item.id, "assisted")}
        className={`${BASE} bg-water text-bg hover:brightness-110`}
      >
        {busy ? "Đang cập nhật..." : "Hoàn tất"}
      </button>
    );
  }
  if (item.status === "assisted") {
    return <span className="font-mono text-xs text-safe">✓ Đã hoàn tất</span>;
  }
  if (item.status === "cancelled") {
    return <span className="font-mono text-xs text-muted">Đã hủy</span>;
  }
  return <span className="font-mono text-xs text-muted">Đội khác phụ trách</span>;
}
