import type { ReactNode } from "react";
import { Icon, type IconName } from "../../../components/ui/Icon";

/** Small chip marking data that is simulated (no API yet or API unavailable). */
export function MockTag({ className = "" }: { className?: string }) {
  return (
    <span
      className={`rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-warn ${className}`}
    >
      MÔ PHỎNG
    </span>
  );
}

interface PanelProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  /** Right-aligned chip (e.g. "THEO GIỜ"). */
  tag?: ReactNode;
  mock?: boolean;
  className?: string;
  children: ReactNode;
}

export function Panel({ title, subtitle, icon, tag, mock, className = "", children }: PanelProps) {
  return (
    <section
      className={`flex flex-col rounded-2xl border border-border bg-card/80 p-5 ${className}`}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <span className="mt-0.5 text-water">
              <Icon name={icon} className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-base font-bold uppercase leading-tight tracking-wide">{title}</h2>
            {subtitle && (
              <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {mock && <MockTag />}
          {tag}
        </div>
      </header>
      {children}
    </section>
  );
}
