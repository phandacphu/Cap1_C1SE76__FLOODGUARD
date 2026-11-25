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
import { historicalDescriptionLines } from '../historicalDescription';
import { mapGpsPin } from '../../mapGpsPin';

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
const historicalPointIcon = mapGpsPin('red');

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
        setAreasError(null);
        void listAreas().then((data) => {
            if (mountedRef.current && areaRequestRef.current === request) setAreas(data);
        }).catch((err: unknown) => {
            if (mountedRef.current && areaRequestRef.current === request) {
                setAreasError(err instanceof Error ? err.message : 'Không tải được vùng Admin.');
            }
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
            header={<AdminHeader alertCount={0} title="Bản đồ trực quan" />}
        >
            <div className="mx-auto max-w-[1500px] space-y-5">
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
                                      ${historicalDescriptionLines(props.description).map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
                                      <em>Dữ liệu lịch sử tham khảo, không phải cảnh báo hiện tại.</em>
                                    </div>`);
                                }}
                            />
                        )}
                        {pointsData && (
                            <GeoJSONLayer
                                key={`points-${layers.points.version}`}
                                data={pointsData as any}
                                pointToLayer={(_feature: any, latlng: any) => L.marker(latlng, { icon: historicalPointIcon })}
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
                                                    ${historicalDescriptionLines(feature.properties.description).length > 0 ? `
                                                      <div style="padding-top: 6px; font-size: 12px; line-height: 1.5; color: #334155;">
                                                        <strong>Mô tả ngập:</strong>
                                                        ${historicalDescriptionLines(feature.properties.description).map((line) => `<p style="margin: 4px 0 0;">${escapeHtml(line)}</p>`).join('')}
                                                      </div>` : ''}
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
                                    {historicalDescriptionLines(a.description).map((line, index) => (
                                        <p key={index} style={{ fontSize: 12, margin: '4px 0 0' }}>{line}</p>
                                    ))}
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
                                <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 32">
                                    <path d="M12 30S2 19.5 2 12a10 10 0 0 1 20 0c0 7.5-10 18-10 18Z" fill="#dc2626" stroke="#fff" strokeWidth="1.7" />
                                    <circle cx="12" cy="12" r="4" fill="#fff" />
                                </svg>
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
