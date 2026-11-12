import { useCallback, useEffect, useRef, useState } from 'react';
import { rescueService, RescueApiError } from '../../api/rescueService';
import { useAuth } from '../../context/AuthContext';
import type { DirectSosFilters } from '../../types/rescueDirect';

interface ResourceState<T> {
  key: string;
  data: T | null;
  error: string | null;
  status: number | null;
  updatedAt: Date | null;
  loading: boolean;
}

/** One request at a time; schedule the next poll after settlement, only in a visible tab. */
export function useSosResource<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const { token } = useAuth();
  const resourceKey = JSON.stringify([token, key]);
  const refreshRef = useRef<() => void>(() => {});
  const [value, setValue] = useState<ResourceState<T>>({
    key: '', data: null, error: null, status: null, updatedAt: null, loading: true,
  });

  useEffect(() => {
    let disposed = false;
    let running = false;
    let queued = false;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;

    const run = async () => {
      if (disposed || document.hidden || stopped) return;
      if (running) { queued = true; return; }
      clearTimeout(timer);
      running = true;
      controller = new AbortController();
      setValue(previous => ({
        ...(previous.key === resourceKey ? previous : {
          key: resourceKey, data: null, error: null, status: null, updatedAt: null,
        }),
        loading: true,
      }));
      try {
        const data = await load(controller.signal);
        if (!disposed) setValue({
          key: resourceKey, data, error: null, status: null, updatedAt: new Date(), loading: false,
        });
      } catch (error) {
        stopped = error instanceof RescueApiError && [401, 403, 404].includes(error.status);
        if (!disposed) setValue(previous => {
          const status = error instanceof RescueApiError ? error.status : 0;
          const discard = [401, 403, 404].includes(status);
          return {
            ...previous,
            key: resourceKey,
            data: discard ? null : previous.data,
            updatedAt: discard ? null : previous.updatedAt,
            error: error instanceof Error ? error.message : 'Không thể tải SOS.',
            status,
            loading: false,
          };
        });
      } finally {
        running = false;
        if (!disposed && !document.hidden && !stopped) {
          const delay = queued ? 0 : 15_000;
          queued = false;
          timer = setTimeout(() => void run(), delay);
        }
      }
    };
    const visibility = () => {
      clearTimeout(timer);
      if (!document.hidden) void run();
    };
    refreshRef.current = () => { stopped = false; void run(); };
    document.addEventListener('visibilitychange', visibility);
    void run();
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [load, resourceKey]);

  const refresh = useCallback(() => refreshRef.current(), []);
  const current = value.key === resourceKey;
  return {
    data: current ? value.data : null,
    error: current ? value.error : null,
    status: current ? value.status : null,
    updatedAt: current ? value.updatedAt : null,
    loading: !current || value.loading,
    refresh,
  };
}

export function useRescueRequests(filters: DirectSosFilters = {}) {
  const { state, sort = 'newest', from, to } = filters;
  const load = useCallback((signal: AbortSignal) =>
    rescueService.getRescueRequests({ state, sort, from, to }, signal), [state, sort, from, to]);
  const result = useSosResource(JSON.stringify([state, sort, from, to]), load);
  return { ...result, requests: result.data };
}
