import type { SosStatus } from "../../../types/rescue";
import { STATUS_LABEL } from "../rescueStats";

const STYLE: Record<SosStatus, string> = {
  submitted: "border-sos/40 bg-sos/10 text-red-300",
  received: "border-water/40 bg-water/10 text-water",
  in_progress: "border-warn/40 bg-warn/10 text-warn",
  assisted: "border-safe/40 bg-safe/10 text-safe",
  cancelled: "border-border bg-card text-muted",
};

interface Props {
  status: SosStatus;
}

/** Request status pill. */
export function SosStatusBadge({ status }: Props) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-medium ${STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
