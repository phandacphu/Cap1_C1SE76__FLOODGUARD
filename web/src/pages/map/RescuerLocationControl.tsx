import { useEffect, useRef, useState, type RefObject } from 'react';
import L from 'leaflet';
import { watchDeviceLocation, type DeviceLocationState } from './deviceLocation';

export function RescuerLocationControl({ mapRef }: { mapRef: RefObject<L.Map | null> }) {
  const [state, setState] = useState<DeviceLocationState | null>(null);
  const focusNext = useRef(true);

  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    queueMicrotask(() => {
      if (!active) return;
      if (!window.isSecureContext || !navigator.geolocation) {
        setState({
          status: 'error', fix: null,
          message: 'Định vị cần HTTPS hoặc localhost và trình duyệt hỗ trợ Vị trí.',
        });
        return;
      }
      try {
        stop = watchDeviceLocation(navigator.geolocation, value => {
          if (active) setState(value);
        });
      } catch {
        setState({
          status: 'error', fix: null,
          message: 'Không mở được định vị. Hãy kiểm tra quyền Vị trí của Chrome và thiết bị.',
        });
      }
    });
    return () => { active = false; stop?.(); };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !state) return;

    if (!state.fix) return;
    const fix = state.fix;
    const point: L.LatLngExpression = [fix.latitude, fix.longitude];
    const group = L.layerGroup().addTo(map);

    L.circle(point, {
      className: 'rescuer-location-accuracy',
      radius: fix.accuracy,
      color: state.status === 'stale' ? '#94a3b8' : '#38bdf8',
      weight: 1,
      fillOpacity: 0.12,
      interactive: false,
    }).addTo(group);

    const marker = L.circleMarker(point, {
      className: 'rescuer-location-marker',
      pane: 'markerPane',
      radius: 9,
      color: '#fff',
      weight: 3,
      fillColor: state.status === 'stale' ? '#64748b' : '#0284c7',
      fillOpacity: 1,
    }).addTo(group);

    const popup = document.createElement('div');
    popup.textContent = `${state.status === 'stale' ? 'Vị trí lần cuối — chưa xác nhận vị trí hiện tại' : 'Vị trí của bạn'} · Sai số ước tính ±${Math.ceil(fix.accuracy)} m · ${fix.latitude.toFixed(6)}, ${fix.longitude.toFixed(6)} · ${new Date(fix.timestamp).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}${fix.accuracy > 100 ? ' · Sai số lớn, không dùng như vị trí chính xác.' : ''}`;
    marker.bindPopup(popup);

    if (focusNext.current) {
      map.setView(point, Math.max(map.getZoom(), 15));
      focusNext.current = false;
    }

    return () => { group.remove(); };
  }, [mapRef, state]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !state) return;
    if (state.message) {
      if (!state.message) return;
      const control = new L.Control({ position: 'bottomleft' });
      control.onAdd = () => {
        const message = L.DomUtil.create('div');
        message.setAttribute('role', 'status');
        message.className = 'rounded bg-slate-950/90 px-3 py-2 text-xs text-amber-300';
        message.style.maxWidth = '280px';
        message.textContent = state.message;
        L.DomEvent.disableClickPropagation(message);
        return message;
      };
      control.addTo(map);
      return () => { control.remove(); };
    }

  }, [mapRef, state]);

  return null;
}
