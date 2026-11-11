export function formatAreaAlertCount(loading: boolean, count: number | null): string {
  if (loading) return 'Đang tải cảnh báo';
  if (count === null) return 'Cảnh báo: chưa xác nhận';
  return `${count} cảnh báo hiệu lực tại lần tải`;
}
