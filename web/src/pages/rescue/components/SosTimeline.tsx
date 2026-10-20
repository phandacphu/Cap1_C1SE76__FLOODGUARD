import type { RescueRequest, StatusHistoryItem } from "../../../types/rescue";
import { FLOW_STEPS, formatFullDateTime } from "../rescueStats";

interface Props {
  request: RescueRequest;
  /** Oldest first, as returned by GET /rescue-requests/:id/history. */
  history: StatusHistoryItem[];
  /** Id of the signed-in rescuer, to show "Bạn" instead of an id. */
  currentUserId: string | undefined;
}

function actorLabel(changedBy: string, request: RescueRequest, currentUserId: string | undefined) {
  if (changedBy === currentUserId) return "Bạn";
  if (changedBy === request.residentId) return "Cư dân";
  return `Nhân sự #${changedBy.slice(0, 6)}`;
}

/** CCF-110: status history as the 4-step rescue timeline (plus a cancelled step when needed). */
export function SosTimeline({ request, history, currentUserId }: Props) {
  const byStatus = new Map<string, StatusHistoryItem>();
  history.forEach((item) => byStatus.set(item.newStatus, item));

  const steps = FLOW_STEPS.map((step) => {
    const entry = byStatus.get(step.status);
    // The first step always happened: fall back to the creation time if history has no entry.
    const time = entry?.changedAt ?? (step.status === "submitted" ? request.createdAt : null);
    return { ...step, entry, time, done: Boolean(time) };
  });
  const currentIndex = steps.findIndex((s) => !s.done);
  const cancelled = byStatus.get("cancelled");
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div>
      <p className="mb-4 font-mono text-[11px] uppercase tracking-wider text-muted">
        {doneCount}/{steps.length} bước
      </p>
      <ol className="space-y-5">
        {steps.map((step, index) => {
          const isCurrent = index === currentIndex && !cancelled && request.status !== "cancelled";
          return (
            <li key={step.status} className="flex gap-3">
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                  step.done
                    ? "border-safe bg-safe/20 text-safe"
                    : isCurrent
                      ? "border-water bg-water/10 text-water"
                      : "border-border text-muted"
                }`}
              >
                {step.done ? "✓" : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className={`font-semibold ${step.done || isCurrent ? "" : "text-muted"}`}>
                    {index + 1}. {step.title}
                  </p>
                  {step.time && (
                    <time dateTime={step.time} className="font-mono text-[11px] text-muted">
                      {formatFullDateTime(step.time)}
                    </time>
                  )}
                </div>
                <p className={`mt-0.5 text-sm ${step.done ? "text-text/80" : "text-muted"}`}>
                  {step.entry?.note || (step.done ? step.fallback : isCurrent ? "Đang chờ thực hiện." : "Chưa thực hiện.")}
                </p>
                {step.entry && (
                  <p className="mt-0.5 font-mono text-[11px] text-muted">
                    Thực hiện bởi {actorLabel(step.entry.changedBy, request, currentUserId)}
                  </p>
                )}
              </div>
            </li>
          );
        })}
        {(cancelled || request.status === "cancelled") && (
          <li className="flex gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-sos bg-sos/15 text-xs font-bold text-sos"
            >
              ✕
            </span>
            <div>
              <p className="font-semibold text-sos">Yêu cầu đã bị hủy</p>
              {cancelled && (
                <time dateTime={cancelled.changedAt} className="font-mono text-[11px] text-muted">
                  {formatFullDateTime(cancelled.changedAt)}
                </time>
              )}
              {cancelled?.note && <p className="mt-0.5 text-sm text-text/80">{cancelled.note}</p>}
            </div>
          </li>
        )}
      </ol>
    </div>
  );
}
