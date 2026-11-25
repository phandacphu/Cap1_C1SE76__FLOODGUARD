import { createFloodMapCanvas } from './floodMapCanvas';
import { Link, useSearchParams } from 'react-router-dom';
import { drawPublishedFloodZones } from './publishedFloodLayers';
import { useWarnings } from '../rescue/warnings/WarningContext';
import { useWarningResource } from '../rescue/warnings/useWarningResource';
import { WarningFeedback } from '../rescue/warnings/WarningFeedback';
import { ZoneCoverageNotice } from '../rescue/warnings/ZoneCoverageNotice';
import { warningTime, zoneMetadataRows } from '../rescue/warnings/warningData';
import { floodWarningApi } from '../admin/flood-warning/floodWarningApi';
import '../rescue/warnings/rescueWarnings.css';
import { historicalPointIndex, historicalPopupHtml } from './historicalDetails';
import { AREA_TYPE_COLOR, AREA_TYPE_LABEL } from '../admin/flood-area/floodAreaTypes';
import { historicalFloodIcon } from './historicalFloodIcon';
import { useHistoricalLayers } from './useHistoricalLayers';
import type { HistoricalLayerKey } from '../admin/flood-area/historicalMapService';
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
import type { FloodArea } from '../../types/floodArea';

const AREA_STYLES = {
  flood: { stroke: AREA_TYPE_COLOR.flood, fill: AREA_TYPE_COLOR.flood, label: AREA_TYPE_LABEL.flood, badge: 'bg-yellow-950 text-yellow-300' },
  low_lying: { stroke: AREA_TYPE_COLOR.low_lying, fill: AREA_TYPE_COLOR.low_lying, label: AREA_TYPE_LABEL.low_lying, badge: 'bg-red-950 text-red-300' },
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
// Keep the original visual map for both roles. Remount when account or map entry changes.
type FloodMapViewProps = { embedded?: boolean };

export const FloodMapView: React.FC<FloodMapViewProps> = ({ embedded = false }) => {
  const { user, token } = useAuth();
  const [params] = useSearchParams();
  const warningId = user?.role === 'RESCUE_STAFF' ? params.get('warning') : null;
  const showOnEntry = user?.role === 'RESCUE_STAFF' && (embedded || Boolean(warningId) || params.get('showZones') === '1');
  return <FloodMapContent key={JSON.stringify([user?.id, user?.role, token, warningId, showOnEntry])} warningId={warningId} showOnEntry={showOnEntry} embedded={embedded} />;
};

const FloodMapContent: React.FC<{ warningId: string | null; showOnEntry: boolean; embedded: boolean }> = ({ warningId, showOnEntry, embedded }) => {
  const { user, token } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const isRescue = user?.role === 'RESCUE_STAFF';
  const [showRegions, setShowRegions] = useState(showOnEntry);
  const { source, identity, list: rescueAlerts } = useWarnings();
  const mapTilerKey = (import.meta.env.VITE_MAPTILER_KEY ?? '').trim();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const polygonLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const [floodAreas, setFloodAreas] = useState<FloodArea[]>([]);
  const [dataLoading, setDataLoading] = useState<boolean>(!isRescue);
  const [dataError, setDataError] = useState<string | null>(null);

  const [selectedArea, setSelectedArea] = useState<FloodArea | null>(null);
  const [reloadTrigger, setReloadTrigger] = useState<number>(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const isStaleData = lastUpdated !== null && dataError !== null;
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [tileErrorCount, setTileErrorCount] = useState<number>(0);

  // V2 alerts apply to all published zones, never to one polygon.
  const loadAdminAlerts = useCallback(() => floodWarningApi.list('active'), []);
  const adminAlerts = useWarningResource(
    isAdmin && token && user ? JSON.stringify([token, user.id, user.role]) : '',
    loadAdminAlerts,
    reloadTrigger,
  );
  const alerts = isRescue ? rescueAlerts : adminAlerts;
  const refreshRescueAlerts = rescueAlerts.refresh;
  const adminAlertCount = alerts.data?.length;
  const loadZones = useCallback((signal: AbortSignal) => source.zones(signal), [source]);
  const zones = useWarningResource(isRescue ? identity : '', loadZones, reloadTrigger);
  const bundle = zones.data;
  const showHistory = isRescue && showRegions && !source.demo && bundle !== null && zones.errorStatus !== 401 && zones.errorStatus !== 403;
  const historyKeys: HistoricalLayerKey[] = isRescue && showHistory
    ? ['points', 'buffers'] : [];
  const historyLayers = useHistoricalLayers(historyKeys, String(reloadTrigger));


  // Fetch API vùng ngập và quản lý trạng thái dữ liệu cũ (A.3, A.5)
  useEffect(() => {
    if (!isAdmin) return;
    let ignore = false;

    const loadFloodAreas = async () => {
      try {
        const { value: data, fetchedAt } = await floodAreaService.getFloodAreasSnapshot(reloadTrigger > 0);
        if (!ignore) {
          setFloodAreas(data);
          setDataError(null);
          setLastUpdated(new Date(fetchedAt));
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
  }, [reloadTrigger, isAdmin]);

  const handleRetry = useCallback(() => {
    if (isAdmin) setDataLoading(true);
    if (isRescue) refreshRescueAlerts();
    setReloadTrigger((prev) => prev + 1);
  }, [isAdmin, isRescue, refreshRescueAlerts]);

  // Khởi tạo Leaflet Map chuẩn OpenStreetMap URL (A.4)
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const canvas = createFloodMapCanvas(mapContainerRef.current, {
      mapTilerKey, zoom: isRescue ? 13 : 12, historyPanes: isRescue,
      onTileErrorCount: setTileErrorCount,
    });
    if (isRescue) {
      for (const [group, order] of [
        ['low_lying', '395'], ['historical_flood', '410'], ['current_flood', '420'],
      ]) {
        canvas.map.createPane(`warning-${group}`).style.zIndex = order;
      }
    }
    tileLayerRef.current = canvas.tileLayer;
    polygonLayerGroupRef.current = canvas.polygons;
    mapInstanceRef.current = canvas.map;
    return () => {
      tileLayerRef.current = null;
      polygonLayerGroupRef.current = null;
      mapInstanceRef.current = null;
      canvas.dispose();
    };
  }, [mapTilerKey, isRescue]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !isRescue || !showHistory) return;
    const group = L.layerGroup().addTo(map);
    const keys: HistoricalLayerKey[] = ['points', 'buffers'];
    const pointIndex = historicalPointIndex(historyLayers.points?.snapshot?.data);
    keys.forEach(key => {
      const data = historyLayers[key]?.snapshot?.data;
      if (!data) return;
      L.geoJSON(data as unknown as GeoJSON.FeatureCollection, {
        pane: key === 'points' ? 'hist-points' : 'flood-history', interactive: key === 'points',
        style: () => {
          // Buffer is a visual reference only, never a V2 boundary.
          const color = AREA_TYPE_COLOR.low_lying;
          return { color, fillColor: color, weight: 2, opacity: 0.75, fillOpacity: 0.08, dashArray: '3 5' };
        },
        pointToLayer: (_feature, position) => L.marker(position, { pane: 'hist-points', interactive: true, icon: historicalFloodIcon }),
        onEachFeature: (feature, layer) => {
          if (key !== 'points') return;
          layer.bindPopup(historicalPopupHtml(
            feature as import('../admin/flood-area/historicalMapService').HistoricalFeature,
            pointIndex, Boolean(historyLayers[key]?.error),
            historyLayers[key]!.snapshot!.fetchedAt,
          ), { maxWidth: 360, maxHeight: 320 });
        },
      }).addTo(group);
    });
    return () => { map.removeLayer(group); };
  }, [isRescue, showHistory, historyLayers, mapTilerKey]);

  const filteredAreas = useMemo(() => floodAreas.filter(area => statusFilter === 'all' ||
    (statusFilter === 'unknown' ? area.areaType == null : area.areaType === statusFilter)), [floodAreas, statusFilter]);

  // Vẽ Polygons kiểm tra chặt chẽ geometry (A.2, A.5)
  const renderPolygons = useCallback(() => {
    if (!mapInstanceRef.current || !polygonLayerGroupRef.current) return;

    polygonLayerGroupRef.current.clearLayers();
    if (isRescue) {
      if (bundle && showRegions) {
        drawPublishedFloodZones(mapInstanceRef.current, polygonLayerGroupRef.current, bundle, true);
      } else {
        mapInstanceRef.current.closePopup();
      }
      return;
    }
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
        const polygon = L.polygon(latLngs, {
          color: colorCfg.stroke,
          weight: isAreaActive ? 2.5 : 1.5,
          dashArray: isAreaActive ? undefined : '5, 5',
          opacity: isAreaActive ? 0.95 : 0.4,
          fillColor: colorCfg.fill,
          fillOpacity: isAreaActive ? 0.4 : 0.12,
        });

        const safeName = escapeHtml(area.name);
        const safeSource = escapeHtml(area.source || 'Chưa rõ nguồn');
        const safeDesc = escapeHtml(area.description || 'Không có mô tả chi tiết');

        const popupContent = `
          <div style="color: #0f172a; font-family: ui-monospace, monospace; padding: 4px; font-size: 11px; line-height: 1.5;">
            <b style="font-size: 12px; color: ${isAreaActive ? '#0284c7' : '#64748B'};">${safeName}</b><br/>
            <b>Loại vùng:</b> ${colorCfg.label} (${escapeHtml(area.areaType ?? 'unknown')})<br/>
            <span>Dữ liệu tham khảo, không xác nhận ngập hiện tại.</span><br/>
            <b>Nguồn tin:</b> ${safeSource}<br/>
            <p style="margin: 4px 0 0 0; color: #475569;">${safeDesc}</p>
            <p>Bản tin V2 có phạm vi chung, không gắn riêng với vùng này.</p>
          </div>
        `;

        polygon.bindPopup(popupContent);
        polygon.on('click', () => setSelectedArea(area));
        polygonLayerGroupRef.current?.addLayer(polygon);
      }
    });

    if (bounds.length > 0 && mapInstanceRef.current) {
      // Avoid letting a remote test polygon zoom the initial view out to the whole world.
      const first = filteredAreas[0];
      if (first) mapInstanceRef.current.fitBounds(first.geometry.points.map(p => [p.latitude, p.longitude] as [number, number]), { padding: [24, 24], maxZoom: 14 });
    }
  }, [filteredAreas, isRescue, showRegions, bundle]);

  useEffect(() => {
    if (mapInstanceRef.current) {
      renderPolygons();
    }
  }, [renderPolygons, mapTilerKey]);


  const mapLegend = (
          <div className="flex flex-wrap gap-3 text-xs text-slate-300" aria-label="Chú giải">
            <span>{isRescue ? '🟡 Ngập hiện tại (vùng công bố)' : '🟡 Vùng ngập'}</span><span>🔴 Vùng trũng</span>
            {isRescue && <span><svg width="12" height="16" viewBox="0 0 24 32" aria-hidden="true" className="inline"><path d="M12 30C9 25 2 17 2 11a10 10 0 0 1 20 0c0 6-7 14-10 19Z" fill={AREA_TYPE_COLOR.low_lying} stroke="white" strokeWidth="2"/><circle cx="12" cy="11" r="3.5" fill="white"/></svg> Ngập lịch sử (viền đỏ nét đứt / marker)</span>}
            {isRescue && showHistory && <span>Viền đỏ chấm: vùng đệm tham khảo</span>}
          </div>
  );

  const mapContent = (
    <div className="w-full space-y-4 font-sans text-slate-100 pb-6">
      {isAdmin && (
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-[#1E3A5F]/40 pb-3">
        {/* Bộ lọc trạng thái vùng ngập (A.2) */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-[#081B30] border border-[#1E3A5F] rounded-lg p-0.5 text-xs font-mono">
            {([['all', 'Tất cả'], ['flood', 'Vùng ngập'], ['low_lying', 'Vùng trũng']] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={statusFilter === value}
                onClick={() => setStatusFilter(value)}
                className={`px-2.5 py-1 rounded-md transition-colors ${statusFilter === value ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>


        </div>
      </div>

      )}

      {isRescue ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-[#1E3A5F] bg-[#081B30] px-4 py-3">
          <button type="button" aria-pressed={showRegions}
            onClick={() => setShowRegions(value => !value)}
            className={`rounded-lg border px-4 py-2 text-sm font-semibold ${showRegions ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300' : 'border-slate-600 text-slate-200'}`}>
            Vùng ngập
          </button>
          {mapLegend}
          {showRegions && historyKeys.some(key => !historyLayers[key]?.snapshot && !historyLayers[key]?.error) && <span role="status" className="text-xs text-slate-400">Đang tải lớp lịch sử…</span>}
          {showRegions && historyKeys.filter(key => historyLayers[key]?.error).map(key => <p key={key} role="status" className="text-xs text-amber-300">{({ points: 'Điểm lịch sử', areas: 'Đa giác HIST', buffers: 'Vùng đệm', radar: 'Radar' })[key]}: {historyLayers[key]?.error}</p>)}
          {source.demo && <p className="text-xs text-amber-300">Dữ liệu vùng mẫu; không phải hiện trạng thực tế. Marker và buffer nguồn thật không được trộn vào fixture.</p>}
        </div>
      ) : null}
      {warningId && isRescue && (
        <div className="rounded-lg border border-[#1E3A5F] bg-[#081B30] p-3 text-xs text-slate-300">
          Đang xem bộ vùng hiện tại, không phải ảnh chụp tại thời điểm phát hoặc tắt bản tin. Phạm vi áp dụng chung, không gắn với một polygon riêng.{' '}
          <Link className="text-cyan-300 underline" to={`/rescue/flood-warnings/${encodeURIComponent(warningId)}`}>Quay lại chi tiết bản tin</Link>
        </div>
      )}
      <div className="text-xs text-slate-300 space-y-1">
        <WarningFeedback resource={alerts} noun="bản tin đang bật" />
        {alerts.data !== null && <p>{alerts.data.length} bản tin đang bật tại lần tải. Không có bản tin không đồng nghĩa không có nguy cơ.</p>}
        {isRescue && <Link className="text-cyan-300 underline" to="/rescue/flood-warnings">Xem đầy đủ bản tin</Link>}
      </div>
      {isRescue && (
        <div className="text-xs text-slate-300 space-y-1">
          <WarningFeedback resource={zones} noun="dữ liệu vùng" />
          {bundle && <>
            <ZoneCoverageNotice bundle={bundle} />
            <p>{bundle.coverage.evaluableZones}/{bundle.coverage.totalZones} vùng có ranh giới dùng được · Bộ vùng tạo lúc {warningTime(bundle.generatedAt)} (GMT+7).</p>
            <p>Dữ liệu vùng phục vụ đánh giá nguy cơ, không phải xác nhận ngập thực tế theo thời gian thực.</p>
            {bundle.geojson.features.length === 0 && bundle.coverage.status === 'complete' && <p>Chưa có vùng được công bố.</p>}
            {showRegions && bundle.geojson.features.length > 0 && (
              <details>
                <summary className="cursor-pointer">Thông tin các vùng ({bundle.geojson.features.length})</summary>
                {bundle.geojson.features.map(feature => (
                  <div key={feature.properties.zoneId} className="rw-zone-row">
                    <dl className="rw-zone-metadata">
                      {zoneMetadataRows(feature.properties).map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
                    </dl>
                    {feature.geometry === null && <p>Chưa có ranh giới hợp lệ để hiển thị vùng này.</p>}
                  </div>
                ))}
              </details>
            )}
          </>}
        </div>
      )}
      {(isAdmin || isStaleData) && <div className="flex flex-wrap items-center gap-3">
        {isStaleData && <span className="text-xs text-amber-300">Dữ liệu lưu tạm</span>}
          {isAdmin && mapLegend}
      </div>}
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

      <div className={isAdmin ? "grid grid-cols-1 gap-4 lg:grid-cols-4" : "w-full"}>
        <div className={`bg-[#081B30] border border-[#1E3A5F] rounded-2xl overflow-hidden relative shadow-lg ${isAdmin ? "lg:col-span-3 min-h-[560px]" : "min-h-[360px]"}`}>
          {dataLoading && (
            <div className="absolute inset-0 bg-[#081B30]/90 z-20 flex flex-col items-center justify-center space-y-2 font-mono text-xs text-cyan-400">
              <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
              <span>Đang tải dữ liệu vùng ngập và khởi tạo bản đồ MapTiler...</span>
            </div>
          )}
          <div ref={mapContainerRef} className="floodguard-map w-full z-0" style={{ height: embedded ? "clamp(360px, 52vh, 560px)" : isRescue ? "clamp(360px, calc(100dvh - 270px), 900px)" : 560 }} />
        </div>

        {isAdmin && (
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
        )}
      </div>
    </div>
  );

  if (embedded && isRescue) {
    return (
      <div className="rw-embedded-map">
        <div className="rw-embedded-actions">
          <button type="button" onClick={handleRetry} disabled={zones.loading || alerts.loading}>Làm mới bản đồ</button>
          <Link to="/map?showZones=1" className="rw-open-full-map">Mở bản đồ lớn ↗</Link>
        </div>
        {mapContent}
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <RescueLayout
        loading={zones.loading || alerts.loading}
        onRefresh={handleRetry}
        updatedAt={zones.updatedAt}
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
      header={<AdminHeader alertCount={alerts.loading || alerts.errorStatus != null ? undefined : adminAlertCount} title="Bản đồ trực quan" />}
    >
      {mapContent}
    </AppShell>
  );
};

export default FloodMapView;