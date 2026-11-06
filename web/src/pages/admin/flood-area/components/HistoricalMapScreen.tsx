/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON as GeoJSONLayer, Polygon, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
    fetchHistoricalPoints,
    fetchHistoricalBuffers,
    fetchHistoricalRadar,
    type HistoricalFeatureCollection,
} from '../historicalMapService';
import { listAreas } from '../floodAreaService';
import { AREA_TYPE_LABEL, AREA_TYPE_COLOR, type FloodAreaItem } from '../floodAreaTypes';
import { formatAreaId } from '../areaId';

import { AppShell } from '../../../../components/layout/AppShell';
import { ADMIN_NAV } from '../../../../components/layout/navConfig';
import { AdminHeader } from '../../../../components/layout/AdminHeader';

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
const DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

type LayerKey = 'points' | 'buffers' | 'radar';

interface LayerState {
    status: 'loading' | 'ok' | 'error';
    data: HistoricalFeatureCollection | null;
    error: string | null;
}

const ALL_LAYERS: LayerKey[] = ['points', 'buffers', 'radar'];

const FETCHERS: Record<LayerKey, () => Promise<HistoricalFeatureCollection>> = {
    points: fetchHistoricalPoints,
    buffers: fetchHistoricalBuffers,
    radar: fetchHistoricalRadar,
};

const LAYER_LABEL: Record<LayerKey, string> = {
    points: 'Điểm ngập lịch sử',
    buffers: 'Vùng đệm tham khảo',
    radar: 'Vùng trũng',
};

const LOADING: LayerState = { status: 'loading', data: null, error: null };

// Đang tải / lỗi / đã tải (kể cả 0) — không dùng số mặc định
const countLabel = (s: LayerState) =>
    s.status === 'loading' ? 'đang tải…' : s.status === 'error' ? 'lỗi tải' : String(s.data?.features.length ?? 0);

export default function HistoricalMapScreen() {
    const [layers, setLayers] = useState<Record<LayerKey, LayerState>>({
        points: LOADING,
        buffers: LOADING,
        radar: LOADING,
    });

    const [areas, setAreas] = useState<FloodAreaItem[] | null>(null);
    const [areasError, setAreasError] = useState<string | null>(null);

    const mountedRef = useRef(true);

    // Tải từng lớp độc lập: lớp nào lỗi không ảnh hưởng lớp đã tải thành công
    const loadLayers = useCallback(async (keys: LayerKey[]) => {
        const results = await Promise.allSettled(keys.map((k) => FETCHERS[k]()));
        if (!mountedRef.current) return;
        setLayers((prev) => {
            const next = { ...prev };
            results.forEach((r, i) => {
                next[keys[i]] =
                    r.status === 'fulfilled'
                        ? { status: 'ok', data: r.value, error: null }
                        : {
                              status: 'error',
                              data: null,
                              error: r.reason instanceof Error ? r.reason.message : `${LAYER_LABEL[keys[i]]}: lỗi không xác định.`,
                          };
            });
            return next;
        });
    }, []);

    const loadAreas = useCallback(() => listAreas()
        .then((data) => { if (mountedRef.current) setAreas(data); })
        .catch((err: unknown) => {
            if (mountedRef.current) setAreasError(err instanceof Error ? err.message : 'Không tải được vùng Admin.');
        }), []);

    useEffect(() => {
        mountedRef.current = true;
        void loadLayers(ALL_LAYERS);
        void loadAreas();
        return () => { mountedRef.current = false; };
    }, [loadLayers, loadAreas]);

    const anyLoading = ALL_LAYERS.some((k) => layers[k].status === 'loading');
    const failedKeys = ALL_LAYERS.filter((k) => layers[k].status === 'error');

    const areasCount = areasError ? 'lỗi tải' : areas === null ? 'đang tải…' : String(areas.length);

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

                {/* Lỗi tải các lớp lịch sử: nêu rõ lớp nào lỗi, các lớp còn lại vẫn hiển thị */}
                {failedKeys.length > 0 && (
                    <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="font-semibold mb-1">
                                    Không tải được {failedKeys.length}/{ALL_LAYERS.length} lớp dữ liệu lịch sử. Các lớp còn lại vẫn được hiển thị.
                                </p>
                                <ul className="list-disc pl-5 text-xs space-y-0.5">
                                    {failedKeys.map((k) => (
                                        <li key={k}>{layers[k].error}</li>
                                    ))}
                                </ul>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setLayers((prev) => {
                                        const next = { ...prev };
                                        failedKeys.forEach((key) => { next[key] = LOADING; });
                                        return next;
                                    });
                                    void loadLayers(failedKeys);
                                }}
                                className="shrink-0 rounded border border-red-400/50 px-3 py-1 text-xs hover:bg-red-500/20"
                            >
                                Thử lại
                            </button>
                        </div>
                    </div>
                )}

                {/* Lỗi tải vùng ngập quản lý */}
                {areasError && (
                    <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-yellow-600/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
                        <span>Không tải được vùng ngập đã tạo: {areasError}</span>
                        <button
                            type="button"
                            onClick={() => { setAreasError(null); void loadAreas(); }}
                            className="shrink-0 rounded border border-yellow-500/50 px-3 py-1 text-xs hover:bg-yellow-500/20"
                        >
                            Thử lại
                        </button>
                    </div>
                )}

                <div className="w-full h-[550px] rounded-xl overflow-hidden relative z-0 border border-gray-800 shadow-md bg-[#1e293b]">
                    {anyLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-[#0f172a]/60 z-[1000] backdrop-blur-sm pointer-events-none">
                            <div className="flex flex-col items-center">
                                <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                                <span className="text-gray-300 font-medium">Đang tải dữ liệu bản đồ...</span>
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

                        {radarData && <GeoJSONLayer key={`radar-${radarData.features.length}`} data={radarData as any} style={radarStyle} />}
                        {buffersData && <GeoJSONLayer key={`buffers-${buffersData.features.length}`} data={buffersData as any} style={bufferStyle} />}
                        {pointsData && (
                            <GeoJSONLayer
                                key={`points-${pointsData.features.length}`}
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
                                <span>Điểm ngập lịch sử ({countLabel(layers.points)})</span>
                            </div>
                            <div className="text-xs text-gray-400 leading-relaxed pl-5">Các vị trí từng ghi nhận ngập (2015-2026).</div>
                        </div>

                        <div className="flex flex-col">
                            <div className="font-medium text-gray-200 text-sm flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 rounded-full bg-red-500 opacity-50 border border-red-500"></div>
                                <span>Vùng đệm tham khảo ({countLabel(layers.buffers)})</span>
                            </div>
                            <div className="text-xs text-gray-400 leading-relaxed pl-5">Vùng đệm nghiên cứu 220m và 450m. Không phải ranh giới ngập thực tế.</div>
                        </div>

                        <div className="flex flex-col">
                            <div className="font-medium text-gray-200 text-sm flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 bg-red-700 opacity-60 border border-red-800"></div>
                                <span>Vùng trũng ({countLabel(layers.radar)})</span>
                            </div>
                            <div className="text-xs text-gray-400 leading-relaxed pl-5">Lớp radar được nhóm quy ước hiển thị là vùng trũng; giữ nguyên dữ liệu tham khảo.</div>
                        </div>

                        <div className="flex flex-col">
                            <div className="font-medium text-gray-200 text-sm flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 bg-orange-400 opacity-70 border border-orange-500"></div>
                                <span>Vùng Admin ({areasCount})</span>
                            </div>
                            <div className="text-xs text-gray-400 leading-relaxed pl-5">Vàng: vùng ngập. Đỏ nhạt: vùng trũng, cùng màu lớp radar. Vùng chưa phân loại chưa được vẽ.</div>
                        </div>
                    </div>
                </div>
            </div>
        </AppShell>
    );
}
