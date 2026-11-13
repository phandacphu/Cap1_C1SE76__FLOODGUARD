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
  revision: number;
}

type ResourceUpdate<T> = (current: T | null) => T | null;
type FinishUpdate<T> = (update?: ResourceUpdate<T>) => void;
type MergeData<T> = (current: T | null, incoming: T) => T;

function replaceData<T>(_current: T | null, incoming: T): T {
  return incoming;
}

/** Poll serially; invalidate reads started before a write and refetch after it settles. */
export function useSosResource<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  merge: MergeData<T> = replaceData,
) {
  const { token } = useAuth();
  const resourceKey = JSON.stringify([token, key]);
  const refreshRef = useRef<() => void>(() => {});
  const beginUpdateRef = useRef<() => FinishUpdate<T>>(() => () => {});
  const [value, setValue] = useState<ResourceState<T>>({
    key: '', data: null, error: null, status: null, updatedAt: null, loading: true, revision: 0,
  });

  useEffect(() => {
    let disposed = false;
    let running = false;
    let queued = false;
    let stopped = false;
    let paused = false;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;

    const run = async () => {
      if (disposed || document.hidden || stopped || paused) return;
      if (running) {
        queued = true;
        return;
      }
      clearTimeout(timer);
      queued = false;
      running = true;
      const readGeneration = generation;
      controller = new AbortController();
      setValue(previous => ({
        ...(previous.key === resourceKey ? previous : {
          key: resourceKey, data: null, error: null, status: null, updatedAt: null, revision: 0,
        }),
        loading: true,
      }));
      try {
        const data = await load(controller.signal);
        if (!disposed && readGeneration === generation) setValue(previous => {
          const currentData = previous.key === resourceKey ? previous.data : null;
          const merged = merge(currentData, data);
          if (currentData !== null && merged === currentData && data !== currentData) {
            return {
              ...previous,
              loading: false,
              status: 0,
              error: 'Máy chủ trả dữ liệu cũ hơn. Chưa xác nhận được bản cập nhật mới nhất.',
            };
          }
          return {
            key: resourceKey,
            data: merged,
            error: null,
            status: null,
            updatedAt: new Date(),
            loading: false,
            revision: previous.revision + 1,
          };
        });
      } catch (error) {
        if (!disposed && readGeneration === generation) {
          stopped = error instanceof RescueApiError && [401, 403, 404].includes(error.status);
          setValue(previous => {
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
        }
      } finally {
        running = false;
        if (!disposed && !document.hidden && !stopped && !paused) {
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
    refreshRef.current = () => {
      stopped = false;
      void run();
    };
    beginUpdateRef.current = () => {
      paused = true;
      const updateGeneration = ++generation;
      clearTimeout(timer);
      controller?.abort();
      setValue(previous => ({ ...previous, loading: false }));
      return update => {
        if (disposed || updateGeneration !== generation) return;
        if (update) setValue(previous => ({
          ...previous,
          data: update(previous.data),
          error: null,
          status: null,
          revision: previous.revision + 1,
        }));
        paused = false;
        stopped = false;
        queued = true;
        void run();
      };
    };
    document.addEventListener('visibilitychange', visibility);
    void run();
    return () => {
      disposed = true;
      generation++;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [load, resourceKey, merge]);

  const refresh = useCallback(() => refreshRef.current(), []);
  const beginUpdate = useCallback(() => beginUpdateRef.current(), []);
  const current = value.key === resourceKey;
  return {
    data: current ? value.data : null,
    error: current ? value.error : null,
    status: current ? value.status : null,
    updatedAt: current ? value.updatedAt : null,
    revision: current ? value.revision : 0,
    loading: !current || value.loading,
    refresh,
    beginUpdate,
  };
}

export function useRescueRequests(filters: DirectSosFilters = {}) {
  const { state, sort = 'newest', from, to } = filters;
  const load = useCallback((signal: AbortSignal) =>
    rescueService.getRescueRequests({ state, sort, from, to }, signal), [state, sort, from, to]);
  const result = useSosResource(JSON.stringify([state, sort, from, to]), load);
  return { ...result, requests: result.data };
}
