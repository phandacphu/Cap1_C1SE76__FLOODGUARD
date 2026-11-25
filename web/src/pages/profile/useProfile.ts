import { useEffect, useState } from "react";
import {
  fetchMyProfile,
  ProfileApiError,
  type UserProfile,
} from "./profileApi";

interface ProfileState {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
}

export function useProfile(
  token: string | null,
  onUnauthorized: () => void,
) {
  const [attempt, setAttempt] = useState(0);

  const [state, setState] = useState<ProfileState>({
    profile: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();
    let active = true;

    fetchMyProfile(token, controller.signal)
      .then((profile) => {
        if (!active) return;

        setState({
          profile,
          loading: false,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (!active) return;

        if (
          error instanceof ProfileApiError &&
          error.status === 401
        ) {
          onUnauthorized();
          return;
        }

        setState({
          profile: null,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Không thể tải thông tin hồ sơ.",
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [token, onUnauthorized, attempt]);

  const refresh = () => {
    setState({
      profile: null,
      loading: true,
      error: null,
    });

    setAttempt((value) => value + 1);
  };

  return { ...state, refresh };
}