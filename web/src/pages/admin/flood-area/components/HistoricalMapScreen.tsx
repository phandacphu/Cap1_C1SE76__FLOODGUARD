/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON as GeoJSONLayer, Polygon, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
    fetchHistoricalPoints,
    fetchHistoricalAreas,
    fetchHistoricalBuffers,
    fetchHistoricalRadar,
    type HistoricalFeatureCollection,
    type HistoricalLayerKey,
} from '../historicalMapService';
import { listAreas } from '../floodAreaService';
import { AREA_TYPE_LABEL, AREA_TYPE_COLOR, type FloodAreaItem } from '../floodAreaTypes';
import { formatAreaId } from '../areaId';

import { AppShell } from '../../../../components/layout/AppShell';
import { ADMIN_NAV } from '../../../../components/layout/navConfig';
import { AdminHeader } from '../../../../components/layout/AdminHeader';

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char] ?? char);

const DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

type LayerKey = HistoricalLayerKey;

interface LayerState {
    status: 'loading' | 'ok' | 'error';
    data: HistoricalFeatureCollection | null;
    error: string | null;
    version: number;
}

const ALL_LAYERS: LayerKey[] = ['points', 'areas', 'buffers', 'radar'];

const FETCHERS: Record<LayerKey, () => Promise<HistoricalFeatureCollection>> = {
    points: fetchHistoricalPoints,
    areas: fetchHistoricalAreas,
    buffers: fetchHistoricalBuffers,
    radar: fetchHistoricalRadar,
};

const LAYER_LABEL: Record<LayerKey, string> = {
    points: 'Điểm ngập lịch sử',
    areas: 'Đa giác lịch sử do Admin vẽ',
    buffers: 'Vùng đệm tham khảo',
    radar: 'Vùng trũng',
};

const LOADING: LayerState = { status: 'loading', data: null, error: null, version: 0 };

export default function HistoricalMapScreen() {
    const [layers, setLayers] = useState<Record<LayerKey, LayerState>>({
        points: LOADING,
        areas: LOADING,
        buffers: LOADING,
        radar: LOADING,
    });

    const [areas, setAreas] = useState<FloodAreaItem[] | null>(null);
    const [areasError, setAreasError] = useState<string | null>(null);
    const [areasLoading, setAreasLoading] = useState(true);

    const mountedRef = useRef(false);
    const layerRequestsRef = useRef<Record<LayerKey, number>>({ points: 0, areas: 0, buffers: 0, radar: 0 });
    const areaRequestRef = useRef(0);
    const mountRunRef = useRef(0);

    // Update each layer as soon as its own request finishes, not after the slowest layer.
    const loadLayer = useCallback((key: LayerKey) => {
        const request = ++layerRequestsRef.current[key];
        setLayers((prev) => ({ ...prev, [key]: { ...prev[key], status: 'loading', data: null, error: null } }));
        void FETCHERS[key]().then((data) => {
            if (!mountedRef.current || layerRequestsRef.current[key] !== request) return;
            setLayers((prev) => ({
                ...prev,
                [key]: { status: 'ok', data, error: null, version: prev[key].version + 1 },
            }));
        }).catch((err: unknown) => {
            if (!mountedRef.current || layerRequestsRef.current[key] !== request) return;
            setLayers((prev) => ({
                ...prev,
                [key]: {
                    status: 'error', data: null, version: prev[key].version,
                    error: err instanceof Error ? err.message : `${LAYER_LABEL[key]}: lỗi không xác định.`,
                },
            }));
        });
    }, []);

    const loadAreas = useCallback(() => {
        const request = ++areaRequestRef.current;
        setAreasLoading(true);
        setAreasError(null);
        void listAreas().then((data) => {
            if (mountedRef.current && areaRequestRef.current === request) setAreas(data);
        }).catch((err: unknown) => {
            if (mountedRef.current && areaRequestRef.current === request) {
                setAreasError(err instanceof Error ? err.message : 'Không tải được vùng Admin.');
            }
        }).finally(() => {
            if (mountedRef.current && areaRequestRef.current === request) setAreasLoading(false);
        });
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        const mountRun = ++mountRunRef.current;
        const requests = layerRequestsRef.current;
        // Schedule async so no synchronous state update runs inside the effect.
        void Promise.resolve().then(() => {
            if (!mountedRef.current || mountRunRef.current !== mountRun) return;
            ALL_LAYERS.forEach(loadLayer);
            loadAreas();
        });
        return () => {
            mountedRef.current = false;
            mountRunRef.current += 1;
            ALL_LAYERS.forEach((key) => { requests[key] += 1; });
            areaRequestRef.current += 1;
        };
    }, [loadLayer, loadAreas]);

    const anyLoading = ALL_LAYERS.some((k) => layers[k].status === 'loading');
    const failedKeys = ALL_LAYERS.filter((k) => layers[k].status === 'error');

    const bufferStyle = {
        color: '#dc2626',
        weight: 1.5,
        opacity: 0.8,
        fillColor: '#ef4444',
        fillOpacity: 0.15,
        dashArray: ''
    };

    const radarStyle = {
        color: AREA_TYPE_COLOR.low_lying,
        weight: 1.5,
        opacity: 0.8,
        fillColor: AREA_TYPE_COLOR.low_lying,
        fillOpacity: 0.32
    };

    const pointsData = layers.points.data;
    const historicalAreasData = layers.areas.data;
    const buffersData = layers.buffers.data;
    const radarData = layers.radar.data;

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
                {(areas ?? []).some((a) => a.areaType === null) && (
                    <p role="status" className="rounded-xl border border-yellow-700 p-3 text-sm text-yellow-200">
                        {(areas ?? []).filter((a) => a.areaType === null).length} vùng Admin chưa phân loại nên chưa được vẽ. Mở Quản lý vùng để chọn loại.
                    </p>
                )}
                <div className="bg-[#1e293b] border border-red-900/50 p-4 rounded-xl shadow-sm shrink-0">
                    <p className="text-gray-300 text-sm">
                        <span className="text-red-400 font-semibold mr-1">Dữ liệu ngập lịch sử phục vụ tham khảo — không phải cảnh báo ngập hiện tại.</span>
                        Các lớp này chưa được xác thực là ranh giới vùng ngập và không dùng để phát cảnh báo hay tạo SOS.
                    </p>
                </div>

                {/* Each invalid/unavailable historical layer has its own error and retry action. */}
                {failedKeys.length > 0 && (
                    <div role="alert" className="space-y-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                        <p className="font-semibold">Lỗi {failedKeys.length} lớp lịch sử; các lớp đã tải được vẫn hiển thị.</p>
                        {failedKeys.map((key) => (
                            <div key={key} className="flex items-center justify-between gap-3">
                                <span>{layers[key].error}</span>
                                <button
                                    type="button"
                                    onClick={() => loadLayer(key)}
                                    className="shrink-0 rounded border border-red-400/50 px-3 py-1 text-xs hover:bg-red-500/20"
                                >
                                    Thử lại {LAYER_LABEL[key]}
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Lỗi tải vùng ngập quản lý */}
                {areasError && (
                    <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-yellow-600/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
                        <span>Không cập nhật được vùng Admin: {areasError}{areas !== null && " (đang giữ danh sách đã tải trước đó)"}</span>
                        <button
                            type="button"
                            onClick={loadAreas}
                            className="shrink-0 rounded border border-yellow-500/50 px-3 py-1 text-xs hover:bg-yellow-500/20"
                        >
                            Thử lại
                        </button>
                    </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-700 bg-[#1e293b] px-4 py-3">
                    <span role="status" className="text-xs text-gray-300">
                        Vùng Admin: {areasLoading ? 'đang cập nhật…' : areasError ? 'lỗi làm mới' : `${areas?.length ?? 0} vùng`}
                        {anyLoading && ' · Đang tải các lớp lịch sử (bản đồ vẫn sử dụng được)'}
                    </span>
                    <button
                        type="button"
                        onClick={() => { loadAreas(); ALL_LAYERS.forEach(loadLayer); }}
                        disabled={areasLoading || anyLoading}
                        className="rounded border border-blue-400/50 px-3 py-1.5 text-xs text-blue-200 hover:bg-blue-500/20 disabled:opacity-50"
                    >
                        {areasLoading || anyLoading ? 'Đang làm mới vùng…' : 'Làm mới vùng và lớp lịch sử'}
                    </button>
                </div>

                <div className="w-full h-[550px] rounded-xl overflow-hidden relative z-0 border border-gray-800 shadow-md bg-[#1e293b]">
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

                        {radarData && <GeoJSONLayer key={`radar-${layers.radar.version}`} data={radarData as any} style={radarStyle} />}
                        {buffersData && <GeoJSONLayer key={`buffers-${layers.buffers.version}`} data={buffersData as any} style={bufferStyle} />}
                        {historicalAreasData && (
                            <GeoJSONLayer
                                key={`historical-areas-${layers.areas.version}`}
                                data={historicalAreasData as any}
                                style={(feature: any) => {
                                    const t = feature?.properties?.areaType;
                                    const color = t === 'low_lying' ? AREA_TYPE_COLOR.low_lying : AREA_TYPE_COLOR.flood;
                                    return { color, weight: 2.5, fillColor: color, fillOpacity: 0.16, dashArray: '5 5' };
                                }}
                                onEachFeature={(feature: any, layer: any) => {
                                    const props = feature?.properties || {};
                                    layer.bindPopup(`<div style="min-width:180px;font-family:sans-serif">
                                      <strong>${escapeHtml(props.name || 'Đa giác lịch sử')}</strong><br>
                                      ID: ${escapeHtml(props.id || '—')}<br>
                                      Loại: ${escapeHtml(props.areaType === 'low_lying' ? 'Vùng trũng' : 'Vùng ngập')}<br>
                                      Nguồn: ${escapeHtml(props.source || 'Chưa có')}<br>
                                      ${escapeHtml(props.description || '')}<br>
                                      <em>Dữ liệu lịch sử tham khảo, không phải cảnh báo hiện tại.</em>
                                    </div>`);
                                }}
                            />
                        )}
                        {pointsData && (
                            <GeoJSONLayer
                                key={`points-${layers.points.version}`}
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
                                                <strong style="color: #0f172a; font-size: 14px; display: block; margin-bottom: 6px; line-height: 1.4;">${escapeHtml(feature.properties.name)}</strong>
                                                <div style="display: flex; flex-direction: column; gap: 4px;">
                                                    <span style="color: #64748b; font-size: 12px; display: flex; align-items: center; justify-content: space-between;">
                                                        <span>ID:</span> <span style="font-family: monospace; font-weight: 500; color: #334155;">${escapeHtml(feature.properties.id || 'N/A')}</span>
                                                    </span>
                                                    <span style="color: #64748b; font-size: 12px; display: flex; align-items: center; justify-content: space-between;">
                                                        <span>Giai đoạn:</span> <span style="font-weight: 500; color: #334155;">${escapeHtml(feature.properties.data_period || 'N/A')}</span>
                                                    </span>
                                                </div>
                                            </div>`
                                        );
                                    }
                                }}
                            />
                        )}

                        {(areas ?? []).map((a) => a.areaType === null ? null : (
                            <Polygon
                                key={a.id}
                                positions={a.geometry.points.map((p) => [p.latitude, p.longitude] as [number, number])}
                                pathOptions={{
                                    color: AREA_TYPE_COLOR[a.areaType],
                                    weight: 2,
                                    fillColor: AREA_TYPE_COLOR[a.areaType],
                                    fillOpacity: a.areaType === "low_lying" ? 0.32 : 0.24,
                                }}
                            >
                                <Popup>
                                    <strong>{a.name}</strong>
                                    <div style={{ fontSize: 12 }}>ID: {formatAreaId(a.id)}</div>
                                    <div style={{ fontSize: 12 }}>Loại vùng: {AREA_TYPE_LABEL[a.areaType]}</div>
                                    <div style={{ fontSize: 12 }}>Nguồn: {a.source}</div>
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
                                <span>Điểm ngập lịch sử</span>
                            </div>
                            <div className="text-xs text-gray-400 leading-relaxed pl-5">Các vị trí từng ghi nhận ngập (2015-2026).</div>
                        </div>

                        <div className="flex flex-col">
                            <div className="font-medium text-gray-200 text-sm flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 rounded-full bg-red-500 opacity-50 border border-red-500"></div>
                                <span>Vùng đệm tham khảo</span>
                            </div>
                            <div className="text-xs text-gray-400 leading-relaxed pl-5">Vùng đệm nghiên cứu 220m và 450m.</div>
                        </div>

                        <div className="flex flex-col">
                            <div className="font-medium text-gray-200 text-sm flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 bg-red-700 opacity-60 border border-red-800"></div>
                                <span>Vùng trũng</span>
                            </div>
                            <div className="text-xs text-gray-400 leading-relaxed pl-5">Lớp radar các vùng trũng</div>
                        </div>

                        <div className="flex flex-col">
                            <div className="font-medium text-gray-200 text-sm flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 bg-orange-400 opacity-70 border border-orange-500"></div>
                                <span>Vùng ngập</span>
                            </div>
                            <div className="text-xs text-gray-400 leading-relaxed pl-5">Lớp radar các vùng ngập</div>
                        </div>
                    </div>
                </div>
            </div>
        </AppShell>
    );
}
