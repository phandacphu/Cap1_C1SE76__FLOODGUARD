import { useEffect, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import { Link } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import '../../map/floodMap.css';
import type { DirectSosRequest } from '../../../types/rescueDirect';
import { sosCode, timeLabel } from '../sosDirect';

function MapControls({ focus }: { focus: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    map.invalidateSize();
    return () => observer.disconnect();
  }, [map]);
  return (
    <button type="button" onClick={() => map.setView(focus, 15)}
      className="absolute bottom-8 left-3 z-[1000] rounded bg-slate-950 px-3 py-2 text-xs text-white">
      Đưa về vị trí SOS
    </button>
  );
}

export function DirectSosMap({ items, detail = false }: { items: DirectSosRequest[] | null; detail?: boolean }) {
  const located = (items ?? []).filter(item => item.location !== null);
  const key = (import.meta.env.VITE_MAPTILER_KEY ?? '').trim();
  const [tileError, setTileError] = useState(false);
  const [tileRound, setTileRound] = useState(0);
  // Camera is initialized once. GPS polls move markers without moving the user's view.
  const [initial] = useState<[number, number]>(() => (
    detail && located[0]?.location ? [located[0].location.latitude, located[0].location.longitude] : [16.0544, 108.2022]
  ));
  const focus: [number, number] = located[0]?.location
    ? [located[0].location.latitude, located[0].location.longitude] : initial;
  return (
    <div className="space-y-2">
      {!key && <p role="status" className="text-xs text-amber-300">Chưa cấu hình key bản đồ MapTiler.</p>}
      {tileError && <p role="status" className="text-xs text-amber-300">
        Chưa tải được một số ô bản đồ nền.{' '}
        <button type="button" className="underline" onClick={() => {
          setTileError(false); setTileRound(value => value + 1);
        }}>Tải lại bản đồ nền</button>
      </p>}
      <div className="relative z-0 overflow-hidden rounded-xl border border-border">
        <MapContainer className="floodguard-map" center={initial} zoom={detail ? 15 : 12} style={{ height: 420, width: '100%' }}>
          {key && <TileLayer key={tileRound} tileSize={512} zoomOffset={-1} minZoom={1} maxZoom={19}
            url={`https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`}
            attribution='&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
            eventHandlers={{ tileerror: () => setTileError(true) }} />}
          {located.map(item => (
            <CircleMarker key={item.id} center={[item.location!.latitude, item.location!.longitude]}
              radius={9} pathOptions={{ color: '#fff', weight: 2, fillColor: item.state === 'rescued' ? '#16a34a' : '#ef4444', fillOpacity: 1 }}>
              <Popup>
                <strong>{sosCode(item.id)}</strong>
                <p>Backend nhận vị trí lúc: {timeLabel(item.locationReceivedAt)}</p>
                <Link to={`/rescue/sos/${encodeURIComponent(item.id)}`}>Xem chi tiết</Link>
              </Popup>
            </CircleMarker>
          ))}
          {located.length > 0 && <MapControls focus={focus} />}
        </MapContainer>
      </div>
      <p className="text-xs text-muted">{items === null ? 'Chưa tải được số SOS.' : `${located.length} yêu cầu có tọa độ hợp lệ trong dữ liệu đang hiển thị.`}</p>
      {detail && located.length === 0 && <p className="text-sm text-muted">Chưa có thông tin vị trí hợp lệ.</p>}
    </div>
  );
}
