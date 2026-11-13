import { useCallback, useRef, useState } from 'react';
import { GeoJSON, Pane } from 'react-leaflet';
import L from 'leaflet';
import type { GeoJsonObject } from 'geojson';
import { useSosResource } from '../useRescue';
import { historicalFloodIcon } from '../../map/historicalFloodIcon';
import { fetchHistoricalAreas, fetchHistoricalBuffers, fetchHistoricalPoints, fetchHistoricalRadar,
  type HistoricalFeatureCollection } from '../../admin/flood-area/historicalMapService';

const sources = [
  { id: 'points', label: 'Điểm ngập lịch sử', fetch: fetchHistoricalPoints },
  { id: 'areas', label: 'Đa giác HIST do Admin vẽ', fetch: fetchHistoricalAreas },
  { id: 'buffers', label: 'Vùng đệm lịch sử', fetch: fetchHistoricalBuffers },
  { id: 'radar', label: 'Radar lịch sử', fetch: fetchHistoricalRadar },
] as const;
const cache = new Map<string, { data: HistoricalFeatureCollection; at: number }>();
const pending = new Map<string, Promise<{ data: HistoricalFeatureCollection; at: number }>>();
function read(source: typeof sources[number], force: boolean) {
  const inflight = pending.get(source.id);
  if (inflight) return inflight;
  const old = cache.get(source.id);
  if (!force && old && Date.now() - old.at < 60_000) return Promise.resolve(old);
  const request = source.fetch().then(data => {
    const value = { data, at: Date.now() };
    cache.set(source.id, value);
    return value;
  }).finally(() => pending.delete(source.id));
  pending.set(source.id, request);
  return request;
}
interface Snapshot { layers: (HistoricalFeatureCollection | null)[]; errors: (string | null)[]; times: (number | null)[] }
function merge(previous: Snapshot | null, next: Snapshot): Snapshot {
  return { ...next, layers: next.layers.map((layer, i) => layer ?? previous?.layers[i] ?? null),
    times: next.times.map((time, i) => time ?? previous?.times[i] ?? null) };
}
// Render inside MapContainer; controls live in a Leaflet overlay. No HTML from API.
export function SosHistoricalLayers() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({ points: true, areas: true, buffers: false, radar: false });
  const forceRef = useRef(false);
  const load = useCallback(async (): Promise<Snapshot> => {
    const force = forceRef.current;
    forceRef.current = false;
    const results = await Promise.allSettled(sources.map(source => read(source, force)));
    return {
      layers: results.map(result => result.status === 'fulfilled' ? result.value.data : null),
      errors: results.map(result => result.status === 'rejected' ? 'Chưa cập nhật được; dữ liệu giữ lại có thể đã cũ.' : null),
      times: results.map(result => result.status === 'fulfilled' ? result.value.at : null),
    };
  }, []);
  const history = useSosResource('sos-historical-layers', load, merge);
  return <>
    <div className="absolute right-3 top-3 z-[1000] max-h-64 w-60 overflow-auto rounded-lg bg-slate-950/95 p-3 text-xs text-white"
      onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
      <strong>Lớp lịch sử — chỉ tham khảo</strong>
      {sources.map((source, i) => <div key={source.id} className="mt-2">
        <label><input type="checkbox" checked={enabled[source.id]} onChange={event => setEnabled(value => ({ ...value, [source.id]: event.target.checked }))} /> {source.label}
          {history.data?.layers[i] ? ` (${history.data.layers[i]!.features.length})` : ''}</label>
        {history.data?.errors[i] && <p role="status" className="text-amber-300">{history.data.errors[i]}</p>}
        {history.data?.times[i] && <p className="text-slate-400">{new Date(history.data.times[i]!).toLocaleTimeString('vi-VN')}</p>}
      </div>)}
      {history.loading && <p role="status">Đang tải lớp lịch sử…</p>}
      <button type="button" disabled={history.loading} className="mt-2 underline" onClick={() => { forceRef.current = true; history.refresh(); }}>Tải lại lịch sử</button>
      <p className="mt-2">Không xác nhận ngập hiện tại hoặc mức an toàn.</p>
    </div>
    {sources.map((source, i) => {
      const data = history.data?.layers[i];
      if (!enabled[source.id] || !data) return null;
      return <Pane name={`sos-history-${source.id}`} key={`${source.id}-${history.data?.times[i]}`} style={{ zIndex: 350 }}><GeoJSON data={data as unknown as GeoJsonObject}
        style={feature => {
          const fill = source.id === 'areas' && feature?.properties?.areaType === 'flood' ? '#facc15' : '#ef4444';
          return { color: fill, fillColor: fill, weight: 2, fillOpacity: source.id === 'radar' ? 0.15 : 0.23 };
        }}
        pointToLayer={(_feature, point) => L.marker(point, { icon: historicalFloodIcon, zIndexOffset: -100 })}
        onEachFeature={(feature, layer) => {
          const popup = document.createElement('div');
          popup.textContent = `${String(feature.properties?.id ?? '')} ${String(feature.properties?.name ?? source.label)} — Lịch sử tham khảo, không phải cảnh báo hiện tại.`;
          layer.bindPopup(popup);
        }} /></Pane>;
    })}
  </>;
}
