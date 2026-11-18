import type { DirectSosDetail, DirectSosRequest } from '../../types/rescueDirect';

function serverTime(item: DirectSosRequest): number {
  return Math.max(...[item.updatedAt, item.locationReceivedAt, item.completedAt]
    .map(value => value ? Date.parse(value) : -Infinity));
}

/** Completed SOS cannot be reopened; older server snapshots must not roll back GPS. */
export function mergeSosDetail(current: DirectSosDetail | null, incoming: DirectSosDetail): DirectSosDetail {
  if (!current || current.id !== incoming.id) return incoming;
  if (current.state === 'rescued' && incoming.state !== 'rescued') return current;
  if (serverTime(incoming) < serverTime(current)) return current;
  return incoming;
}

export function applySosCompletion(current: DirectSosDetail | null, request: DirectSosRequest): DirectSosDetail {
  return mergeSosDetail(current, {
    ...request,
    statusHistory: current?.statusHistory ?? null,
    historyError: 'Đang cập nhật lịch sử sau thao tác xác nhận.',
  });
}
