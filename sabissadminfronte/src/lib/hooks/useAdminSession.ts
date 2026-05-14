import { createSignal, onMount } from "solid-js";

import { getAdminMe, type AdminMeResponse } from "~/lib/api/admin";
import { getErrorMessage, isApiError } from "~/lib/api/core";
import { clearAdminToken, readAdminToken } from "~/lib/auth/admin-session";

interface UseAdminSessionOptions {
  autoload?: boolean;
}

export function useAdminSession(options: UseAdminSessionOptions = {}) {
  const [profile, setProfile] = createSignal<AdminMeResponse | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);

  async function refresh() {
    const token = readAdminToken();

    if (!token) {
      setProfile(null);
      setError(null);
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const nextProfile = await getAdminMe(token);
      setProfile(nextProfile);

      return nextProfile;
    } catch (sessionError) {
      if (isApiError(sessionError) && (sessionError.status === 401 || sessionError.status === 403)) {
        clear();
      } else {
        setError(getErrorMessage(sessionError));
      }

      throw sessionError;
    } finally {
      setLoading(false);
    }
  }

  function clear() {
    clearAdminToken();
    setProfile(null);
    setError(null);
  }

  onMount(() => {
    if (options.autoload === false) {
      return;
    }

    void refresh().catch(() => undefined);
  });

  return {
    clear,
    error,
    isAuthenticated: () => Boolean(readAdminToken()),
    loading,
    profile,
    refresh,
  };
}
