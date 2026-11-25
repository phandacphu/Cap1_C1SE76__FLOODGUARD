import type { ReactNode } from "react";
import { AdminHeader } from "../../../components/layout/AdminHeader";
import { AppShell } from "../../../components/layout/AppShell";
import { ADMIN_NAV } from "../../../components/layout/navConfig";

type Tone = "water" | "safe" | "warn" | "muted";

const toneClass: Record<Tone, string> = {
  water: "text-water",
  safe: "text-safe",
  warn: "text-warn",
  muted: "text-slate-100",
};

export function AdminUiPreview({
  title,
  subtitle,
  children,
  action,
  preview = true,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  action?: ReactNode;
  preview?: boolean;
}) {
  return (
    <AppShell
      nav={ADMIN_NAV}
      brandSub="ADMIN COMMAND"
      roleLabel="QUẢN TRỊ VIÊN"
      accent="water"
      header={<AdminHeader title={title} />}
    >
      <div className="mx-auto max-w-7xl space-y-6 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            {preview && <div className="inline-flex items-center gap-2 rounded-full border border-water/25 bg-water/10 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-water">
              <span className="h-1.5 w-1.5 rounded-full bg-water" /> Giao diện mẫu
            </div>}
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-400">{subtitle}</p>
          </div>
          {action}
        </div>
        {children}
      </div>
    </AppShell>
  );
}

export function PreviewStat({
  title,
  value,
  detail,
  tone = "water",
}: {
  title: string;
  value: string | number;
  detail: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm shadow-black/10">
      <p className="text-sm font-medium text-slate-300">{title}</p>
      <p className={`mt-3 text-3xl font-bold tabular-nums ${toneClass[tone]}`}>{value}</p>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

export function PreviewPanel({
  title,
  children,
  extra,
  className = "",
}: {
  title: string;
  children: ReactNode;
  extra?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-border bg-card shadow-sm shadow-black/10 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

export function PreviewBadge({
  children,
  tone = "water",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  const color: Record<Tone, string> = {
    water: "border-water/25 bg-water/10 text-water",
    safe: "border-safe/25 bg-safe/10 text-safe",
    warn: "border-warn/25 bg-warn/10 text-warn",
    muted: "border-slate-500/25 bg-slate-500/10 text-slate-300",
  };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${color[tone]}`}>{children}</span>;
}

export const previewInputClass =
  "w-full rounded-xl border border-border bg-bg/80 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-water/60 focus:ring-2 focus:ring-water/10";

export const previewSecondaryButton =
  "rounded-xl border border-slate-600/70 bg-slate-800/70 px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:border-water/40 hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-water";

export const previewPrimaryButton =
  "rounded-xl bg-water px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-water";
