import { fetchHistoricalPoints, fetchHistoricalAreas, fetchHistoricalBuffers, fetchHistoricalRadar,
  type HistoricalLayerKey, type HistoricalFeatureCollection } from '../admin/flood-area/historicalMapService';

export interface HistoricalSnapshot { data: HistoricalFeatureCollection; fetchedAt: number }
const sources = { points: fetchHistoricalPoints, areas: fetchHistoricalAreas, buffers: fetchHistoricalBuffers, radar: fetchHistoricalRadar };
const cache = new Map<HistoricalLayerKey, HistoricalSnapshot>();
const pending = new Map<HistoricalLayerKey, Promise<HistoricalSnapshot>>();

export function getHistoricalLayer(key: HistoricalLayerKey, force = false): Promise<HistoricalSnapshot> {
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const old = cache.get(key);
  if (!force && old && Date.now() - old.fetchedAt < 60_000) return Promise.resolve(old);
  const request = sources[key]().then(data => {
    const value = { data, fetchedAt: Date.now() };
    cache.set(key, value);
    return value;
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

// Disabled layers are never fetched, even during forced or automatic refresh.
export async function getEnabledHistoricalLayers(keys: HistoricalLayerKey[], force = false) {
  return Promise.all(keys.map(async key => {
    try { return { key, snapshot: await getHistoricalLayer(key, force), error: null }; }
    catch { return { key, snapshot: null, error: 'Chưa cập nhật được; dữ liệu cũ nếu có chỉ để tham khảo.' }; }
  }));
}
