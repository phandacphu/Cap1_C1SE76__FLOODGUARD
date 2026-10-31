import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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

const ALERT_COUNT_CACHE_KEY = 'floodguard_active_alerts_count';
type FilterStatus = 'active_only' | 'all' | 'inactive_only';

export const FloodMapView: React.FC = () => {
  const { user, token } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const polygonLayerGroupRef = useRef<L.LayerGroup | null>(null);

  const [floodAreas, setFloodAreas] = useState<FloodArea[]>([]);
  const [dataLoading, setDataLoading] = useState<boolean>(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [isStaleData, setIsStaleData] = useState<boolean>(false);
  const [selectedArea, setSelectedArea] = useState<FloodArea | null>(null);
  const [reloadTrigger, setReloadTrigger] = useState<number>(0);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('active_only');
  const [tileErrorCount, setTileErrorCount] = useState<number>(0);

  // Khởi tạo state alertCount cho Admin thông qua lazy init tránh setState trong effect (A.1)
  const [adminAlertCount, setAdminAlertCount] = useState<number>(() => {
    try {
      const cached = sessionStorage.getItem(ALERT_COUNT_CACHE_KEY);
      return cached !== null ? Number(cached) || 0 : 0;
    } catch {
      return 0;
    }
  });

  // Tải alertCount tối ưu, chỉ gọi API nhẹ nếu chưa có cache
  useEffect(() => {
    if (!isAdmin || !token) return;

    let ignore = false;
    const hasCache = sessionStorage.getItem(ALERT_COUNT_CACHE_KEY) !== null;
    if (hasCache) return;

    const fetchAlertCount = async () => {
      try {
        const res = await fetch('/api/flood-alerts/active', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        if (!res.ok) return;
        const data = await res.json();
        const count = Array.isArray(data) ? data.length : (Array.isArray(data?.data) ? data.data.length : 0);
        if (!ignore) {
          setAdminAlertCount(count);
          sessionStorage.setItem(ALERT_COUNT_CACHE_KEY, String(count));
        }
      } catch {
        // Bỏ qua lỗi phụ để không gián đoạn giao diện chính
      }
    };

    void fetchAlertCount();

    return () => {
      ignore = true;
    };
  }, [isAdmin, token]);

  // Fetch API vùng ngập và quản lý trạng thái dữ liệu cũ (A.3, A.5)
  useEffect(() => {
    let ignore = false;

    const loadFloodAreas = async () => {
      try {
        const data = await floodAreaService.getFloodAreas(token);
        if (!ignore) {
          setFloodAreas(data);
          setDataError(null);
          setIsStaleData(false);
          setLastUpdated(new Date());
        }
      } catch (err: unknown) {
        if (!ignore) {
          const errMsg = err instanceof Error ? err.message : 'Lỗi kết nối máy chủ API vùng ngập';
          setDataError(errMsg);
          setFloodAreas((prev) => {
            if (prev.length > 0) {
              setIsStaleData(true);
            }
            return prev;
          });
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
    setTileErrorCount(0);
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
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      maxZoom: 19,
    });

    tileLayer.on('tileerror', () => {
      setTileErrorCount((prev) => prev + 1);
    });

    tileLayer.addTo(map);

    polygonLayerGroupRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    const t1 = setTimeout(() => map.invalidateSize(), 150);
    const t2 = setTimeout(() => map.invalidateSize(), 500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Lọc dữ liệu theo trạng thái active / inactive (A.2)
  const filteredAreas = useMemo(() => {
    if (statusFilter === 'active_only') {
      return floodAreas.filter((a) => a.status === 'active');
    }
    if (statusFilter === 'inactive_only') {
      return floodAreas.filter((a) => a.status !== 'active');
    }
    return floodAreas;
  }, [floodAreas, statusFilter]);

  // Vẽ Polygons kiểm tra chặt chẽ geometry (A.2, A.5)
  const renderPolygons = useCallback(() => {
    if (!mapInstanceRef.current || !polygonLayerGroupRef.current) return;

    polygonLayerGroupRef.current.clearLayers();
    const bounds: L.LatLngExpression[] = [];

    filteredAreas.forEach((area) => {
      if (
        area.geometry?.type?.toLowerCase() === 'polygon' &&
        Array.isArray(area.geometry.points) &&
        area.geometry.points.length >= 3
      ) {
        // Kiểm tra tính hợp lệ của từng tọa độ
        const validPoints = area.geometry.points.filter(
          (pt) => typeof pt?.latitude === 'number' && typeof pt?.longitude === 'number' && !isNaN(pt.latitude) && !isNaN(pt.longitude)
        );

        if (validPoints.length < 3) return;

        const latLngs: L.LatLngExpression[] = validPoints.map((pt) => {
          const point: [number, number] = [pt.latitude, pt.longitude];
          bounds.push(point);
          return point;
        });

        const colorCfg = SEVERITY_COLOR_MAP[area.severity] || SEVERITY_COLOR_MAP.low;
        const isAreaActive = area.status === 'active';

        const polygon = L.polygon(latLngs, {
          color: isAreaActive ? colorCfg.stroke : '#64748B',
          weight: isAreaActive ? 2.5 : 1.5,
          dashArray: isAreaActive ? undefined : '5, 5',
          opacity: isAreaActive ? 0.95 : 0.4,
          fillColor: isAreaActive ? colorCfg.fill : '#475569',
          fillOpacity: isAreaActive ? 0.4 : 0.12,
        });

        const safeName = escapeHtml(area.name);
        const safeStatus = isAreaActive
          ? '<span style="color: #10B981; font-weight: bold;">● ĐANG HIỆU LỰC (ACTIVE)</span>'
          : '<span style="color: #94A3B8; font-weight: bold;">○ NGỪNG CẢNH BÁO (INACTIVE)</span>';
        const safeSource = escapeHtml(area.source || 'Hệ thống FloodGuard');
        const safeDesc = escapeHtml(area.description || 'Không có mô tả chi tiết');

        const popupContent = `
          <div style="color: #0f172a; font-family: ui-monospace, monospace; padding: 4px; font-size: 11px; line-height: 1.5;">
            <b style="font-size: 12px; color: ${isAreaActive ? '#0284c7' : '#64748B'};">${safeName}</b><br/>
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
      mapInstanceRef.current.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [24, 24] });
    }
  }, [filteredAreas]);

  useEffect(() => {
    if (mapInstanceRef.current) {
      renderPolygons();
    }
  }, [renderPolygons]);

  const activeCount = floodAreas.filter((a) => a.status === 'active').length;
  const inactiveCount = floodAreas.filter((a) => a.status !== 'active').length;

  const mapContent = (
    <div className="w-full space-y-4 font-sans text-slate-100 pb-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-[#1E3A5F]/40 pb-3">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-lg font-bold font-mono tracking-tight text-white uppercase">
              Bản Đồ Cảnh Báo Vùng Ngập Lụt (OpenStreetMap)
            </h1>
            {isStaleData && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950/80 border border-amber-600 text-amber-300">
                ⚠️ Dữ liệu lưu tạm (Mất kết nối máy chủ)
              </span>
            )}
          </div>
          <p className="text-xs font-mono text-slate-400 mt-0.5">
            Dữ liệu tọa độ đa giác từ API Backend • Phục vụ cứu hộ và điều hướng C4I
          </p>
        </div>

        {/* Bộ lọc trạng thái vùng ngập (A.2) */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-[#081B30] border border-[#1E3A5F] rounded-lg p-0.5 text-xs font-mono">
            <button
              onClick={() => setStatusFilter('active_only')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                statusFilter === 'active_only' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Hiệu lực ({activeCount})
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
              onClick={() => setStatusFilter('inactive_only')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                statusFilter === 'inactive_only' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Đã ngưng ({inactiveCount})
            </button>
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
      </div>

      {/* Thông báo lỗi API và cảnh báo dữ liệu cũ (A.3) */}
      {dataError && (
        <div className="bg-rose-950/60 border border-rose-700 p-3.5 rounded-lg text-rose-200 text-xs font-mono flex items-center justify-between shadow-lg">
          <div>
            <span className="font-bold">⚠️ [LỖI KẾT NỐI API]: </span>
            <span>{dataError}</span>
            {isStaleData && (
              <span className="block text-amber-300 mt-0.5 text-[11px]">
                Lưu ý: Các đa giác hiển thị bên dưới là bản sao lưu tạm thời từ phiên trước, không phản ánh hiện trạng mới nhất.
              </span>
            )}
          </div>
          <button
            onClick={handleRetry}
            className="px-3 py-1.5 bg-rose-900/90 hover:bg-rose-800 rounded text-xs font-mono border border-rose-500 transition-colors whitespace-nowrap ml-3"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Cảnh báo khi Tile OpenStreetMap không tải được (A.4) */}
      {tileErrorCount > 3 && (
        <div className="bg-amber-950/50 border border-amber-600/70 p-2.5 rounded-lg text-amber-200 text-xs font-mono flex items-center justify-between">
          <span>⚠️ Một số mảnh bản đồ nền OpenStreetMap tải chậm hoặc mất kết nối mạng. Các đa giác cảnh báo vẫn được vẽ đúng tọa độ.</span>
          <button
            onClick={() => {
              if (mapInstanceRef.current) {
                mapInstanceRef.current.invalidateSize();
                setTileErrorCount(0);
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
          <div ref={mapContainerRef} className="w-full h-[560px] z-0" />
        </div>

        <div className="bg-[#081B30] border border-[#1E3A5F] rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between border-b border-[#1E3A5F]/40 pb-2">
              <span className="text-xs font-bold font-mono text-cyan-300 uppercase">Danh sách vùng ({filteredAreas.length})</span>
              <span className="text-[10px] font-mono text-slate-400">
                {statusFilter === 'active_only' ? 'Chỉ hiệu lực' : statusFilter === 'inactive_only' ? 'Đã ngưng' : 'Tất cả'}
              </span>
            </div>

            <div className="space-y-2 mt-3 max-h-[460px] overflow-y-auto pr-1">
              {filteredAreas.length === 0 && !dataLoading && (
                <div className="text-xs font-mono text-slate-400 text-center py-10">
                  {dataError && !isStaleData ? 'Không thể nạp dữ liệu từ máy chủ.' : 'Không có vùng ngập nào trong bộ lọc này.'}
                </div>
              )}
              {filteredAreas.map((area) => {
                const cfg = SEVERITY_COLOR_MAP[area.severity] || SEVERITY_COLOR_MAP.low;
                const isSelected = selectedArea?.id === area.id;
                const isAreaActive = area.status === 'active';

                return (
                  <div
                    key={area.id}
                    onClick={() => setSelectedArea(area)}
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
                        {isAreaActive ? '● Đang hiệu lực' : '○ Đã ngừng'}
                      </span>
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
      header={<AdminHeader alertCount={adminAlertCount} />}
    >
      {mapContent}
    </AppShell>
  );
};

export default FloodMapView;
