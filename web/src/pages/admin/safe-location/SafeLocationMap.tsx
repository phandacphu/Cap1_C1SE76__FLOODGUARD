import { useState } from "react";
import type { LatLngTuple } from "leaflet";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Coordinates } from "./safeLocationTypes";

const center: LatLngTuple = [16.0544, 108.2022];

function PickPoint({ onPick }: { onPick?: (point: Coordinates) => void }) {
  useMapEvents({
    click: ({ latlng }) => onPick?.({
      latitude: Number(latlng.lat.toFixed(6)),
      longitude: Number(latlng.wrap().lng.toFixed(6)),
    }),
  });
  return null;
}

interface Props {
  point: Coordinates | null;
  name?: string;
  demo: boolean;
  onPick?: (point: Coordinates) => void;
}

export function SafeLocationMap({ point, name, demo, onPick }: Props) {
  const [tileError, setTileError] = useState(false);
  const position: LatLngTuple | null = point ? [point.latitude, point.longitude] : null;

  return (
    <div className="space-y-2">
      <div className="relative isolate h-56 overflow-hidden rounded-xl border border-border bg-bg">
        <MapContainer center={position ?? center} zoom={13} scrollWheelZoom={false} className="h-full w-full">
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            eventHandlers={{ tileerror: () => setTileError(true) }} />
          <PickPoint onPick={onPick} />
          {position && <CircleMarker center={position} radius={8} pathOptions={{ color: "#13754f", fillColor: "#2ee88a", fillOpacity: 0.9 }}>
            <Tooltip>{demo ? "TEST ONLY · " : ""}{name || "Vị trí đã chọn"}</Tooltip>
          </CircleMarker>}
        </MapContainer>
        {demo && <span className="pointer-events-none absolute right-2 top-2 z-[1000] rounded bg-bg px-2 py-1 font-mono text-xs font-bold text-warn">TEST ONLY</span>}
      </div>
      {tileError && <p role="status" className="text-xs text-warn">Không tải được lớp nền bản đồ. Tọa độ vẫn xem và nhập được.</p>}
    </div>
  );
}
