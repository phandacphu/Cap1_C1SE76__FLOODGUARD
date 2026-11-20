import type { DirectSosRequest, SosSort } from '../../../types/rescueDirect';
import { dateBoundary, situationsLabel, sosCode } from '../sosDirect';

export interface HistoryFilters {
  search: string;
  from: string;
  to: string;
  sort: SosSort;
  mine: boolean;
  userId: string | null;
}

/** Completion dates are filtered locally: API from/to mean creation dates. */
export function filterHistory(items: DirectSosRequest[], filters: HistoryFilters): DirectSosRequest[] {
  if (filters.from && filters.to && filters.from > filters.to) return [];
  const start = filters.from ? Date.parse(dateBoundary(filters.from, false)!) : null;
  const end = filters.to ? Date.parse(dateBoundary(filters.to, true)!) : null;
  const term = filters.search.trim().toLocaleLowerCase('vi');
  return items.filter(item => {
    if (item.state !== 'rescued') return false;
    if (filters.mine && (!filters.userId || item.completedBy !== filters.userId)) return false;
    const completed = item.completedAt ? Date.parse(item.completedAt) : NaN;
    if ((start !== null || end !== null) && !Number.isFinite(completed)) return false;
    if (start !== null && completed < start) return false;
    if (end !== null && completed > end) return false;
    return [item.id, sosCode(item.id), item.residentId, item.completedBy, item.note, situationsLabel(item.situations)]
      .join(' ').toLocaleLowerCase('vi').includes(term);
  }).sort((a, b) => {
    const left = a.completedAt ? Date.parse(a.completedAt) : NaN;
    const right = b.completedAt ? Date.parse(b.completedAt) : NaN;
    // Missing completion metadata must remain visible, after dated records.
    if (!Number.isFinite(left)) return Number.isFinite(right) ? 1 : a.id.localeCompare(b.id);
    if (!Number.isFinite(right)) return -1;
    const delta = filters.sort === 'oldest' ? left - right : right - left;
    return delta || a.id.localeCompare(b.id);
  });
}
