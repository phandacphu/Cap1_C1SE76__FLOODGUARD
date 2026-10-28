/// <reference types="@types/google.maps" />
import React, { useEffect, useRef, useState } from 'react';
import { useGoogleMaps } from '../../hooks/useGoogleMaps';
import { floodAreaService } from '../../api/floodAreaService';
import { useAuth } from '../../context/AuthContext';
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

export const FloodMapView: React.FC = () => {
  const { token } = useAuth();
  const { isLoaded, loadError } = useGoogleMaps();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const polygonsRef = useRef<google.maps.Polygon[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const [floodAreas, setFloodAreas] = useState<FloodArea[]>([]);
  const [dataLoading, setDataLoading] = useState<boolean>(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [selectedArea, setSelectedArea] = useState<FloodArea | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchAreas = async () => {
      try {
        setDataLoading(true);
        setDataError(null);
        const data = await floodAreaService.getFloodAreas(token);
        if (!cancelled) {
          setFloodAreas(data);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setDataError(err instanceof Error ? err.message : 'Lỗi nạp danh sách vùng ngập');
        }
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    };

    void fetchAreas();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!isLoaded || !mapContainerRef.current || mapInstanceRef.current) return;

    const daNangCenter = { lat: 16.0544, lng: 108.2022 };
    mapInstanceRef.current = new google.maps.Map(mapContainerRef.current, {
      center: daNangCenter,
      zoom: 12,
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#0B192C' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#030D1A' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#94A3B8' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#040D18' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1E293B' }] },
      ],
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
    });

    infoWindowRef.current = new google.maps.InfoWindow();
  }, [isLoaded]);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;

    polygonsRef.current.forEach((p) => p.setMap(null));
    polygonsRef.current = [];

    const bounds = new google.maps.LatLngBounds();
    let validPointsCount = 0;

    floodAreas.forEach((area) => {
      if (
        area.geometry?.type?.toLowerCase() === 'polygon' &&
        Array.isArray(area.geometry.points) &&
        area.geometry.points.length >= 3
      ) {
        const coords = area.geometry.points.map((pt) => {
          const latLng = { lat: pt.latitude, lng: pt.longitude };
          bounds.extend(latLng);
          validPointsCount++;
          return latLng;
        });

        const colorCfg = SEVERITY_COLOR_MAP[area.severity] || SEVERITY_COLOR_MAP.low;
        const polygon = new google.maps.Polygon({
          paths: coords,
          strokeColor: colorCfg.stroke,
          strokeOpacity: area.isActive ? 0.9 : 0.3,
          strokeWeight: 1.5,
          fillColor: colorCfg.fill,
          fillOpacity: area.isActive ? 0.35 : 0.1,
          map: mapInstanceRef.current,
        });

        polygon.addListener('click', (e: google.maps.PolyMouseEvent) => {
          setSelectedArea(area);
          if (infoWindowRef.current && e.latLng) {
            infoWindowRef.current.setContent(`
              <div style="color: #0f172a; font-family: ui-monospace, monospace; padding: 6px; font-size: 11px; line-height: 1.5;">
                <b style="font-size: 12px; color: #0284c7;">${area.name}</b><br/>
                <b>Mức độ:</b> ${colorCfg.label} (${area.severity})<br/>
                <b>Trạng thái:</b> ${area.isActive ? 'Đang hiệu lực' : 'Đã ngưng'}<br/>
                <b>Nguồn tin:</b> ${area.source || 'Hệ thống FloodGuard'}<br/>
                <p style="margin: 4px 0 0 0; color: #475569;">${area.description || 'Không có mô tả chi tiết'}</p>
              </div>
            `);
            infoWindowRef.current.setPosition(e.latLng);
            infoWindowRef.current.open(mapInstanceRef.current);
          }
        });

        polygonsRef.current.push(polygon);
      }
    });

    if (validPointsCount > 0 && mapInstanceRef.current) {
      mapInstanceRef.current.fitBounds(bounds);
    }
  }, [floodAreas]);

  return (
    <div className="w-full space-y-4 font-sans text-slate-100 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#1E3A5F]/40 pb-3">
        <div>
          <h1 className="text-lg font-bold font-mono tracking-tight text-white uppercase">
            Bản Đồ Cảnh Báo Vùng Ngập Lụt
          </h1>
          <p className="text-xs font-mono text-slate-400 mt-0.5">
            Dữ liệu tọa độ đa giác từ API Backend • Phục vụ cứu hộ và điều hướng (TEST ONLY)
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

      {loadError && (
        <div className="bg-amber-950/40 border border-amber-700/60 p-3 rounded-lg text-amber-200 text-xs font-mono">
          ⚠️ [LỖI BẢN ĐỒ]: {loadError}
        </div>
      )}

      {dataError && (
        <div className="bg-rose-950/40 border border-rose-700/60 p-3 rounded-lg text-rose-200 text-xs font-mono">
          ⚠️ [LỖI API VÙNG NGẬP]: {dataError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 bg-[#081B30] border border-[#1E3A5F] rounded-xl overflow-hidden relative min-h-[520px]">
          {(!isLoaded || dataLoading) && (
            <div className="absolute inset-0 bg-[#081B30]/90 z-10 flex flex-col items-center justify-center space-y-2 font-mono text-xs text-cyan-400">
              <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
              <span>Đang tải Google Maps & dữ liệu vùng ngập...</span>
            </div>
          )}
          <div ref={mapContainerRef} className="w-full h-[520px]" />
        </div>

        <div className="bg-[#081B30] border border-[#1E3A5F] rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#1E3A5F]/40 pb-2">
              <span className="text-xs font-bold font-mono text-cyan-300 uppercase">Vùng ngập API</span>
              <span className="text-[11px] font-mono text-slate-400">Tổng: {floodAreas.length}</span>
            </div>

            <div className="space-y-2 mt-3 max-h-[440px] overflow-y-auto pr-1">
              {floodAreas.length === 0 && !dataLoading && (
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
                      <span>{area.isActive ? '● Đang hiệu lực' : '○ Đã ngưng'}</span>
                      <span className="text-slate-500 truncate max-w-[100px]">{area.source || 'Cảm biến'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FloodMapView;
