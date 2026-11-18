import type { SosLocation, SosState } from '../../types/rescueDirect';

export const MISSING = 'Chưa có thông tin';
export const STATE_LABEL: Record<SosState, string> = {
  active: 'Chờ cứu hộ', rescued: 'Đã cứu', legacy_other: 'Dữ liệu lịch sử khác',
};
export const SITUATION_LABEL: Record<string, string> = {
  trapped: 'Bị mắc kẹt do ngập', evacuation: 'Cần sơ tán', injured: 'Có người bị thương',
  vulnerable: 'Người già/trẻ nhỏ cần hỗ trợ', other: 'Tình huống khác',
};
export const WATER_LABEL: Record<string, string> = {
  below_knee: 'Dưới đầu gối', waist: 'Đến thắt lưng', chest: 'Đến ngực', above_two_meters: 'Trên 2 m',
};
export function situationsLabel(values: string[] | null): string {
  return values?.length ? values.map(value => SITUATION_LABEL[value] ?? MISSING).join(', ') : MISSING;
}
export function timeLabel(value: string | null): string {
  return value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : MISSING;
}
export function coordsLabel(value: SosLocation | null): string {
  return value ? `${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}` : MISSING;
}
export function dateBoundary(value: string, end: boolean): string | undefined {
  return value ? new Date(value + (end ? 'T23:59:59.999+07:00' : 'T00:00:00.000+07:00')).toISOString() : undefined;
}
export const sosCode = (id: string) => 'SOS-' + id.slice(0, 8).toUpperCase();
