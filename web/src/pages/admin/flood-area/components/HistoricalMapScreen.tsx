/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON as GeoJSONLayer, Polygon, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { fetchHistoricalPoints, fetchHistoricalBuffers, fetchHistoricalRadar } from '../historicalMapService';
import { listAreas } from '../floodAreaService';
import { SEVERITY_LABEL, type FloodAreaItem } from '../floodAreaTypes';
import { formatAreaId } from '../areaId';

// Import AppShell và Admin Nav để hiển thị Sidebar giống trang Tổng quan
import { AppShell } from '../../../../components/layout/AppShell';
import { ADMIN_NAV } from '../../../../components/layout/navConfig';
import { AdminHeader } from '../../../../components/layout/AdminHeader';

// Fix lỗi icon của Leaflet trong React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
const DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Màu vùng ngập quản lý theo mức độ
const SEVERITY_COLOR: Record<string, string> = {
    low: '#facc15',
    medium: '#fb923c',
    high: '#ef4444',
    critical: '#b91c1c',
};

export default function HistoricalMapScreen() {
    const [pointsData, setPointsData] = useState<any>(null);
    const [buffersData, setBuffersData] = useState<any>(null);
    const [radarData, setRadarData] = useState<any>(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Vùng ngập do admin tạo ở trang "Quản lý vùng ngập"
    const [areas, setAreas] = useState<FloodAreaItem[]>([]);
    const [areasError, setAreasError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        const loadData = async () => {
            setLoading(true);
            setError(null);
            try {
                const [pointsRes, buffersRes, radarRes] = await Promise.all([
                    fetchHistoricalPoints(),
                    fetchHistoricalBuffers(),
                    fetchHistoricalRadar()
                ]);

                if (!isMounted) return;

                if (pointsRes?.success && pointsRes.data?.geojson) {
                    setPointsData(pointsRes.data.geojson);
                }
                if (buffersRes?.success && buffersRes.data?.geojson) {
                    setBuffersData(buffersRes.data.geojson);
                }
                if (radarRes?.success && radarRes.data?.geojson) {
                    setRadarData(radarRes.data.geojson);
                }
            } catch (err) {
                if (isMounted) {
                    setError(err instanceof Error ? err.message : 'Lỗi khi tải dữ liệu bản đồ.');
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadData();
        return () => { isMounted = false; };
    }, []);

    // Lấy vùng ngập quản lý từ API, chỉ hiển thị vùng đang hoạt động
    useEffect(() => {
        let isMounted = true;
        listAreas()
            .then((data) => {
                if (isMounted) setAreas(data.filter((a) => a.status === 'active'));
            })
            .catch((err: unknown) => {
                if (isMounted) {
                    setAreasError(err instanceof Error ? err.message : 'Không tải được vùng ngập.');
                }
            });
        return () => { isMounted = false; };
    }, []);

    // Cập nhật màu sắc theo bản Mobile App (Tông Đỏ)
    const bufferStyle = {
        color: '#dc2626',
        weight: 1.5,
        opacity: 0.8,
        fillColor: '#ef4444',
        fillOpacity: 0.15,
        dashArray: ''
    };

    const radarStyle = {
        color: '#991b1b',
        weight: 1.5,
        opacity: 0.8,
        fillColor: '#b91c1c',
        fillOpacity: 0.2
    };

    return (
        <AppShell
            nav={ADMIN_NAV}
            brandSub="COMMAND C4I"
            brandTag="ADMIN"
            roleLabel="QUẢN TRỊ VIÊN C4I"
            accent="water"
            header={<AdminHeader alertCount={0} />}
        >
            <div className="mx-auto max-w-[1500px] space-y-5">
                {/* Header Cảnh báo */}
                <div className="bg-[#1e293b] border border-red-900/50 p-4 rounded-xl shadow-sm shrink-0">
                    <p className="text-gray-300 text-sm">
                        <span className="text-red-400 font-semibold mr-1">Dữ liệu ngập lịch sử phục vụ tham khảo — không phải cảnh báo ngập hiện tại.</span>
                        Các lớp này chưa được xác thực là ranh giới vùng ngập và không dùng để phát cảnh báo hay tạo SOS.
                    </p>
                </div>

                {/* Lỗi tải vùng ngập quản lý */}
                {areasError && (
                    <div className="rounded-xl border border-yellow-600/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
                        Không tải được vùng ngập đã tạo: {areasError}
                    </div>
                )}

                {/* Bản đồ Leaflet */}
                <div className="w-full h-[550px] rounded-xl overflow-hidden relative z-0 border border-gray-800 shadow-md bg-[#1e293b]">
                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-[#0f172a]/80 z-[1000] backdrop-blur-sm">
                            <div className="flex flex-col items-center">
                                <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                                <span className="text-gray-300 font-medium">Đang tải dữ liệu bản đồ...</span>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="absolute inset-0 flex items-center justify-center bg-[#0f172a]/90 z-[1000]">
                            <div className="text-center max-w-sm p-6 bg-[#1e293b] rounded-xl border border-red-500/30 shadow-xl">
                                <div className="text-red-400 text-5xl mb-4">⚠️</div>
                                <p className="text-gray-200 mb-6 leading-relaxed">{error}</p>
                                <button onClick={() => window.location.reload()} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium">
                                    Tải lại trang
                                </button>
                            </div>
                        </div>
                    )}

                    <MapContainer
                        center={[16.0544, 108.2022]}
                        zoom={13}
                        style={{ height: '100%', width: '100%', background: '#1e293b' }}
                        zoomControl={true}
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />

                        {radarData && <GeoJSONLayer data={radarData as any} style={radarStyle} />}
                        {buffersData && <GeoJSONLayer data={buffersData as any} style={bufferStyle} />}
                        {pointsData && (
                            <GeoJSONLayer
                                data={pointsData as any}
                                pointToLayer={(_feature: any, latlng: any) => {
                                    const redIcon = L.divIcon({
                                        className: 'custom-div-icon',
                                        html: `<div style='background-color:#ef4444; width:16px; height:16px; border-radius:50%; border:3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);'></div>`,
                                        iconSize: [16, 16],
                                        iconAnchor: [8, 8]
                                    });
                                    return L.marker(latlng, { icon: redIcon });
                                }}
                                onEachFeature={(feature: any, layer: any) => {
                                    if (feature.properties && feature.properties.name) {
                                        layer.bindPopup(
                                            `<div style="font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont; min-width: 180px; padding: 4px;">
                                                <strong style="color: #0f172a; font-size: 14px; display: block; margin-bottom: 6px; line-height: 1.4;">${feature.properties.name}</strong>
                                                <div style="display: flex; flex-direction: column; gap: 4px;">
                                                    <span style="color: #64748b; font-size: 12px; display: flex; align-items: center; justify-content: space-between;">
                                                        <span>ID:</span> <span style="font-family: monospace; font-weight: 500; color: #334155;">${feature.properties.id || 'N/A'}</span>
                                                    </span>
                                                    <span style="color: #64748b; font-size: 12px; display: flex; align-items: center; justify-content: space-between;">
                                                        <span>Giai đoạn:</span> <span style="font-weight: 500; color: #334155;">${feature.properties.data_period || 'N/A'}</span>
                                                    </span>
                                                </div>
                                            </div>`
                                        );
                                    }
                                }}
                            />
                        )}

                        {/* Vùng ngập do admin tạo (lấy từ API) */}
                        {areas.map((a) => (
                            <Polygon
                                key={a.id}
                                positions={a.geometry.points.map((p) => [p.latitude, p.longitude] as [number, number])}
                                pathOptions={{
                                    color: SEVERITY_COLOR[a.severity] ?? '#ef4444',
                                    weight: 2,
                                    fillColor: SEVERITY_COLOR[a.severity] ?? '#ef4444',
                                    fillOpacity: 0.3,
                                }}
                            >
                                <Popup>
                                    <strong>{a.name}</strong>
                                    <div style={{ fontSize: 12 }}>ID: {formatAreaId(a.id)}</div>
                                    <div style={{ fontSize: 12 }}>Mức độ: {SEVERITY_LABEL[a.severity]}</div>
                                    {a.description && <div style={{ fontSize: 12 }}>{a.description}</div>}
                                </Popup>
                            </Polygon>
                        ))}
                    </MapContainer>
                </div>

                {/* Chú giải ngập lịch sử */}
                <div className="bg-[#1e293b] p-5 rounded-xl border border-gray-800 shadow-md shrink-0">
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-700/50">
                        <span className="text-gray-400">📋</span>
                        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">CHÚ GIẢI NGẬP LỊCH SỬ</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="flex flex-col">
                            <div className="font-medium text-gray-200 text-sm flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                <span>Điểm ngập lịch sử ({pointsData?.features?.length || 27})</span>
                            </div>
                            <div className="text-xs text-gray-400 leading-relaxed pl-5">Các vị trí từng ghi nhận ngập (2015-2026).</div>
                        </div>

                        <div className="flex flex-col">
                            <div className="font-medium text-gray-200 text-sm flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 rounded-full bg-red-500 opacity-50 border border-red-500"></div>
                                <span>Vùng đệm tham khảo ({buffersData?.features?.length || 2})</span>
                            </div>
                            <div className="text-xs text-gray-400 leading-relaxed pl-5">Vùng đệm nghiên cứu 220m và 450m. Không phải ranh giới ngập thực tế.</div>
                        </div>

                        <div className="flex flex-col">
                            <div className="font-medium text-gray-200 text-sm flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 bg-red-700 opacity-60 border border-red-800"></div>
                                <span>Radar nghi ngập ({radarData?.features?.length || 157})</span>
                            </div>
                            <div className="text-xs text-gray-400 leading-relaxed pl-5">Vùng phân tích Radar phục vụ nghiên cứu lịch sử. Chưa được xác minh.</div>
                        </div>

                        <div className="flex flex-col">
                            <div className="font-medium text-gray-200 text-sm flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 bg-orange-400 opacity-70 border border-orange-500"></div>
                                <span>Vùng ngập quản lý ({areas.length})</span>
                            </div>
                            <div className="text-xs text-gray-400 leading-relaxed pl-5">Vùng do quản trị viên tạo, màu theo mức độ.</div>
                        </div>
                    </div>
                </div>
            </div>
        </AppShell>
    );
}