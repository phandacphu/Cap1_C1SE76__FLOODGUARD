import type { ReactNode } from "react";
import { Icon, type IconName } from "../../../components/ui/Icon";
import { MockTag } from "./Panel";

type Tone = "text" | "sos" | "safe" | "water" | "warn";

const TONE_TEXT: Record<Tone, string> = {
  text: "text-text",
  sos: "text-sos",
  safe: "text-safe",
  water: "text-water",
  warn: "text-warn",
};

const TONE_BUBBLE: Record<Tone, string> = {
  text: "bg-text/10 text-text",
  sos: "bg-sos/15 text-sos",
  safe: "bg-safe/15 text-safe",
  water: "bg-water/15 text-water",
  warn: "bg-warn/15 text-warn",
};

interface KpiCardProps {
  label: string;
  icon: IconName;
  value: string;
  tone: Tone;
  /** Small line under the value. */
  sub?: ReactNode;
  footerLabel?: string;
  footerValue?: string;
  mock?: boolean;
}

export function KpiCard({
  label,
  icon,
  value,
  tone,
  sub,
  footerLabel,
  footerValue,
  mock,
}: KpiCardProps) {
  return (
    <article className="flex flex-col justify-between rounded-2xl border border-border bg-card/80 p-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm leading-snug text-text/90">{label}</p>
          <span className={`rounded-lg p-2 ${TONE_BUBBLE[tone]}`}>
            <Icon name={icon} className="h-4 w-4" />
          </span>
        </div>
        <p className={`mt-3 font-mono text-3xl font-semibold leading-none ${TONE_TEXT[tone]}`}>
          {value}
        </p>
        <div className="mt-2 flex min-h-5 flex-wrap items-center gap-2 font-mono text-[11px] text-muted">
          {sub}
          {mock && <MockTag />}
        </div>
      </div>
      {footerLabel && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2 font-mono text-[10px] uppercase tracking-wider text-muted">
          <span>{footerLabel}</span>
          <span className="text-right text-xs normal-case tracking-normal text-text">
            {footerValue}
          </span>
        </div>
      )}
    </article>
  );
}
