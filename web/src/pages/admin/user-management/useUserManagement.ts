// File: web/src/pages/admin/user-management/useUserManagement.ts

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { describeUserError, fetchUsers, patchUser, UserApiError, type User, type UserPatch } from "./userApi";

interface State {
  users: User[] | null;
  error: string | null;
  /** Which load (refresh round) the state belongs to. */
  key: string;
}

export interface UpdateResult {
  ok: boolean;
  error?: string;
}

/** Loads the account list and applies PATCH changes. Load errors are kept, never hidden. */
export function useUserManagement() {
  const { token, logout } = useAuth();
  const [round, setRound] = useState(0);
  const [state, setState] = useState<State>({ users: null, error: null, key: "" });
  const key = String(round);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchUsers(token)
      .then((users) => {
        if (!cancelled) setState({ users, error: null, key });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof UserApiError && err.status === 401) logout();
        // Keep the last good list on screen (flagged stale by the screen), never show it as fresh.
        setState((prev) => ({
          ...prev,
          error: describeUserError(err, "Không thể tải danh sách người dùng."),
          key,
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [token, key, logout]);

  const refresh = useCallback(() => setRound((r) => r + 1), []);

  const update = useCallback(
    async (id: string, patch: UserPatch): Promise<UpdateResult> => {
      if (!token) return { ok: false, error: "Không tìm thấy phiên đăng nhập hợp lệ." };
      try {
        const saved = await patchUser(token, id, patch);
        // Show the server's answer immediately, then reload to confirm.
        setState((prev) => ({
          ...prev,
          users: prev.users ? prev.users.map((u) => (u.id === saved.id ? saved : u)) : prev.users,
        }));
        refresh();
        return { ok: true };
      } catch (err: unknown) {
        if (err instanceof UserApiError && err.status === 401) logout();
        return { ok: false, error: describeUserError(err, "Cập nhật thất bại.") };
      }
    },
    [token, logout, refresh],
  );

  return {
    users: state.users,
    error: state.error,
    loading: state.key !== key,
    refresh,
    update,
  };
}
