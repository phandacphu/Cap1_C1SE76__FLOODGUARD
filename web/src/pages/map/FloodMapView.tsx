import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { floodAreaService } from '../../api/floodAreaService';
import { useAuth } from '../../context/AuthContext';
import { AppShell } from '../../components/layout/AppShell';
import { AdminHeader } from '../../components/layout/AdminHeader';
import { RescueLayout } from '../../components/layout/RescueLayout';
import { ADMIN_NAV } from '../../components/layout/navConfig';
import type { FloodArea, SeverityLevel } from '../../types/floodArea';

const SEVERITY_COLOR_MAP: Record<
  SeverityLevel,
  { stroke: string; fill: string; label: string; badge: string }
> = {
  critical: {
    stroke: '#DC2626',
    fill: '#991B1B',
    label: 'Khẩn cấp',
    badge: 'bg-red-950/60 border border-red-700/60 text-red-400',
  },
  high: {
    stroke: '#EA580C',
    fill: '#9A3412',
    label: 'Cao',
    badge: 'bg-orange-950/60 border border-orange-700/60 text-orange-400',
  },
  medium: {
    stroke: '#D97706',
    fill: '#92400E',
    label: 'Trung bình',
    badge: 'bg-amber-950/60 border border-amber-700/60 text-amber-400',
  },
  low: {
    stroke: '#2563EB',
    fill: '#1E40AF',
    label: 'Thấp',
    badge: 'bg-blue-950/60 border border-blue-700/60 text-blue-400',
  },
};

const escapeHtml = (unsafe?: string | null): string => {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

export const FloodMapView: React.FC = () => {
  const { user, token } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const polygonLayerGroupRef = useRef<L.LayerGroup | null>(null);

  const [floodAreas, setFloodAreas] = useState<FloodArea[]>([]);
  const [dataLoading, setDataLoading] = useState<boolean>(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [selectedArea, setSelectedArea] = useState<FloodArea | null>(null);
  const [reloadTrigger, setReloadTrigger] = useState<number>(0);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Fetch API an toàn
  useEffect(() => {
    let ignore = false;

    const loadFloodAreas = async () => {
      try {
        const data = await floodAreaService.getFloodAreas(token);
        if (!ignore) {
          setFloodAreas(data);
          setDataError(null);
          setLastUpdated(new Date());
        }
      } catch (err: unknown) {
        if (!ignore) {
          setDataError(err instanceof Error ? err.message : 'Lỗi kết nối máy chủ API vùng ngập');
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
  }, [token, reloadTrigger]);

  const handleRetry = useCallback(() => {
    setDataLoading(true);
    setDataError(null);
    setReloadTrigger((prev) => prev + 1);
  }, []);

  // Khởi tạo Leaflet Map với Tile Server ổn định
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const daNangCenter: L.LatLngExpression = [16.0544, 108.2022];
    const map = L.map(mapContainerRef.current, {
      center: daNangCenter,
      zoom: 12,
      zoomControl: true,
    });

    // Dùng subdomains {s} để tránh rate-limit kết nối OSM
    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      subdomains: ['a', 'b', 'c'],
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      maxZoom: 19,
    });

    tileLayer.addTo(map);

    polygonLayerGroupRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    // Kích hoạt tính lại kích thước nhiều đợt để đảm bảo sau khi Layout dựng xong map render full
    const t1 = setTimeout(() => map.invalidateSize(), 100);
    const t2 = setTimeout(() => map.invalidateSize(), 500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Render Polygons
  const renderPolygons = useCallback(() => {
    if (!mapInstanceRef.current || !polygonLayerGroupRef.current) return;

    polygonLayerGroupRef.current.clearLayers();
    const bounds: L.LatLngExpression[] = [];

    floodAreas.forEach((area) => {
      if (
        area.geometry?.type?.toLowerCase() === 'polygon' &&
        Array.isArray(area.geometry.points) &&
        area.geometry.points.length >= 3
      ) {
        const latLngs: L.LatLngExpression[] = area.geometry.points.map((pt) => {
          const point: [number, number] = [pt.latitude, pt.longitude];
          bounds.push(point);
          return point;
        });

        const colorCfg = SEVERITY_COLOR_MAP[area.severity] || SEVERITY_COLOR_MAP.low;
        const isAreaActive = area.status === 'active';

        const polygon = L.polygon(latLngs, {
          color: colorCfg.stroke,
          weight: 2,
          opacity: isAreaActive ? 0.9 : 0.35,
          fillColor: colorCfg.fill,
          fillOpacity: isAreaActive ? 0.35 : 0.1,
        });

        const safeName = escapeHtml(area.name);
        const safeStatus = isAreaActive ? 'Đang hiệu lực (active)' : 'Ngừng cảnh báo (inactive)';
        const safeSource = escapeHtml(area.source || 'Hệ thống FloodGuard');
        const safeDesc = escapeHtml(area.description || 'Không có mô tả chi tiết');

        const popupContent = `
          <div style="color: #0f172a; font-family: ui-monospace, monospace; padding: 4px; font-size: 11px; line-height: 1.5;">
            <b style="font-size: 12px; color: #0284c7;">${safeName}</b><br/>
            <b>Mức độ:</b> ${colorCfg.label} (${escapeHtml(area.severity)})<br/>
            <b>Trạng thái:</b> ${safeStatus}<br/>
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
      mapInstanceRef.current.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [20, 20] });
    }
  }, [floodAreas]);

  useEffect(() => {
    if (mapInstanceRef.current) {
      renderPolygons();
    }
  }, [renderPolygons]);

  const activeCriticalCount = floodAreas.filter(
    (a) => a.status === 'active' && (a.severity === 'critical' || a.severity === 'high')
  ).length;

  const mapContent = (
    <div className="w-full space-y-4 font-sans text-slate-100 pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#1E3A5F]/40 pb-3">
        <div>
          <h1 className="text-lg font-bold font-mono tracking-tight text-white uppercase">
            Bản Đồ Cảnh Báo Vùng Ngập Lụt (OpenStreetMap)
          </h1>
          <p className="text-xs font-mono text-slate-400 mt-0.5">
            Dữ liệu tọa độ đa giác từ API Backend • Phục vụ cứu hộ và điều hướng C4I
          </p>
        </div>

        <div className="flex items-center space-x-2 text-[11px] font-mono bg-[#081B30] border border-[#1E3A5F] px-3 py-1.5 rounded-lg">
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <span className="text-slate-300">Khẩn cấp</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-orange-500"></span>
            <span className="text-slate-300">Cao</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span className="text-slate-300">Vừa</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            <span className="text-slate-300">Thấp</span>
          </span>
        </div>
      </div>

      {dataError && (
        <div className="bg-rose-950/50 border border-rose-700 p-3.5 rounded-lg text-rose-200 text-xs font-mono flex items-center justify-between">
          <span>⚠️ [LỖI API VÙNG NGẬP]: {dataError}</span>
          <button
            onClick={handleRetry}
            className="px-2.5 py-1 bg-rose-900/80 hover:bg-rose-800 rounded text-[11px] font-mono border border-rose-600 transition-colors"
          >
            Thử lại
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 bg-[#081B30] border border-[#1E3A5F] rounded-xl overflow-hidden relative min-h-[560px] shadow-lg">
          {dataLoading && (
            <div className="absolute inset-0 bg-[#081B30]/90 z-20 flex flex-col items-center justify-center space-y-2 font-mono text-xs text-cyan-400">
              <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
              <span>Đang tải dữ liệu vùng ngập và bản đồ OpenStreetMap...</span>
            </div>
          )}
          <div ref={mapContainerRef} className="w-full h-[560px] z-0" />
        </div>

        <div className="bg-[#081B30] border border-[#1E3A5F] rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between border-b border-[#1E3A5F]/40 pb-2">
              <span className="text-xs font-bold font-mono text-cyan-300 uppercase">Vùng ngập API</span>
              <span className="text-[11px] font-mono text-slate-400">Tổng: {floodAreas.length}</span>
            </div>

            <div className="space-y-2 mt-3 max-h-[460px] overflow-y-auto pr-1">
              {floodAreas.length === 0 && !dataLoading && !dataError && (
                <div className="text-xs font-mono text-slate-400 text-center py-8">
                  Không tìm thấy vùng ngập nào trong cơ sở dữ liệu.
                </div>
              )}
              {floodAreas.map((area) => {
                const cfg = SEVERITY_COLOR_MAP[area.severity] || SEVERITY_COLOR_MAP.low;
                const isSelected = selectedArea?.id === area.id;

                return (
                  <div
                    key={area.id}
                    onClick={() => setSelectedArea(area)}
                    className={`p-2.5 rounded-lg border text-xs font-mono cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#122B48] border-cyan-400 text-white'
                        : 'bg-[#051424] border-[#1E3A5F]/60 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold truncate">{area.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 mt-1 flex items-center justify-between">
                      <span>{area.status === 'active' ? '● Đang hiệu lực' : '○ Đã ngưng'}</span>
                      <span className="text-slate-500 truncate max-w-[100px]">{area.source || 'Cảm biến'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-[#1E3A5F]/40 pt-3 mt-3 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Độ phân giải: GeoJSON</span>
            <button
              onClick={handleRetry}
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
      header={<AdminHeader alertCount={activeCriticalCount} />}
    >
      {mapContent}
    </AppShell>
  );
};

export default FloodMapView;
