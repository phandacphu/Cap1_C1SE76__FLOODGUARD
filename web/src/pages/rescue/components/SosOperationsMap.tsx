import { SosHistoricalLayers } from './SosHistoricalLayers';
import { useCallback, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Polygon, Popup, TileLayer, useMap } from 'react-leaflet';
import { Link } from 'react-router-dom';
import { latLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../../map/floodMap.css';
import { floodAreaService } from '../../../api/floodAreaService';
import type { FloodArea, FloodAlert } from '../../../types/floodArea';
import type { DirectSosRequest } from '../../../types/rescueDirect';
import { useSosResource } from '../useRescue';
import { STATE_LABEL, WATER_LABEL, MISSING, sosCode, timeLabel, situationsLabel } from '../sosDirect';
import { ALERT_COLORS, ALERT_LABELS, SOS_MAP_COLORS, areaAlert, directionsUrl, hasMapLocation } from '../sosMapData';

interface Context {
  checkedAt: number;
  areas: FloodArea[] | null;
  alerts: FloodAlert[] | null;
  areasError: string | null;
  alertsError: string | null;
  areasAt: number | null;
  alertsAt: number | null;
}
function mergeContext(previous: Context | null, next: Context): Context {
  return { ...next, areas: next.areas ?? previous?.areas ?? null,
    alerts: next.alerts ?? previous?.alerts ?? null,
    areasAt: next.areasAt ?? previous?.areasAt ?? null,
    alertsAt: next.alertsAt ?? previous?.alertsAt ?? null };
}

function Controls({ items }: { items: DirectSosRequest[] }) {
  const map = useMap();
  return <button type="button" className="absolute bottom-8 left-3 z-[1000] rounded bg-slate-950 px-3 py-2 text-white"
    onClick={() => {
      const points = items.filter(hasMapLocation).map(item => [item.location!.latitude, item.location!.longitude] as [number, number]);
      map.invalidateSize();
      if (points.length) map.fitBounds(latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
    }} disabled={!items.some(hasMapLocation)}>Xem toàn bộ SOS</button>;
}

export function SosOperationsMap({ items }: { items: DirectSosRequest[] | null }) {
  const [areaFilter, setAreaFilter] = useState('all');
  const [onlyAlerted, setOnlyAlerted] = useState(false);
  const [showAreas, setShowAreas] = useState(true);
  const [tileError, setTileError] = useState(false);
  const [round, setRound] = useState(0);
  const forceRef = useRef(false);
  const load = useCallback(async (): Promise<Context> => {
    const force = forceRef.current;
    forceRef.current = false;
    const [areas, alerts] = await Promise.allSettled([
      floodAreaService.getFloodAreas(force), floodAreaService.getActiveAlerts(force),
    ]);
    return {
      checkedAt: Date.now(),
      areas: areas.status === 'fulfilled' ? areas.value : null,
      alerts: alerts.status === 'fulfilled' ? alerts.value : null,
      areasAt: areas.status === 'fulfilled' ? Date.now() : null,
      alertsAt: alerts.status === 'fulfilled' ? Date.now() : null,
      areasError: areas.status === 'rejected' ? 'Chưa cập nhật được vùng ngập/vùng trũng.' : null,
      alertsError: alerts.status === 'rejected' ? 'Chưa cập nhật được cảnh báo khu vực.' : null,
    };
  }, []);
  const context = useSosResource('sos-map-context', load, mergeContext);
  const data = context.data;
  const located = (items ?? []).filter(hasMapLocation);
  const key = (import.meta.env.VITE_MAPTILER_KEY ?? '').trim();
  return <section className="space-y-3 rounded-xl border border-border bg-card p-4" aria-label="Bản đồ yêu cầu SOS">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-bold">Bản đồ cứu hộ</h2>
      <label className="text-sm"><input type="checkbox" checked={showAreas} onChange={event => setShowAreas(event.target.checked)} /> Vùng ngập / vùng trũng và cảnh báo</label>
      <button type="button" disabled={context.loading} onClick={() => { forceRef.current = true; context.refresh(); }} className="rounded border border-border px-3 py-2 text-sm">Tải lại thông tin khu vực</button>
    </div>
    <div className="flex flex-wrap gap-3 text-sm">
      <label>Loại vùng <select className="rounded border border-border bg-bg p-2" value={areaFilter} onChange={event => setAreaFilter(event.target.value)}>
        <option value="all">Tất cả</option><option value="flood">Vùng ngập</option><option value="low_lying">Vùng trũng</option><option value="unknown">Chưa phân loại</option>
      </select></label>
      <label><input type="checkbox" checked={onlyAlerted} onChange={event => setOnlyAlerted(event.target.checked)} /> Chỉ vùng có cảnh báo hiệu lực</label>
    </div>
    {onlyAlerted && (!data?.alerts || data.alertsError || context.loading) && <p role="status" className="text-amber-300">Đang tải hoặc chưa cập nhật được cảnh báo; bộ lọc chỉ tham khảo dữ liệu đã tải nếu có.</p>}
    <p className="text-sm">🔴 Chờ cứu hộ (cần cứu/chưa cứu) · 🟢 Đã cứu · ⚪ Trạng thái cũ/khác</p>
    <p className="text-xs text-muted">Vùng ngập: vàng; vùng trũng: đỏ. Viền vùng thể hiện mức cảnh báo hiệu lực: thấp (xanh), vừa (vàng), cao (cam), khẩn cấp (đỏ). Không có cảnh báo không đồng nghĩa an toàn.</p>
    {context.loading && <p role="status" className="text-sm">Đang tải thông tin khu vực…</p>}
    {(data?.areasError || data?.alertsError) && <p role="alert" className="text-sm text-amber-300">{data.areasError} {data.alertsError} Dữ liệu giữ lại, nếu có, có thể đã cũ.</p>}
    {!key && <p role="status" className="text-amber-300">Chưa cấu hình VITE_MAPTILER_KEY để tải bản đồ nền.</p>}
    {tileError && <p role="status" className="text-amber-300">Chưa tải được một số ô bản đồ. <button className="underline" onClick={() => { setTileError(false); setRound(value => value + 1); }}>Thử lại nền bản đồ</button></p>}
    <div className="relative z-0 overflow-hidden rounded-xl border border-border">
      <MapContainer center={[16.0544, 108.2022]} zoom={12} className="floodguard-map" style={{ height: 520, width: '100%' }}>
        {key && <TileLayer key={round} tileSize={512} zoomOffset={-1} maxZoom={19}
          url={`https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`}
          attribution='&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
          eventHandlers={{ tileerror: () => setTileError(true) }} />}
        {showAreas && data?.areas?.filter(area => (areaFilter === 'all' || (area.areaType ?? 'unknown') === areaFilter) &&
          (!onlyAlerted || (data.alerts && areaAlert(data.alerts, area.id, data.checkedAt)))).map(area => {
          const alert = data.alerts ? areaAlert(data.alerts, area.id, data.checkedAt) : null;
          const fill = area.areaType === 'flood' ? '#facc15' : area.areaType === 'low_lying' ? '#ef4444' : '#94a3b8';
          return <Polygon key={area.id} positions={area.geometry.points.map(point => [point.latitude, point.longitude])}
            pathOptions={{ fillColor: fill, fillOpacity: 0.2, color: alert ? ALERT_COLORS[alert.severity] : fill, weight: alert ? 4 : 2 }}>
            <Popup><strong>{area.name}</strong>{data.areasError && <p>Đa giác đang giữ từ lần tải cũ.</p>}
              <p>{area.areaType === 'flood' ? 'Vùng ngập' : area.areaType === 'low_lying' ? 'Vùng trũng' : 'Chưa phân loại'}</p>
              <p>{data.alertsError ? 'Cảnh báo có thể đã cũ. ' : ''}{data.alerts === null ? 'Chưa tải được cảnh báo.' : alert ? `Cảnh báo ${ALERT_LABELS[alert.severity]}: ${alert.title}` : 'Chưa có cảnh báo hiệu lực tại thời điểm kiểm tra.'}</p>
              <p>Phân loại vùng không xác nhận ngập hiện tại hoặc mức an toàn.</p>
            </Popup>
          </Polygon>;
        })}
        {located.map(item => <CircleMarker key={item.id} center={[item.location!.latitude, item.location!.longitude]} radius={9}
          pathOptions={{ color: '#ffffff', weight: 2, fillOpacity: 1, fillColor: item.state ? SOS_MAP_COLORS[item.state] : '#94a3b8' }}>
          <Popup><strong>{sosCode(item.id)}</strong><p>{item.state ? STATE_LABEL[item.state] : MISSING}</p>
            <p>{item.numberOfPeople ?? MISSING} người · {situationsLabel(item.situations)}</p>
            <p>Mức nước: {item.waterLevel ? WATER_LABEL[item.waterLevel] ?? MISSING : MISSING}</p>
            <p>Nhận GPS: {timeLabel(item.locationReceivedAt)}</p>
            {item.state === 'rescued' && <p>Người xác nhận: {item.completedBy ?? MISSING}<br />Hoàn tất: {timeLabel(item.completedAt)}</p>}
            <Link to={`/rescue/sos/${encodeURIComponent(item.id)}`}>Xem chi tiết</Link>
            {' · '}<a href={directionsUrl(item)!} target="_blank" rel="noopener noreferrer">Mở chỉ đường</a>
          </Popup>
        </CircleMarker>)}
        <SosHistoricalLayers />
        <Controls items={items ?? []} />
      </MapContainer>
    </div>
    <details className="rounded border border-border p-3 text-sm"><summary>Danh sách vùng ({data?.areas?.length ?? 'chưa tải'})</summary>
      {data?.areas?.filter(area => (areaFilter === 'all' || (area.areaType ?? 'unknown') === areaFilter) &&
        (!onlyAlerted || (data.alerts && areaAlert(data.alerts, area.id, data.checkedAt)))).map(area => <p key={area.id} className="mt-2 border-t border-border pt-2">
        {area.name} · {area.areaType === 'flood' ? 'Vùng ngập' : area.areaType === 'low_lying' ? 'Vùng trũng' : 'Chưa phân loại'} · {data.alertsError || !data.alerts ? 'Chưa cập nhật được cảnh báo' : areaAlert(data.alerts, area.id, data.checkedAt) ? 'Có cảnh báo hiệu lực' : 'Chưa có cảnh báo hiệu lực'}
      </p>)}
    </details>
    <p className="text-xs text-muted">{items === null ? 'Chưa tải được số SOS.' : `${located.length}/${items.length} SOS trong bộ lọc có tọa độ hợp lệ; ${items.length - located.length} SOS thiếu tọa độ vẫn xem được trong danh sách.`} GPS được cập nhật theo lần đọc API, camera chỉ di chuyển khi bạn thao tác.</p>
    <p className="text-xs text-muted">Chỉ đường mở theo tọa độ mới nhất đã tải; tuyến đường chưa được đánh giá an toàn trước ngập.</p>
    <p className="text-xs text-muted">Thông tin khu vực kiểm tra lúc: {data?.alertsAt ? timeLabel(new Date(data.alertsAt).toISOString()) : MISSING}. Cảnh báo không tải được sẽ không được coi là mức an toàn thấp.</p>
  </section>;
}
