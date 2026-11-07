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

export const FloodMapView: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const polygonLayerGroupRef = useRef<L.LayerGroup | null>(null);
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

  const [adminAlertCount, setAdminAlertCount] = useState<number | undefined>(undefined);
  const [alertCountError, setAlertCountError] = useState<string | null>(null);
  useEffect(() => {
    if (!isAdmin) return;
    let ignore = false;
    void floodAreaService.getActiveAlertCount(reloadTrigger > 0).then(count => {
      if (!ignore) { setAdminAlertCount(count); setAlertCountError(null); }
    }).catch(() => {
      if (!ignore) setAlertCountError('Không tải được số cảnh báo hiện hành; số trên thanh đầu trang có thể chưa cập nhật.');
    });
    return () => { ignore = true; };
  }, [isAdmin, reloadTrigger]);

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
      zoom: 12,
      zoomControl: true,
    });

    const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      maxZoom: 19,
      referrerPolicy: 'strict-origin-when-cross-origin',
    });

    tileLayerRef.current = tileLayer;
    const failedTiles = new Set<HTMLImageElement>();
    tileLayer.on('tileerror', event => {
      failedTiles.add(event.tile as HTMLImageElement);
      setTileErrorCount(failedTiles.size);
    });
    tileLayer.on('tileload', event => {
      failedTiles.delete(event.tile as HTMLImageElement);
      setTileErrorCount(failedTiles.size);
    });
    tileLayer.on('tileunload', event => {
      failedTiles.delete(event.tile as HTMLImageElement);
      setTileErrorCount(failedTiles.size);
    });
    const retryTiles = () => { map.invalidateSize(); tileLayer.redraw(); };
    window.addEventListener('online', retryTiles);

    tileLayer.addTo(map);

    polygonLayerGroupRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(mapContainerRef.current);

    return () => {
      window.removeEventListener('online', retryTiles);
      observer.disconnect();
      tileLayer.off();
      tileLayerRef.current = null;
      polygonLayerGroupRef.current = null;
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Filter current areaType classification, independently of warning severity.
  const filteredAreas = useMemo(() => {
    if (statusFilter === 'unknown') return floodAreas.filter(area => area.areaType == null);
    if (statusFilter !== 'all') return floodAreas.filter(area => area.areaType === statusFilter);
    return floodAreas;
  }, [floodAreas, statusFilter]);

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

        const polygon = L.polygon(latLngs, {
          color: colorCfg.stroke,
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
  }, [filteredAreas]);

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
              Bản Đồ Vùng Ngập (OpenStreetMap)
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

      {alertCountError && <p role="status" className="text-amber-300 text-xs">{alertCountError}</p>}
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
      {tileErrorCount > 0 && (
        <div className="bg-amber-950/50 border border-amber-600/70 p-2.5 rounded-lg text-amber-200 text-xs font-mono flex items-center justify-between">
          <span>⚠️ Một số mảnh bản đồ nền OpenStreetMap tải chậm hoặc mất kết nối mạng. Vui lòng kiểm tra kết nối và thử tải lại.</span>
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
              <span>Đang tải dữ liệu vùng ngập và khởi tạo bản đồ OpenStreetMap...</span>
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
      header={<AdminHeader alertCount={alertCountError ? undefined : adminAlertCount} title="Bản đồ trực quan" />}
    >
      {mapContent}
    </AppShell>
  );
};

export default FloodMapView;
