import { useCallback, useEffect, useState } from 'react';

/** Pull a human-readable message out of an axios error, with a fallback. */
export function apiErrorMessage(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { error?: { message?: string } } } })
    ?.response?.data?.error?.message;
  return msg ?? fallback;
}

export interface ApiResource<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  /** Re-fetch showing the pull-to-refresh spinner rather than the full loader. */
  refresh: () => Promise<void>;
  /** Re-fetch silently (e.g. after a mutation). */
  reload: () => Promise<void>;
  /** Optimistically replace the local copy without a round-trip. */
  set: (next: T) => void;
}

/**
 * Standard fetch-once-with-refresh hook, matching the axios pattern the
 * admin screens already use. `fetcher` must be stable (wrap in useCallback).
 */
export function useApiResource<T>(fetcher: () => Promise<T>, errorFallback: string): ApiResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent') => {
      if (mode === 'refresh') setRefreshing(true);
      setError(null);
      try {
        const next = await fetcher();
        setData(next);
      } catch (e) {
        setError(apiErrorMessage(e, errorFallback));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetcher, errorFallback],
  );

  useEffect(() => {
    void run('initial');
  }, [run]);

  return {
    data,
    loading,
    refreshing,
    error,
    refresh: () => run('refresh'),
    reload: () => run('silent'),
    set: setData,
  };
}
