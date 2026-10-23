import { Icon } from "../../../components/ui/Icon";
import type { FloodAlert } from "../../../types/admin";
import { SEVERITY_LABEL, formatDateTime } from "../../admin/adminStats";

const TONE: Record<FloodAlert["severity"], string> = {
  critical: "border-sos/50 bg-gradient-to-r from-sos/25 to-sos/5 text-sos",
  high: "border-orange-400/50 bg-gradient-to-r from-orange-400/20 to-orange-400/5 text-orange-300",
  medium: "border-warn/50 bg-gradient-to-r from-warn/15 to-warn/5 text-warn",
  low: "border-water/40 bg-gradient-to-r from-water/15 to-water/5 text-water",
};

interface Props {
  /** The most severe active alert, or null when none is in force. */
  alert: FloodAlert | null;
  /** Active alerts besides the one shown. */
  otherCount: number;
  loading: boolean;
}

/** Top banner of the rescue dashboard: the most severe flood alert in force. */
export function FloodAlertBanner({ alert, otherCount, loading }: Props) {
  if (!alert) {
    return (
      <section className="flex items-center gap-3 rounded-2xl border border-border bg-card/70 p-4">
        <span className="rounded-xl bg-safe/15 p-3 text-safe">
          <Icon name="shield" className="h-6 w-6" />
        </span>
        <div>
          <p className="font-semibold">
            {loading ? "Đang tải cảnh báo lũ..." : "Hiện không có cảnh báo lũ đang hiệu lực"}
          </p>
          <p className="font-mono text-[11px] text-muted">
            Cảnh báo mới sẽ xuất hiện tại đây ngay khi quản trị viên ban hành.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={`flex flex-wrap items-start gap-4 rounded-2xl border p-4 ${TONE[alert.severity]}`}>
      <span className="rounded-xl bg-current/15 p-3">
        <Icon name="alert" className="h-7 w-7" />
      </span>
      <div className="min-w-0 flex-1 text-text">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <span className="rounded bg-current/20 px-2 py-0.5 font-semibold uppercase text-current">
            Cảnh báo {SEVERITY_LABEL[alert.severity]}
          </span>
          {otherCount > 0 && <span className="text-muted">+{otherCount} cảnh báo khác đang hiệu lực</span>}
        </div>
        <h2 className="mt-1 text-lg font-bold leading-snug sm:text-xl">{alert.title}</h2>
        <p className="mt-1 line-clamp-2 text-sm text-text/80">{alert.content}</p>
        <p className="mt-2 font-mono text-[11px] text-muted">
          Hiệu lực: {formatDateTime(alert.startAt)} → {formatDateTime(alert.endAt)}
        </p>
      </div>
    </section>
  );
}
