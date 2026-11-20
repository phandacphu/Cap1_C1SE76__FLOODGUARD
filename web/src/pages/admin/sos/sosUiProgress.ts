import type { SosItem } from "./sosTypes";

export const SOS_PROGRESS_LABELS = ["Đã tiếp nhận", "Đang cứu hộ", "Hoàn thành cứu hộ"] as const;

function progressIndex(status: string | null | undefined): number | null {
  const normalized = status?.trim().toLowerCase();
  if (normalized === "received") return 0;
  if (normalized === "in_progress") return 1;
  if (normalized === "assisted" || normalized === "done") return 2;
  return null;
}

/** A display-only projection; no Backend status or historical event is rewritten. */
export function sosProgressIndex(item: SosItem): number | null {
  if (item.condition === "rescued") return 2;
  const current = progressIndex(item.status);
  if (current !== null) return current;

  const reached = (item.statusHistory ?? [])
    .map((event) => progressIndex(event.newStatus))
    .filter((index): index is number => index !== null);
  return reached.length ? Math.max(...reached) : null;
}

/** Newest first, with missing or invalid creation times last and stable ID ties. */
export function newestSosFirst(items: SosItem[]): SosItem[] {
  return [...items].sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : NaN;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : NaN;
    const aValid = Number.isFinite(aTime);
    const bValid = Number.isFinite(bTime);
    if (!aValid || !bValid) {
      if (aValid !== bValid) return aValid ? -1 : 1;
      return a.id.localeCompare(b.id);
    }
    return bTime - aTime || a.id.localeCompare(b.id);
  });
}
