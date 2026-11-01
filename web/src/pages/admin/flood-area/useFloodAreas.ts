import { useCallback, useEffect, useState } from "react";
import { createArea, deleteArea, listAreas, updateArea } from "./floodAreaService";
import type { FloodAreaInput, FloodAreaItem } from "./floodAreaTypes";

interface State {
  areas: FloodAreaItem[] | null;
  error: string | null;
  key: string;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  status?: number;
}

const messageOf = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);
const statusOf = (err: unknown) => (typeof err === "object" && err !== null && "status" in err ? Number((err as { status: unknown }).status) : undefined);

/** Loads flood areas and runs create / update / delete (refetching after every change). */
export function useFloodAreas() {
  const [round, setRound] = useState(0);
  const [state, setState] = useState<State>({ areas: null, error: null, key: "" });
  const key = String(round);

  useEffect(() => {
    let cancelled = false;
    listAreas()
      .then((areas) => {
        if (!cancelled) setState({ areas, error: null, key });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState((prev) => ({ ...prev, error: messageOf(err, "Không thể tải danh sách vùng ngập."), key }));
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const refresh = useCallback(() => setRound((r) => r + 1), []);

  const run = useCallback(
    async (action: () => Promise<unknown>, fallback: string): Promise<ActionResult> => {
      try {
        await action();
        refresh();
        return { ok: true };
      } catch (err: unknown) {
        return { ok: false, error: messageOf(err, fallback), status: statusOf(err) };
      }
    },
    [refresh],
  );

  return {
    areas: state.areas,
    error: state.error,
    loading: state.key !== key,
    refresh,
    create: (input: FloodAreaInput) => run(() => createArea(input), "Tạo vùng ngập thất bại."),
    update: (id: string, patch: Partial<FloodAreaInput>) => run(() => updateArea(id, patch), "Cập nhật vùng ngập thất bại."),
    remove: (id: string) => run(() => deleteArea(id), "Xóa vùng ngập thất bại."),
  };
}
