import { useEffect, useRef, useState } from 'react';
import type { HistoricalLayerKey } from '../admin/flood-area/historicalMapService';
import { getEnabledHistoricalLayers, type HistoricalSnapshot } from './historicalLayerCache';

type LayerState = { snapshot: HistoricalSnapshot | null; error: string | null };
export function useHistoricalLayers(enabled: HistoricalLayerKey[], refreshToken: string) {
  const [layers, setLayers] = useState<Partial<Record<HistoricalLayerKey, LayerState>>>({});
  const lastToken = useRef(refreshToken);
  const keys = enabled.join(',');
  useEffect(() => {
    let disposed = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const active = keys ? keys.split(',') as HistoricalLayerKey[] : [];
    const force = lastToken.current !== refreshToken;
    lastToken.current = refreshToken;
    const run = async (force: boolean) => {
      if (disposed || running || document.hidden || !active.length) return;
      running = true;
      const results = await getEnabledHistoricalLayers(active, force);
      if (!disposed) setLayers(previous => {
        const next = { ...previous };
        results.forEach(result => { next[result.key] = {
          snapshot: result.snapshot ?? previous[result.key]?.snapshot ?? null, error: result.error,
        }; });
        return next;
      });
      running = false;
      if (!disposed) timer = setTimeout(() => void run(false), 60_000);
    };
    const visible = () => { clearTimeout(timer); if (!document.hidden) void run(false); };
    document.addEventListener('visibilitychange', visible);
    void run(force);
    return () => { disposed = true; clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [keys, refreshToken]);
  return layers;
}
