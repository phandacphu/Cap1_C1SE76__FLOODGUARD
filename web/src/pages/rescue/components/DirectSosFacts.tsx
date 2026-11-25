import type { DirectSosRequest } from '../../../types/rescueDirect';
import { MISSING, WATER_LABEL, coordsLabel, situationsLabel, sourceLabel, timeLabel } from '../sosDirect';

export function DirectSosFacts({ item }: { item: DirectSosRequest }) {
  const fields = [
    ['Nguồn tiếp nhận', sourceLabel(item.source)],
    ...(item.smsSenderPhone ? [['Số gửi SMS', item.smsSenderPhone]] : []),
    ...(item.smsReceivedAt ? [['Thời điểm tiếp nhận SMS', timeLabel(item.smsReceivedAt)]] : []),
    ['Mã người gửi', item.residentId ?? MISSING],
    ['Thời điểm gửi', timeLabel(item.createdAt)],
    ['Tình huống', situationsLabel(item.situations)],
    ['Số người', item.numberOfPeople === null ? MISSING : String(item.numberOfPeople)],
    ['Mức nước', item.waterLevel ? WATER_LABEL[item.waterLevel] ?? MISSING : MISSING],
    ['Ghi chú', item.note ?? MISSING],
    ['Tọa độ mới nhất', coordsLabel(item.location)],
    ['Backend nhận vị trí lúc', timeLabel(item.locationReceivedAt)],
    ['Thiết bị ghi nhận vị trí lúc', timeLabel(item.locationCapturedAt)],
    ['Tọa độ ban đầu', coordsLabel(item.initialLocation)],
  ];
  return (
    <dl className="space-y-3 text-sm">
      {fields.map(([label, value]) => (
        <div key={label} className="border-b border-border pb-2">
          <dt className="text-muted">{label}</dt>
          <dd className="mt-1 break-words whitespace-pre-wrap">{value}</dd>
        </div>
      ))}
      <p className="text-xs text-muted">{item.smsSenderPhone
        ? 'Số gửi SMS là số tiếp nhận từ tin nhắn, không phải số liên hệ trong hồ sơ hoặc số tài khoản đã được xác minh.'
        : 'Chưa có thông tin liên hệ người gửi trong dữ liệu được cung cấp.'}</p>
    </dl>
  );
}
