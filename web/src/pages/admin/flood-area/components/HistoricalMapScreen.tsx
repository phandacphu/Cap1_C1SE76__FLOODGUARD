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

// References verified on public websites. They document flooding in Da Nang,
// but are NOT proof that a particular API feature came from those publications.
const HISTORICAL_REFERENCES = [
    {
        label: 'Bản đồ mưa ngập Đà Nẵng (IOC)',
        url: 'https://muangap.danang.gov.vn/',
    },
    {
        label: 'Thông tin về bản đồ số và vết lũ Đà Nẵng (Cục Quản lý đê điều)',
        url: 'https://phongchongthientai.mard.gov.vn/Pages/da-nang-xay-dung-ban-do-so-phuc-vu-ung-pho-lu-lut.aspx',
    },
] as const;

const externalHttpUrl = (value: unknown): string | null => {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
    } catch {
        return null;
    }
};

const historicalPopup = (feature: any, layerLabel: string): string => {
    const props: Record<string, unknown> = feature?.properties &&
        typeof feature.properties === 'object' && !Array.isArray(feature.properties)
        ? feature.properties : {};

    const field = (key: string): string | null => {
        const value = props[key];
        return typeof value === 'string' && value.trim() ? value.trim() : null;
    };
    const row = (label: string, value: string | null) => value
        ? `<div style="margin-top:4px"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>`
        : '';

    const point = feature?.geometry?.type === 'Point' ? feature.geometry.coordinates : null;
    const coordinates = Array.isArray(point) && point.length >= 2 &&
        typeof point[0] === 'number' && Number.isFinite(point[0]) &&
        typeof point[1] === 'number' && Number.isFinite(point[1])
        ? `${point[1].toFixed(5)}, ${point[0].toFixed(5)}` : null;

    const sourceUrl = externalHttpUrl(props.source_url);
    const sourceLink = sourceUrl
        ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">Mở nguồn riêng do API cung cấp</a>`
        : '<span>API chưa cung cấp liên kết nguồn riêng.</span>';
    const references = HISTORICAL_REFERENCES.map((ref) =>
        `<div style="margin-top:4px"><a href="${escapeHtml(ref.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(ref.label)}</a></div>`
    ).join('');

    return `<div style="font-family:system-ui,sans-serif;font-size:12px;line-height:1.5;color:#0f172a;min-width:240px;max-width:300px;max-height:300px;overflow-y:auto">
        <strong style="font-size:14px;display:block;margin-bottom:5px">${escapeHtml(field('name') ?? layerLabel)}</strong>
        ${row('Loại lớp', layerLabel)}
        ${row('Mã dữ liệu', field('id'))}
        ${row('Tọa độ (vĩ độ, kinh độ)', coordinates)}
        ${row('Giai đoạn', field('data_period'))}
        ${row('Tình trạng tọa độ', field('coordinate_status'))}
        ${row('Nguồn ghi trong API', field('source'))}
        ${row('Mô tả', field('description'))}
        <div style="border-top:1px solid #cbd5e1;margin-top:8px;padding-top:6px">
            <strong>Nguồn chi tiết:</strong><div>${sourceLink}</div>
        </div>
        <div style="border-top:1px solid #cbd5e1;margin-top:8px;padding-top:6px">
            <strong>Tài liệu tham khảo công khai tại Đà Nẵng:</strong>${references}
            <div style="font-size:11px;color:#475569;margin-top:6px">Các tài liệu tham khảo chung không xác nhận tọa độ hoặc ranh giới riêng của đối tượng này.</div>
        </div>
    </div>`;
};

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

const LOADING: LayerState = { status: 'loading', data: null, error: null, version: 0 };

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
    const [areasLoading, setAreasLoading] = useState(true);

    const mountedRef = useRef(false);
    const layerRequestsRef = useRef<Record<LayerKey, number>>({ points: 0, buffers: 0, radar: 0 });
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
    const areasCount = areasLoading && areas === null ? 'đang tải…'
        : areasError && areas === null ? 'lỗi tải'
        : String(areas?.length ?? 0);

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
                        onClick={loadAreas}
                        disabled={areasLoading}
                        className="rounded border border-blue-400/50 px-3 py-1.5 text-xs text-blue-200 hover:bg-blue-500/20 disabled:opacity-50"
                    >
                        {areasLoading ? 'Đang làm mới vùng…' : 'Làm mới vùng Admin'}
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

                        {radarData && (
                            <GeoJSONLayer
                                key={`radar-${layers.radar.version}`}
                                data={radarData as any}
                                style={radarStyle}
                                onEachFeature={(feature: any, layer: any) => {
                                    layer.bindPopup(historicalPopup(feature, 'Vùng trũng (lớp radar tham khảo)'));
                                }}
                            />
                        )}
                        {buffersData && (
                            <GeoJSONLayer
                                key={`buffers-${layers.buffers.version}`}
                                data={buffersData as any}
                                style={bufferStyle}
                                onEachFeature={(feature: any, layer: any) => {
                                    layer.bindPopup(historicalPopup(feature, 'Vùng đệm điểm ngập lịch sử (tham khảo)'));
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
                                    layer.bindPopup(historicalPopup(feature, 'Điểm ngập lịch sử'));
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
