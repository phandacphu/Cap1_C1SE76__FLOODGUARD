import { useEffect, useState, useCallback } from "react";
export interface WarningResource<T> {
  data: T | null;
  error: string | null;
  errorStatus?: number | null;
  loading: boolean;
  updatedAt: Date | null;
  refresh: () => void;
}
interface State<T> {
  loader?: (signal: AbortSignal) => Promise<T>;
  identity: string;
  generation: string;
  data: T | null;
  error: string | null;
  errorStatus?: number | null;
  updatedAt: Date | null;
}
export function useWarningResource<T>(
  identity: string,
  load: (signal: AbortSignal) => Promise<T>,
  refreshKey = 0,
): WarningResource<T> {
  const [round, setGeneration] = useState(0);
  const generation = `${round}:${refreshKey}`;
  const [state, setState] = useState<State<T>>({
    identity: "",
    generation: "",
    data: null,
    error: null,
    updatedAt: null,
  });
  // Reset on scope changes during render, so a screen/account revisited before a response
  // cannot reuse an earlier success as if it were a fresh authorization/read.
  if (state.identity !== identity) {
    setState({
      identity,
      generation: "",
      data: null,
      error: null,
      updatedAt: null,
    });
  }
  useEffect(() => {
    if (!identity) return;
    const controller = new AbortController();
    let current = true;
    void Promise.resolve()
      .then(() => load(controller.signal))
      .then((data) => {
        if (current)
          setState({
            identity,
            generation,
            loader: load,
            data,
            error: null,
            errorStatus: null,
            updatedAt: new Date(),
          });
      })
      .catch((error: unknown) => {
        if (!current) return;
        const status =
          error && typeof error === "object" && "status" in error
            ? error.status
            : null;
        const discard = status === 401 || status === 403 || status === 404;
        const message =
          status === 401
            ? "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại."
            : status === 403
              ? error instanceof Error
                ? error.message
                : "Tài khoản không có quyền hoặc đã ngừng hoạt động."
              : error instanceof Error
                ? error.message
                : "Không tải được dữ liệu.";
        setState((previous) => ({
          identity,
          generation,
          loader: load,
          data:
            !discard &&
            previous.identity === identity &&
            previous.loader === load
              ? previous.data
              : null,
          updatedAt:
            !discard &&
            previous.identity === identity &&
            previous.loader === load
              ? previous.updatedAt
              : null,
          error: message,
          errorStatus: typeof status === "number" ? status : null,
        }));
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [identity, generation, load]);
  const same =
    Boolean(identity) && state.identity === identity && state.loader === load;
  return {
    data: same ? state.data : null,
    error: same ? state.error : null,
    errorStatus: same ? state.errorStatus : null,
    updatedAt: same ? state.updatedAt : null,
    loading: Boolean(identity) && (!same || state.generation !== generation),
    refresh: useCallback(() => setGeneration((value) => value + 1), []),
  };
}
