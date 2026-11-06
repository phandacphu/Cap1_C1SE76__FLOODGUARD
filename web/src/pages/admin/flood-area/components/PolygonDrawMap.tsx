import { useEffect, useRef } from "react";
import L from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoPoint } from "../floodAreaTypes";

interface Props {
  points: GeoPoint[];
  onChange: (points: GeoPoint[]) => void;
  /** Điểm tham khảo (27 điểm ngập lịch sử), chỉ để xem. */
  referencePoints?: GeoPoint[];
  disabled?: boolean;
}

const CENTER: L.LatLngTuple = [16.0544, 108.2022];
const EMPTY: GeoPoint[] = [];
const COLOR = "#22d3ee";

const round = (n: number) => Math.round(n * 1e6) / 1e6;

function numberIcon(n: number) {
  const style = [
    "width:24px",
    "height:24px",
    "border-radius:50%",
    "background:" + COLOR,
    "color:#0b1121",
    "border:2px solid #fff",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "font:700 12px sans-serif",
    "cursor:grab",
  ].join(";");
  return L.divIcon({
    className: "",
    html: `<div style="${style}">${n}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function ClickToAdd({ onAdd, disabled }: { onAdd: (p: GeoPoint) => void; disabled: boolean }) {
  useMapEvents({
    click: (e) => {
      if (!disabled) onAdd({ latitude: round(e.latlng.lat), longitude: round(e.latlng.lng) });
    },
  });
  return null;
}

/** Khi sửa vùng đã có tọa độ, thu phóng vào đúng vùng đó (một lần). */
function FitToPoints({ points }: { points: GeoPoint[] }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p): L.LatLngTuple => [p.latitude, p.longitude]));
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
    done.current = true;
  }, [map, points]);
  return null;
}

export function PolygonDrawMap({ points, onChange, referencePoints = EMPTY, disabled = false }: Props) {
  const latlngs = points.map((p): L.LatLngTuple => [p.latitude, p.longitude]);
  const shape = { color: COLOR, weight: 2, fillColor: COLOR, fillOpacity: 0.2 };

  const disabledRef = useRef(disabled);
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);
  const addPoint = (p: GeoPoint) => { if (!disabledRef.current) onChange([...points, p]); };
  const removeAt = (index: number) => { if (!disabledRef.current) onChange(points.filter((_, i) => i !== index)); };
  const undoLast = () => { if (!disabledRef.current) onChange(points.slice(0, -1)); };
  const clearAll = () => { if (!disabledRef.current) onChange([]); };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        {disabled && <strong role="status">Đang lưu vùng — không thể chỉnh sửa điểm. </strong>}
        Bấm lên bản đồ để thêm điểm theo thứ tự đi quanh vùng ngập. Kéo số để chỉnh vị trí.
        Chấm đỏ là các điểm ngập lịch sử để đối chiếu.
      </p>

      <div className="isolate h-80 w-full overflow-hidden rounded-lg border border-border">
        <MapContainer
          center={CENTER}
          zoom={13}
          style={{ height: "100%", width: "100%", background: "#1e293b" }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToAdd onAdd={addPoint} disabled={disabled} />
          <FitToPoints points={points} />

          {referencePoints.map((p, i) => (
            <CircleMarker
              key={`ref-${i}`}
              center={[p.latitude, p.longitude]}
              radius={5}
              interactive={false}
              pathOptions={{
                color: "#ffffff",
                weight: 1,
                fillColor: "#ef4444",
                fillOpacity: 0.85,
              }}
            />
          ))}

          {latlngs.length >= 3 && (
            <Polygon positions={latlngs} interactive={false} pathOptions={shape} />
          )}
          {latlngs.length === 2 && (
            <Polyline positions={latlngs} interactive={false} pathOptions={shape} />
          )}

          {points.map((p, i) => (
            <Marker
              key={`pt-${i}`}
              position={[p.latitude, p.longitude]}
              icon={numberIcon(i + 1)}
              draggable={!disabled}
              eventHandlers={{
                dragend: (e) => {
                  if (disabledRef.current) return;
                  const ll = (e.target as L.Marker).getLatLng();
                  onChange(
                    points.map((q, j) =>
                      j === i ? { latitude: round(ll.lat), longitude: round(ll.lng) } : q,
                    ),
                  );
                },
              }}
            />
          ))}
        </MapContainer>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={undoLast}
          disabled={disabled || points.length === 0}
          className="rounded border border-border px-2.5 py-1 text-xs hover:border-water/50 disabled:opacity-50"
        >
          Hoàn tác điểm cuối
        </button>
        <button
          type="button"
          onClick={clearAll}
          disabled={disabled || points.length === 0}
          className="rounded border border-border px-2.5 py-1 text-xs hover:border-water/50 disabled:opacity-50"
        >
          Xóa hết
        </button>
        <span className="font-mono text-xs text-muted">{points.length} điểm</span>
      </div>

      {points.length > 0 && (
        <ol className="max-h-32 space-y-1 overflow-y-auto font-mono text-xs">
          {points.map((p, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-5 text-muted">{i + 1}.</span>
              <span>
                {p.latitude}, {p.longitude}
              </span>
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label={`Xóa điểm ${i + 1}`}
                disabled={disabled}
                className="ml-auto rounded px-1.5 text-muted hover:text-sos"
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}