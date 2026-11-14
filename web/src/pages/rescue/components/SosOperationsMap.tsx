import { useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import { Link } from 'react-router-dom';
import { latLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../../map/floodMap.css';
import type { DirectSosRequest } from '../../../types/rescueDirect';
import { STATE_LABEL, WATER_LABEL, MISSING, sosCode, timeLabel, situationsLabel } from '../sosDirect';
import { SOS_MAP_COLORS, directionsUrl, hasMapLocation } from '../sosMapData';

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
  const [tileError, setTileError] = useState(false);
  const [round, setRound] = useState(0);
  const located = (items ?? []).filter(hasMapLocation);
  const key = (import.meta.env.VITE_MAPTILER_KEY ?? '').trim();
  return <section className="space-y-3 rounded-xl border border-border bg-card p-4" aria-label="Bản đồ yêu cầu SOS">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-bold">Bản đồ cứu hộ</h2>
    </div>
    <p className="text-sm">🔴 Chờ cứu hộ (cần cứu/chưa cứu) · 🟢 Đã cứu · ⚪ Trạng thái cũ/khác</p>
    {!key && <p role="status" className="text-amber-300">Chưa cấu hình VITE_MAPTILER_KEY để tải bản đồ nền.</p>}
    {tileError && <p role="status" className="text-amber-300">Chưa tải được một số ô bản đồ. <button className="underline" onClick={() => { setTileError(false); setRound(value => value + 1); }}>Thử lại nền bản đồ</button></p>}
    <div className="relative z-0 overflow-hidden rounded-xl border border-border">
      <MapContainer center={[16.0544, 108.2022]} zoom={12} className="floodguard-map" style={{ height: 520, width: '100%' }}>
        {key && <TileLayer key={round} tileSize={512} zoomOffset={-1} maxZoom={19}
          url={`https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`}
          attribution='&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
          eventHandlers={{ tileerror: () => setTileError(true) }} />}
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
        <Controls items={items ?? []} />
      </MapContainer>
    </div>
    <p className="text-xs text-muted">{items === null ? 'Chưa tải được số SOS.' : `${located.length}/${items.length} SOS trong bộ lọc có tọa độ hợp lệ; ${items.length - located.length} SOS thiếu tọa độ vẫn xem được trong danh sách.`} GPS được cập nhật theo lần đọc API, camera chỉ di chuyển khi bạn thao tác.</p>
    <p className="text-xs text-muted">Chỉ đường mở theo tọa độ mới nhất đã tải; tuyến đường chưa được đánh giá an toàn trước ngập.</p>

  </section>;
}
