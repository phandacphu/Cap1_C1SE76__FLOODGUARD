import { historicalFloodIcon } from "../../map/historicalFloodIcon";
import { formatDashboardSosCount } from "../../admin/sos/sosFormat";
import { useEffect, useState } from "react";
import L from "leaflet";
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer } from "react-leaflet";
import { Link } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import type { RescueRequest, UrgencyLevel } from "../../../types/rescue";
import {
  fetchHistoricalBuffers,
  fetchHistoricalPoints,
  fetchHistoricalRadar,
  type HistoricalFeatureCollection,
} from "../../admin/flood-area/historicalMapService";
import { isOpen, sosCode, URGENCY_LABEL } from "../rescueStats";

const layers = [
  { label: "Vùng tham chiếu radar", load: fetchHistoricalRadar },
  { label: "Vùng đệm lịch sử", load: fetchHistoricalBuffers },
  { label: "Điểm ngập lịch sử", load: fetchHistoricalPoints },
];

const sosColors: Record<UrgencyLevel, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#0284c7",
  low: "#16a34a",
};

export function RescueOperationsMap({ requests }: { requests: RescueRequest[] | null }) {
  const [history, setHistory] = useState<PromiseSettledResult<HistoricalFeatureCollection>[] | null>(null);
  const [showHistory, setShowHistory] = useState(true);
  const [retry, setRetry] = useState(0);
  const [tileError, setTileError] = useState(false);
  const [tileRevision, setTileRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled(layers.map(({ load }) => load())).then((result) => {
      if (!cancelled) setHistory(result);
    });
    return () => { cancelled = true; };
  }, [retry]);

  const openRequests = (requests ?? []).filter(({ status, location }) =>
    isOpen(status) && location &&
    Number.isFinite(location.latitude) && Math.abs(location.latitude) <= 90 &&
    Number.isFinite(location.longitude) && Math.abs(location.longitude) <= 180,
  );
  const failedLayers = history?.flatMap((result, index) =>
    result.status === "rejected" ? [layers[index].label] : [],
  ) ?? [];

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showHistory} onChange={(event) => setShowHistory(event.target.checked)} />
        Hiện lớp ngập lịch sử
      </label>
      {showHistory && history === null && (
        <p role="status" className="text-xs text-muted">Đang tải dữ liệu ngập lịch sử…</p>
      )}
      {showHistory && failedLayers.length > 0 && (
        <div role="status" className="flex flex-wrap gap-2 text-xs text-warn">
          <span>Không tải được: {failedLayers.join(", ")}.</span>
          <button type="button" className="underline" onClick={() => {
            setHistory(null);
            setRetry((value) => value + 1);
          }}>
            Tải lại lớp lịch sử
          </button>
        </div>
      )}
      {tileError && (
        <div role="status" className="flex flex-wrap gap-2 text-xs text-warn">
          <span>Một số ô bản đồ nền không tải được.</span>
          <button type="button" className="underline" onClick={() => {
            setTileError(false);
            setTileRevision((value) => value + 1);
          }}>
            Tải lại bản đồ nền
          </button>
        </div>
      )}
      <div className="relative z-0 overflow-hidden rounded-xl border border-border">
        <MapContainer center={[16.0544, 108.2022]} zoom={13} style={{ height: 480, width: "100%" }}>
          <TileLayer
            key={tileRevision}
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
            eventHandlers={{ tileerror: () => setTileError(true) }}
          />
          {showHistory && history?.map((result, index) =>
            result.status === "fulfilled" ? (
              <GeoJSON
                key={layers[index].label}
                data={result.value as unknown as GeoJSON.FeatureCollection}
                interactive={false}
                style={{ color: "#ef4444", fillColor: "#ef4444", weight: 1.5, fillOpacity: 0.15 }}
                pointToLayer={(_feature, latlng) => L.marker(latlng, { icon: historicalFloodIcon, interactive: false })}
              />
            ) : null,
          )}
          {openRequests.map((request) => (
            <CircleMarker
              key={request.id}
              center={[request.location.latitude, request.location.longitude]}
              radius={8}
              pathOptions={{ color: "#fff", weight: 2, fillColor: sosColors[request.urgency], fillOpacity: 1 }}
            >
              <Popup>
                <strong>{sosCode(request.id)}</strong>
                <p>{URGENCY_LABEL[request.urgency]} · {request.numberOfPeople} người</p>
                <Link to={`/rescue/sos/${encodeURIComponent(request.id)}`}>Xem chi tiết SOS</Link>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      <p className="text-xs text-muted">
        {requests ? `${formatDashboardSosCount(openRequests.length)} SOS đang mở có tọa độ hợp lệ.` : formatDashboardSosCount(null)} Dữ liệu ngập lịch sử chỉ dùng để tham khảo.
      </p>
    </div>
  );
}
