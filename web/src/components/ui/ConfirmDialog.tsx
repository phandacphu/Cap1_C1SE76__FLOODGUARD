import { useEffect, useId, type ReactNode } from "react";

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** "danger" paints the confirm button red (destructive actions). */
  tone?: "default" | "danger";
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modal that must be confirmed before a change is sent to the server. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  tone = "default",
  busy = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Đóng"
        disabled={busy}
        onClick={onCancel}
        className="absolute inset-0 bg-black/70"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-bold">
          {title}
        </h2>
        <div className="mt-3 text-sm text-text/85">{children}</div>
        {error && (
          <p role="alert" className="mt-3 rounded-lg border border-sos/50 bg-sos/10 p-2 text-sm text-red-200">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-bg/60 disabled:opacity-60"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-bg transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60 ${
              tone === "danger" ? "bg-sos text-white" : "bg-water"
            }`}
          >
            {busy ? "Đang xử lý..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
