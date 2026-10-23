import type { UrgencyLevel } from "../../../types/rescue";
import { URGENCY_LABEL } from "../rescueStats";

const STYLE: Record<UrgencyLevel, string> = {
  critical: "border-sos/50 bg-sos/15 text-sos",
  high: "border-orange-400/40 bg-orange-400/10 text-orange-300",
  medium: "border-water/40 bg-water/10 text-water",
  low: "border-safe/40 bg-safe/10 text-safe",
};

interface Props {
  urgency: UrgencyLevel;
}

/** Urgency pill (Khẩn cấp / Cao / Trung bình / Thấp). */
export function SosPriorityBadge({ urgency }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-semibold ${STYLE[urgency]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {URGENCY_LABEL[urgency]}
    </span>
  );
}
