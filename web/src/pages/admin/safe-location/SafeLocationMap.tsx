
import { useEffect, useState } from "react";
import type { LatLngTuple } from "leaflet";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

import {
  validCoordinates,
  type Coordinates,
  type SafeLocation,
} from "./safeLocationTypes";

// Chỉ dùng làm tâm bản đồ ban đầu khi chưa nhập tọa độ.
// Không tự điền tọa độ này vào form hoặc bản ghi.
const viewportFallback: LatLngTuple = [16.0544, 108.2022];

const green = {
  color: "#15803d",
  fillColor: "#22c55e",
  fillOpacity: 0.95,
};

// Cập nhật vị trí bản đồ khi tọa độ thay đổi.
function PanToPoint({ point }: { point: Coordinates | null }) {
  const map = useMap();
  const latitude = point?.latitude;
  const longitude = point?.longitude;

  useEffect(() => {
    if (latitude !== undefined && longitude !== undefined) {
      map.setView([latitude, longitude], map.getZoom());
    }
  }, [map, latitude, longitude]);

  return null;
}

// Khắc phục lỗi bản đồ Leaflet hiển thị không đầy đủ
// khi được khởi tạo bên trong popup/dialog.
function RefreshModalMapSize() {
  const map = useMap();

  useEffect(() => {
    const refresh = () => {
      map.invalidateSize({
        pan: false,
        debounceMoveend: true,
      });
    };

    // Theo dõi kích thước thực tế của bản đồ.
    // Khi popup mở và bản đồ được hiển thị, Leaflet
    // sẽ được cập nhật lại kích thước.
    const observer = new ResizeObserver(refresh);
    observer.observe(map.getContainer());

    // Cập nhật thêm sau khi trình duyệt vẽ giao diện.
    const frame = window.requestAnimationFrame(refresh);

    // Dự phòng khi popup mở hoặc thay đổi bố cục chậm.
    const timer1 = window.setTimeout(refresh, 150);
    const timer2 = window.setTimeout(refresh, 400);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer1);
      window.clearTimeout(timer2);
    };
  }, [map]);

  return null;
}

// Cho phép chọn tọa độ bằng cách nhấn trên bản đồ.
function PickPoint({
  onPick,
}: {
  onPick?: (point: Coordinates) => void;
}) {
  useMapEvents({
    click: ({ latlng }) => {
      onPick?.({
        latitude: Number(latlng.lat.toFixed(6)),
        longitude: Number(latlng.wrap().lng.toFixed(6)),
      });
    },
  });

  return null;
}

interface FormMapProps {
  point: Coordinates | null;
  name?: string;
  demo: boolean;
  onPick?: (point: Coordinates) => void;
}

// Bản đồ xem trước trong form Thêm/Sửa.
export function SafeLocationMap({
  point,
  name,
  demo,
  onPick,
}: FormMapProps) {
  const [tileError, setTileError] = useState(false);

  const position: LatLngTuple | null = point
    ? [point.latitude, point.longitude]
    : null;

  return (
    <div className="space-y-2">
      <div className="relative isolate h-56 overflow-hidden rounded-xl border border-border bg-bg">
        <MapContainer
          center={position ?? viewportFallback}
          zoom={13}
          scrollWheelZoom={false}
          className="h-full w-full"
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            eventHandlers={{
              tileerror: () => setTileError(true),
            }}
          />

          {/* Cập nhật kích thước khi popup mở */}
          <RefreshModalMapSize />

          {/* Đồng bộ vị trí bản đồ với tọa độ trong form */}
          <PanToPoint point={point} />

          {/* Chọn vị trí trực tiếp trên bản đồ */}
          <PickPoint onPick={onPick} />

          {/* Chỉ hiển thị ghim khi có tọa độ */}
          {position && (
            <CircleMarker
              center={position}
              radius={9}
              pathOptions={green}
            >
              <Tooltip>
                {demo ? "DỮ LIỆU MẪU · " : ""}
                {name || "Vị trí đang nhập"}
              </Tooltip>
            </CircleMarker>
          )}
        </MapContainer>

        {demo && (
          <span className="pointer-events-none absolute right-2 top-2 z-[1000] rounded bg-bg px-2 py-1 font-mono text-xs font-bold text-warn">
            DỮ LIỆU MẪU
          </span>
        )}
      </div>

      {tileError && (
        <p role="status" className="text-xs text-warn">
          Không tải được nền bản đồ; tọa độ nhập vẫn được giữ nguyên.
        </p>
      )}
    </div>
  );
}

interface OverviewProps {
  locations: SafeLocation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  demo: boolean;
}

// Bản đồ danh sách địa điểm trong màn Admin.
// Dùng chung ID với bảng và khung chi tiết.
export function SafeLocationOverviewMap({
  locations,
  selectedId,
  onSelect,
  demo,
}: OverviewProps) {
  const [tileError, setTileError] = useState(false);

  const valid = locations.filter((location) =>
    validCoordinates(location.location)
  );

  const selectedPoint =
    valid.find((location) => location.id === selectedId)?.location ?? null;

  const first = valid[0]?.location ?? null;

  const initialCenter: LatLngTuple = first
    ? [first.latitude, first.longitude]
    : viewportFallback;

  return (
    <div className="space-y-2">
      <div
        role="region"
        aria-label="Bản đồ điểm an toàn"
        className="relative isolate h-72 overflow-hidden rounded-xl border border-border bg-bg"
      >
        <MapContainer
          center={initialCenter}
          zoom={13}
          scrollWheelZoom={false}
          className="h-full w-full"
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            eventHandlers={{
              tileerror: () => setTileError(true),
            }}
          />

          {/* Di chuyển bản đồ theo địa điểm đang xem */}
          <PanToPoint point={selectedPoint} />

          {/* Một ghim tương ứng với một ID địa điểm */}
          {valid.map((location) => (
            <CircleMarker
              key={location.id}
              center={[
                location.location!.latitude,
                location.location!.longitude,
              ]}
              radius={location.id === selectedId ? 11 : 8}
              pathOptions={{
                ...green,
                weight: location.id === selectedId ? 4 : 2,
              }}
              eventHandlers={{
                click: () => onSelect(location.id),
              }}
            >
              <Tooltip>
                {location.name} · Chọn để xem chi tiết
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>

        {demo && (
          <span className="pointer-events-none absolute right-2 top-2 z-[1000] rounded bg-bg px-2 py-1 font-mono text-xs font-bold text-warn">
            DỮ LIỆU MẪU
          </span>
        )}
      </div>

      <p className="text-xs text-muted">
        Ghim xanh lá · Chọn ghim hoặc dòng trong bảng để xem cùng một địa điểm.
      </p>

      {tileError && (
        <p role="status" className="text-xs text-warn">
          Không tải được nền bản đồ; danh sách và tọa độ vẫn sử dụng được.
        </p>
      )}
    </div>
  );
}
