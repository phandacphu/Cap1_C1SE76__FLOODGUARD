import { useEffect, useState } from 'react';
import { apiGet } from '../../api/http';
import type { FloodAlert } from '../../types/admin';
import { SEVERITY_WEIGHT } from '../admin/adminStats';
import { FloodAlertBanner } from './components/FloodAlertBanner';
import { Link } from 'react-router-dom';
import { RescueLayout } from '../../components/layout/RescueLayout';
import { KpiCard } from '../admin/components/KpiCard';
import { Panel } from '../admin/components/Panel';
import { DirectSosMap } from './components/DirectSosMap';
import { DirectSosFeedback } from './components/DirectSosFeedback';
import { useRescueRequests } from './useRescue';
import { sosCode, situationsLabel, timeLabel } from './sosDirect';

export function RescueDashboard() {
  const [alerts, setAlerts] = useState<FloodAlert[] | null>(null);
  const [alertError, setAlertError] = useState(false);
  useEffect(() => {
    let ignore = false;
    void apiGet<{ floodAlerts: FloodAlert[] }>('/flood-alerts/active').then(data => {
      if (!Array.isArray(data.floodAlerts)) throw new Error('Dữ liệu cảnh báo sai cấu trúc.');
      if (!ignore) setAlerts(data.floodAlerts);
    }).catch(() => { if (!ignore) setAlertError(true); });
    return () => { ignore = true; };
  }, []);
  const orderedAlerts = [...(alerts ?? [])].sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]);
  const result = useRescueRequests({ state: 'active', sort: 'newest' });
  return (
    <RescueLayout loading={result.loading} onRefresh={result.refresh} updatedAt={result.updatedAt}
      waitingCount={result.requests?.length}>
      <div className="mx-auto max-w-7xl space-y-5">
        <h1 className="text-2xl font-bold">Tổng quan cứu hộ</h1>
        {alertError ? <p role="status" className="text-amber-300">Chưa tải được cảnh báo lũ.</p> :
          <FloodAlertBanner alert={orderedAlerts[0] ?? null} otherCount={Math.max(orderedAlerts.length - 1, 0)} loading={alerts === null} />}
        <DirectSosFeedback {...result} stale={Boolean(result.requests)} retry={result.refresh} />
        <div className="grid gap-4 sm:grid-cols-2">
          <KpiCard label="Chờ cứu hộ" icon="sos" tone="sos"
            value={result.requests ? String(result.requests.length) : 'Chưa tải được số SOS'}
            sub={result.error ? 'Dữ liệu cũ, chưa xác nhận lại' : 'Số yêu cầu theo nhóm Chờ cứu hộ đã tải'} />
          <Panel title="Luồng cứu hộ" icon="shield">
            <p className="text-sm text-muted">Mở SOS để xem vị trí mới nhất và chỉ đường. Sau khi hoàn tất cứu hộ, xác nhận đã cứu tại trang chi tiết.</p>
            <Link className="mt-3 inline-block text-water underline" to="/rescue/sos">Mở Yêu cầu SOS và lịch sử đã cứu</Link>
          </Panel>
        </div>
        <Panel title="Bản đồ SOS chờ cứu hộ" icon="map">
          <DirectSosMap items={result.requests} />
          {!result.requests && <p className="mt-2 text-sm text-muted">Chưa tải được danh sách SOS.</p>}
          {result.requests?.length === 0 && <p className="mt-2 text-sm text-muted">Không có yêu cầu đang chờ cứu hộ.</p>}
        </Panel>
        <Panel title="Yêu cầu chờ cứu hộ mới nhất" icon="sos">
          <ul className="space-y-3">
            {result.requests?.slice(0, 8).map(item => (
              <li key={item.id} className="rounded border border-border p-3 text-sm">
                <Link className="font-mono text-water underline" to={`/rescue/sos/${encodeURIComponent(item.id)}`}>{sosCode(item.id)}</Link>
                <p>{situationsLabel(item.situations)}</p>
                <p className="text-xs text-muted">Gửi lúc {timeLabel(item.createdAt)} · Backend nhận GPS {timeLabel(item.locationReceivedAt)}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </RescueLayout>
  );
}
export default RescueDashboard;
