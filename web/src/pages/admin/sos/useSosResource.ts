import { useCallback, useEffect, useMemo, useState } from "react";
import { sosError } from "./sosApi";

interface Request<T> {
  baseKey: string;
  round: number;
  load: () => Promise<T>;
}

interface Snapshot<T> {
  request: Request<T> | null;
  baseKey: string;
  data: T | null;
  error: ReturnType<typeof sosError> | null;
  updatedAt: Date | null;
}

/** Ignore obsolete responses; retain last successful data only for the same source/filter/SOS. */
export function useSosResource<T>(baseKey: string, load: () => Promise<T>) {
  const [round, setRound] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot<T>>({
    request: null, baseKey: "", data: null, error: null, updatedAt: null,
  });
  // Identity must also change when returning to a previously loaded filter during another request.
  const request = useMemo(() => ({ baseKey, round, load }), [baseKey, round, load]);
  useEffect(() => {
    let cancelled = false;
    void request.load().then(data => {
      if (!cancelled) setSnapshot({ request, baseKey: request.baseKey, data, error: null, updatedAt: new Date() });
    }, error => {
      if (cancelled) return;
      const failure = sosError(error);
      setSnapshot(previous => ({
        request, baseKey: request.baseKey, error: failure,
        // A 404 must not continue to present a deleted SOS; access failures must not reveal cached data.
        data: previous.baseKey === request.baseKey && ![401, 403, 404].includes(failure.status) ? previous.data : null,
        updatedAt: previous.baseKey === request.baseKey ? previous.updatedAt : null,
      }));
    });
    return () => { cancelled = true; };
  }, [request]);
  return {
    data: snapshot.baseKey === baseKey ? snapshot.data : null,
    error: snapshot.request === request ? snapshot.error : null,
    loading: snapshot.request !== request,
    updatedAt: snapshot.baseKey === baseKey ? snapshot.updatedAt : null,
    refresh: useCallback(() => setRound(value => value + 1), []),
  };
}
