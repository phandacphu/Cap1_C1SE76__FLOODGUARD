import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import { useState } from "react";
import "leaflet/dist/leaflet.css";
import type { SosItem } from "./sosTypes";

export function SosLocationMap({ item }: { item: SosItem }) {
  const [attempt, setAttempt] = useState(0);
  const [failedMapKey, setFailedMapKey] = useState<string | null>(null);
  const latest = item.location;
  const initial = item.initialLocation;
  const center = latest ?? initial;
  if (!center) return <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
    Tọa độ chưa được cung cấp hoặc không hợp lệ. Không thể hiển thị vị trí trên bản đồ.
  </p>;
  const point: [number, number] = [center.latitude, center.longitude];
  const mapKey = `${item.id}:${point.join(",")}:${attempt}`;
  const initialIsDistinct = initial && (!latest || initial.latitude !== latest.latitude || initial.longitude !== latest.longitude);
  return (
    <>
      <div role="region" aria-label="Bản đồ vị trí SOS" className="relative z-0 h-80 overflow-hidden rounded-xl border border-border">
        <MapContainer key={mapKey} center={point} zoom={15} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            eventHandlers={{ tileerror: () => setFailedMapKey(mapKey) }} />
          {latest && <CircleMarker center={[latest.latitude, latest.longitude]} radius={10}
            pathOptions={{ color: item.condition === "rescued" ? "#2ee88a" : "#22d3ee", fillOpacity: 0.6 }}>
            <Popup>{item.id} — Vị trí mới nhất Backend nhận</Popup>
          </CircleMarker>}
          {initial && initialIsDistinct && <CircleMarker center={[initial.latitude, initial.longitude]} radius={6}
            pathOptions={{ color: "#f59e0b", fillOpacity: 0.45 }}>
            <Popup>{item.id} — Vị trí ban đầu</Popup>
          </CircleMarker>}
        </MapContainer>
      </div>
      {failedMapKey === mapKey && <div role="status" className="mt-3 text-xs leading-5 text-warn">
        Không tải được một phần nền bản đồ. Tọa độ và vị trí SOS vẫn được giữ.
        <button type="button" onClick={() => setAttempt(value => value + 1)} className="ml-2 underline">Thử lại nền bản đồ</button>
      </div>}
    </>
  );
}
