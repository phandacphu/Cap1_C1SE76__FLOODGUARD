import { formatAreaAlertCount } from './mapAlertStatus';
import {
  fetchHistoricalBuffers,
  fetchHistoricalPoints,
  fetchHistoricalRadar,
} from '../admin/flood-area/historicalMapService';
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './floodMap.css';
import { floodAreaService, isValidFloodArea } from '../../api/floodAreaService';
import { useAuth } from '../../context/AuthContext';
import { AppShell } from '../../components/layout/AppShell';
import { AdminHeader } from '../../components/layout/AdminHeader';
import { RescueLayout } from '../../components/layout/RescueLayout';
import { ADMIN_NAV } from '../../components/layout/navConfig';
import type { FloodArea, FloodAlert } from '../../types/floodArea';

const AREA_STYLES = {
  flood: { stroke: '#ea580c', fill: '#9a3412', label: 'Vùng ngập', badge: 'bg-orange-950 text-orange-300' },
  low_lying: { stroke: '#2563eb', fill: '#1e40af', label: 'Vùng trũng', badge: 'bg-blue-950 text-blue-300' },
  unknown: { stroke: '#94a3b8', fill: '#475569', label: 'Chưa phân loại', badge: 'bg-slate-800 text-slate-300' },
};
const areaStyle = (area: FloodArea) => AREA_STYLES[area.areaType ?? 'unknown'];

const escapeHtml = (unsafe?: string | null): string => {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

type FilterStatus = 'all' | 'flood' | 'low_lying' | 'unknown';
const SEVERITY_LABELS = { low: 'Thấp', medium: 'Vừa', high: 'Cao', critical: 'Khẩn cấp' };
const SEVERITY_COLORS = { low: '#2563eb', medium: '#eab308', high: '#f97316', critical: '#ef4444' };
const PRIORITY = { low: 1, medium: 2, high: 3, critical: 4 };

export const FloodMapView: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const isRescue = user?.role === 'RESCUE_STAFF';
  const [showHistory, setShowHistory] = useState(true);
  const [historyRetry, setHistoryRetry] = useState(0);
  const [historyStatus, setHistoryStatus] = useState('');
  const mapTilerKey = (import.meta.env.VITE_MAPTILER_KEY ?? '').trim();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const polygonLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const historyLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const [floodAreas, setFloodAreas] = useState<FloodArea[]>([]);
  const [dataLoading, setDataLoading] = useState<boolean>(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const [selectedArea, setSelectedArea] = useState<FloodArea | null>(null);
  const [reloadTrigger, setReloadTrigger] = useState<number>(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const isStaleData = lastUpdated !== null && dataError !== null;
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [tileErrorCount, setTileErrorCount] = useState<number>(0);

  const [activeAlerts, setActiveAlerts] = useState<FloodAlert[]>([]);
  const [alertsUpdatedAt, setAlertsUpdatedAt] = useState<Date | null>(null);
  const [onlyWithAlerts, setOnlyWithAlerts] = useState(false);
  const adminAlertCount = alertsUpdatedAt ? activeAlerts.length : undefined;
  const alertsByArea = useMemo(() => {
    const groups = new Map<string, FloodAlert[]>();
    activeAlerts.forEach(alert => groups.set(alert.areaId, [...(groups.get(alert.areaId) ?? []), alert]));
    groups.forEach(items => items.sort((a, b) => PRIORITY[b.severity] - PRIORITY[a.severity]));
    return groups;
  }, [activeAlerts]);
  const [settledAlertRequest, setSettledAlertRequest] = useState<number | null>(null);
  const alertsLoading = settledAlertRequest !== reloadTrigger;
  const [alertCountError, setAlertCountError] = useState<string | null>(null);
  useEffect(() => {
    let ignore = false;
    void floodAreaService.getActiveAlerts(reloadTrigger > 0).then(alerts => {
      if (!ignore) { setActiveAlerts(alerts); setAlertsUpdatedAt(new Date()); setAlertCountError(null); }
    }).catch(() => {
      if (!ignore) setAlertCountError('Không tải được cảnh báo hiệu lực. Trạng thái cảnh báo của từng vùng chưa được xác nhận; thông tin cũ nếu có chỉ để tham khảo.');
    }).finally(() => {
      if (!ignore) setSettledAlertRequest(reloadTrigger);
    });
    return () => { ignore = true; };
  }, [reloadTrigger]);

  // Fetch API vùng ngập và quản lý trạng thái dữ liệu cũ (A.3, A.5)
  useEffect(() => {
    let ignore = false;

    const loadFloodAreas = async () => {
      try {
        const data = await floodAreaService.getFloodAreas(reloadTrigger > 0);
        if (!ignore) {
          setFloodAreas(data);
          setDataError(null);
          setLastUpdated(new Date());
        }
      } catch (err: unknown) {
        if (!ignore) {
          const errMsg = err instanceof Error ? err.message : 'Lỗi kết nối máy chủ API vùng ngập';
          setDataError(errMsg);

        }
      } finally {
        if (!ignore) {
          setDataLoading(false);
        }
      }
    };

    void loadFloodAreas();

    return () => {
      ignore = true;
    };
  }, [reloadTrigger]);

  const handleRetry = useCallback(() => {
    setDataLoading(true);
    // Keep stale/error labels until a successful refresh.

    setReloadTrigger((prev) => prev + 1);
  }, []);

  // Khởi tạo Leaflet Map chuẩn OpenStreetMap URL (A.4)
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const daNangCenter: L.LatLngExpression = [16.0544, 108.2022];
    const map = L.map(mapContainerRef.current, {
      center: daNangCenter,
      zoom: isRescue ? 13 : 12,
      zoomControl: true,
    });

    const tileLayer = mapTilerKey ? L.tileLayer(
      `https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=${encodeURIComponent(mapTilerKey)}`,
      {
        tileSize: 512,
        zoomOffset: -1,
        minZoom: 1,
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
        referrerPolicy: 'strict-origin-when-cross-origin',
      },
    ) : null;

    if (isRescue) {
      const pane = map.createPane('flood-history');
      pane.style.zIndex = '390';
      pane.style.pointerEvents = 'none';
    }

    tileLayerRef.current = tileLayer;
    const failedTiles = new Set<HTMLImageElement>();
    tileLayer?.on('tileerror', event => {
      failedTiles.add(event.tile as HTMLImageElement);
      setTileErrorCount(failedTiles.size);
    });
    tileLayer?.on('tileload', event => {
      failedTiles.delete(event.tile as HTMLImageElement);
      setTileErrorCount(failedTiles.size);
    });
    tileLayer?.on('tileunload', event => {
      failedTiles.delete(event.tile as HTMLImageElement);
      setTileErrorCount(failedTiles.size);
    });
    const retryTiles = () => { map.invalidateSize(); tileLayer?.redraw(); };
    window.addEventListener('online', retryTiles);

    tileLayer?.addTo(map);

    polygonLayerGroupRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(mapContainerRef.current);

    return () => {
      window.removeEventListener('online', retryTiles);
      observer.disconnect();
      tileLayer?.off();
      tileLayerRef.current = null;
      polygonLayerGroupRef.current = null;
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [mapTilerKey, isRescue]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !isRescue) return;

    const group = L.layerGroup();
    let cancelled = false;
    const layers = [
      ['Radar', fetchHistoricalRadar],
      ['Vùng đệm', fetchHistoricalBuffers],
      ['Điểm ngập', fetchHistoricalPoints],
    ] as const;

    void Promise.allSettled(layers.map(async ([, load]) => load())).then(results => {
      if (cancelled) return;

      const failed: string[] = [];
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          failed.push(layers[index][0]);
          return;
        }

        L.geoJSON(result.value as unknown as GeoJSON.FeatureCollection, {
          pane: 'flood-history',
          interactive: false,
          style: { color: '#ef4444', weight: 1.5, fillOpacity: 0.15 },
          pointToLayer: (_feature, position) => L.circleMarker(position, {
            pane: 'flood-history',
            interactive: false,
            radius: 7,
            color: '#fff',
            weight: 3,
            fillColor: '#ef4444',
            fillOpacity: 1,
          }),
        }).addTo(group);
      });

      setHistoryStatus(failed.length ? `Không tải được lớp: ${failed.join(', ')}.` : 'Đã tải dữ liệu lịch sử.');
    });

    // Keep the fetched layers when the user toggles their visibility.
    map.addLayer(group);
    historyLayerRef.current = group;
    return () => {
      cancelled = true;
      map.removeLayer(group);
      historyLayerRef.current = null;
    };
  }, [isRescue, historyRetry, mapTilerKey]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = historyLayerRef.current;
    if (!map || !group) return;

    if (showHistory) map.addLayer(group);
    else map.removeLayer(group);
  }, [showHistory, historyRetry, isRescue, mapTilerKey]);

  // Filter current areaType classification, independently of warning severity.
  const filteredAreas = useMemo(() => {
    const classified = floodAreas.filter(area => statusFilter === 'all' ||
      (statusFilter === 'unknown' ? area.areaType == null : area.areaType === statusFilter));
    return onlyWithAlerts && !alertsLoading ? classified.filter(area => alertsByArea.has(area.id)) : classified;
  }, [floodAreas, statusFilter, onlyWithAlerts, alertsByArea, alertsLoading]);

  // Vẽ Polygons kiểm tra chặt chẽ geometry (A.2, A.5)
  const renderPolygons = useCallback(() => {
    if (!mapInstanceRef.current || !polygonLayerGroupRef.current) return;

    polygonLayerGroupRef.current.clearLayers();
    const bounds: L.LatLngExpression[] = [];

    filteredAreas.forEach((area) => {
      if (isValidFloodArea(area)) {
        const validPoints = area.geometry.points;

        const latLngs: L.LatLngExpression[] = validPoints.map((pt) => {
          const point: [number, number] = [pt.latitude, pt.longitude];
          bounds.push(point);
          return point;
        });

        const colorCfg = areaStyle(area);
        const isAreaActive = area.areaType != null;
        const areaAlerts = alertsByArea.get(area.id) ?? [];
        const highestAlert = areaAlerts[0];
        const alertMarkup = alertsLoading ? '<p>Đang tải cảnh báo</p>' : areaAlerts.length ? areaAlerts.map(alert => `
          <hr/><b>${escapeHtml(alert.title)}</b><br/>
          <b>Mức độ:</b> ${SEVERITY_LABELS[alert.severity]}<br/>
          <b>Trạng thái:</b> ${alertCountError ? 'Dữ liệu cảnh báo cũ, chưa xác nhận' : 'Có hiệu lực tại lần tải'}<br/>
          <b>Từ:</b> ${escapeHtml(new Date(alert.startAt).toLocaleString('vi-VN'))}<br/>
          <b>Đến:</b> ${escapeHtml(new Date(alert.endAt).toLocaleString('vi-VN'))}<br/>
          <p>${escapeHtml(alert.content)}</p>`).join('') :
          `<p>${alertCountError ? 'Chưa xác nhận được cảnh báo của vùng.' : 'Không có cảnh báo hiệu lực tại lần tải.'}</p>`;

        const polygon = L.polygon(latLngs, {
          color: highestAlert && !alertCountError && !alertsLoading ? SEVERITY_COLORS[highestAlert.severity] : colorCfg.stroke,
          weight: isAreaActive ? 2.5 : 1.5,
          dashArray: isAreaActive ? undefined : '5, 5',
          opacity: isAreaActive ? 0.95 : 0.4,
          fillColor: colorCfg.fill,
          fillOpacity: isAreaActive ? 0.4 : 0.12,
        });

        const safeName = escapeHtml(area.name);
        const safeSource = escapeHtml(area.source || 'Hệ thống FloodGuard');
        const safeDesc = escapeHtml(area.description || 'Không có mô tả chi tiết');

        const popupContent = `
          <div style="color: #0f172a; font-family: ui-monospace, monospace; padding: 4px; font-size: 11px; line-height: 1.5;">
            <b style="font-size: 12px; color: ${isAreaActive ? '#0284c7' : '#64748B'};">${safeName}</b><br/>
            <b>Loại vùng:</b> ${colorCfg.label} (${escapeHtml(area.areaType ?? 'unknown')})<br/>
            <span>Dữ liệu tham khảo, không xác nhận ngập hiện tại.</span><br/>
            <b>Nguồn tin:</b> ${safeSource}<br/>
            <p style="margin: 4px 0 0 0; color: #475569;">${safeDesc}</p>
            ${alertMarkup}
          </div>
        `;

        polygon.bindPopup(popupContent);
        polygon.on('click', () => setSelectedArea(area));
        polygonLayerGroupRef.current?.addLayer(polygon);
      }
    });

    if (!(isRescue && showHistory) && bounds.length > 0 && mapInstanceRef.current) {
      // Avoid letting a remote test polygon zoom the initial view out to the whole world.
      const first = filteredAreas[0];
      if (first) mapInstanceRef.current.fitBounds(first.geometry.points.map(p => [p.latitude, p.longitude] as [number, number]), { padding: [24, 24], maxZoom: 14 });
    }
  }, [filteredAreas, alertsByArea, alertCountError, alertsLoading, isRescue, showHistory]);

  useEffect(() => {
    if (mapInstanceRef.current) {
      renderPolygons();
    }
  }, [renderPolygons]);

  const floodCount = floodAreas.filter(a => a.areaType === 'flood').length;
  const lowLyingCount = floodAreas.filter(a => a.areaType === 'low_lying').length;

  const mapContent = (
    <div className="w-full space-y-4 font-sans text-slate-100 pb-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-[#1E3A5F]/40 pb-3">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-lg font-bold font-mono tracking-tight text-white uppercase">
              Bản Đồ Vùng Ngập (MapTiler)
            </h1>
            {isStaleData && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950/80 border border-amber-600 text-amber-300">
                ⚠️ Dữ liệu lưu tạm (Tải lại chưa thành công)
              </span>
            )}
          </div>
          <p className="text-xs font-mono text-slate-400 mt-0.5">
            Vùng ngập tham khảo từ hệ thống. Phân loại vùng không xác nhận ngập theo thời gian thực.
          </p>
        </div>

        {/* Bộ lọc trạng thái vùng ngập (A.2) */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-[#081B30] border border-[#1E3A5F] rounded-lg p-0.5 text-xs font-mono">
            <button
              onClick={() => setStatusFilter('flood')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                statusFilter === 'flood' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Vùng ngập ({floodCount})
            </button>
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                statusFilter === 'all' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Tất cả ({floodAreas.length})
            </button>
            <button
              onClick={() => setStatusFilter('low_lying')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                statusFilter === 'low_lying' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Vùng trũng ({lowLyingCount})
            </button>
            <button onClick={() => setStatusFilter('unknown')} className={`px-2.5 py-1 rounded-md ${statusFilter === 'unknown' ? 'bg-slate-600 text-white' : 'text-slate-400'}`}>
              Chưa phân loại ({floodAreas.filter(area => area.areaType == null).length})
            </button>
          </div>

          <div className="flex gap-3 text-xs text-slate-300" aria-label="Chú giải">
            <span>🟠 Vùng ngập</span><span>🔵 Vùng trũng</span><span>⚪ Chưa phân loại</span>
          </div>
        </div>
      </div>

      {alertsLoading && <p role="status" className="text-xs text-slate-400">Đang tải cảnh báo</p>}
      {!alertsLoading && alertsUpdatedAt && <p className="text-xs text-slate-400">Cảnh báo tải lúc: {alertsUpdatedAt.toLocaleString('vi-VN')} — Viền màu thể hiện mức độ cảnh báo khi tải thành công; màu nền thể hiện loại vùng.</p>}
      {alertCountError && <p role="status" className="text-amber-300 text-xs">{alertCountError}</p>}
      <label className="flex items-center gap-2 text-xs text-cyan-200">
        <input type="checkbox" checked={onlyWithAlerts} disabled={alertsLoading} onChange={event => setOnlyWithAlerts(event.target.checked)} />
        {alertCountError ? 'Chỉ vùng có cảnh báo trong dữ liệu lưu tạm' : 'Chỉ vùng có cảnh báo hiệu lực tại lần tải'}
      </label>
      {isRescue && (
        <div className="space-y-1 rounded-lg border border-slate-700 p-3 text-xs">
          <label className="flex items-center gap-2 font-semibold text-rose-300">
            <input type="checkbox" checked={showHistory} onChange={event => setShowHistory(event.target.checked)} />
            Hiện bản đồ ngập lịch sử
          </label>
          {showHistory && (
            <>
              <p className="text-slate-300">Lớp đỏ: điểm ngập, vùng đệm và vùng radar lịch sử. Dữ liệu tham khảo, không xác nhận ngập hiện tại.</p>
              <p role="status" className="text-slate-400">{historyStatus || 'Đang tải lớp ngập lịch sử…'}</p>
              {historyStatus.startsWith('Không tải') && (
                <button type="button" className="underline" onClick={() => {
                  setHistoryStatus('');
                  setHistoryRetry(value => value + 1);
                }}>Tải lại lớp lịch sử</button>
              )}
            </>
          )}
        </div>
      )}
      {lastUpdated && <p className="text-xs text-slate-400">Dữ liệu tải lúc: {lastUpdated.toLocaleString('vi-VN')}</p>}
      {/* Thông báo lỗi API và cảnh báo dữ liệu cũ (A.3) */}
      {dataError && (
        <div className="bg-rose-950/60 border border-rose-700 p-3.5 rounded-lg text-rose-200 text-xs font-mono flex items-center justify-between shadow-lg">
          <div>
            <span className="font-bold">⚠️ [LỖI KẾT NỐI API]: </span>
            <span>{dataError}</span>
            {isStaleData && (
              <span className="block text-amber-300 mt-0.5 text-[11px]">
                Lưu ý: Các đa giác hiển thị bên dưới là bản sao lưu tạm thời từ lần tải thành công trước, không phản ánh hiện trạng mới nhất.
              </span>
            )}
          </div>
          <button
            onClick={handleRetry}
            disabled={dataLoading}
            className="px-3 py-1.5 bg-rose-900/90 hover:bg-rose-800 rounded text-xs font-mono border border-rose-500 transition-colors whitespace-nowrap ml-3"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Cảnh báo khi Tile OpenStreetMap không tải được (A.4) */}
      {(!mapTilerKey || tileErrorCount > 0) && (
        <div className="bg-amber-950/50 border border-amber-600/70 p-2.5 rounded-lg text-amber-200 text-xs font-mono flex items-center justify-between">
          <span>{!mapTilerKey ? '⚠️ Chưa cấu hình VITE_MAPTILER_KEY trong web/.env.local. Hãy thêm key và khởi động lại npm run dev.' : '⚠️ Một số mảnh bản đồ nền MapTiler không tải được. Vui lòng kiểm tra mạng, API key và hạn mức sử dụng.'}</span>
          <button
            onClick={() => {
              if (mapInstanceRef.current) {
                mapInstanceRef.current.invalidateSize();
                tileLayerRef.current?.redraw();
                // Failed tiles stay flagged until replaced or successfully loaded.
              }
            }}
            className="px-2 py-0.5 bg-amber-900 rounded border border-amber-500 text-[11px]"
          >
            Nạp lại map
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 bg-[#081B30] border border-[#1E3A5F] rounded-xl overflow-hidden relative min-h-[560px] shadow-lg">
          {dataLoading && (
            <div className="absolute inset-0 bg-[#081B30]/90 z-20 flex flex-col items-center justify-center space-y-2 font-mono text-xs text-cyan-400">
              <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
              <span>Đang tải dữ liệu vùng ngập và khởi tạo bản đồ MapTiler...</span>
            </div>
          )}
          <div ref={mapContainerRef} className="floodguard-map w-full h-[560px] z-0" />
        </div>

        <div className="bg-[#081B30] border border-[#1E3A5F] rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between border-b border-[#1E3A5F]/40 pb-2">
              <span className="text-xs font-bold font-mono text-cyan-300 uppercase">Danh sách vùng ({filteredAreas.length})</span>
              <span className="text-[10px] font-mono text-slate-400">
                {statusFilter === 'flood' ? 'Vùng ngập' : statusFilter === 'low_lying' ? 'Vùng trũng' : statusFilter === 'unknown' ? 'Chưa phân loại' : 'Tất cả'}
              </span>
            </div>

            <div className="space-y-2 mt-3 max-h-[460px] overflow-y-auto pr-1">
              {filteredAreas.length === 0 && !dataLoading && (
                <div className="text-xs font-mono text-slate-400 text-center py-10">
                  {dataError && !isStaleData ? 'Không thể nạp dữ liệu từ máy chủ.' : 'Không có vùng ngập nào trong bộ lọc này.'}
                </div>
              )}
              {filteredAreas.map((area) => {
                const cfg = areaStyle(area);
                const isSelected = selectedArea?.id === area.id;
                const isAreaActive = area.areaType != null;

                return (
                  <div
                    key={area.id}
                    onClick={() => {
                      setSelectedArea(area);
                      mapInstanceRef.current?.fitBounds(area.geometry.points.map(p => [p.latitude, p.longitude] as [number, number]), { padding: [24, 24], maxZoom: 15 });
                    }}
                    className={`p-2.5 rounded-lg border text-xs font-mono cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#122B48] border-cyan-400 text-white shadow-md'
                        : isAreaActive
                        ? 'bg-[#051424] border-[#1E3A5F]/60 text-slate-300 hover:border-slate-500'
                        : 'bg-[#040f1a]/60 border-slate-700/40 text-slate-400 opacity-75 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-semibold truncate ${!isAreaActive ? 'text-slate-400' : ''}`}>{area.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${isAreaActive ? cfg.badge : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-amber-200">
                      {formatAreaAlertCount(alertsLoading, alertCountError ? null : (alertsByArea.get(area.id)?.length ?? 0))}
                    </p>
                    <div className="text-[10px] font-mono mt-1 flex items-center justify-between">
                      <span className={isAreaActive ? 'text-emerald-400' : 'text-slate-500'}>
                        {cfg.label}
                      </span>
                      <span className="text-slate-500 truncate max-w-[100px]">{area.source || 'Chưa rõ nguồn'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-[#1E3A5F]/40 pt-3 mt-3 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Vùng đa giác từ API</span>
            <button
              onClick={handleRetry}
            disabled={dataLoading}
              className="hover:text-cyan-400 underline"
            >
              Làm mới
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (!isAdmin) {
    return (
      <RescueLayout
        loading={dataLoading}
        onRefresh={handleRetry}
        updatedAt={lastUpdated}
      >
        {mapContent}
      </RescueLayout>
    );
  }

  return (
    <AppShell
      nav={ADMIN_NAV}
      brandSub="COMMAND C4I"
      brandTag="ADMIN"
      roleLabel="QUẢN TRỊ VIÊN C4I"
      accent="water"
      header={<AdminHeader alertCount={alertsLoading || alertCountError ? undefined : adminAlertCount} title="Bản đồ trực quan" />}
    >
      {mapContent}
    </AppShell>
  );
};

export default FloodMapView;
