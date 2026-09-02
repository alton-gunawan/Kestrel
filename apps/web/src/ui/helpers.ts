/**
 * Small shared UI helpers: data hooks with honest loading/empty/error states,
 * formatting helpers.
 */
import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch } from '../api/client';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  errorCode: string | null;
  reload: () => void;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      // One microtask defer keeps setState out of the synchronous effect body
      // (react-hooks/set-state-in-effect) and makes re-runs batch cleanly.
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setError(null);
      setErrorCode(null);
      try {
        const result = await fn();
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Request failed');
          setErrorCode(err instanceof ApiError ? err.code : 'UNAVAILABLE');
          setLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, errorCode, reload };
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
  }).format(new Date(iso));
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
  }).format(new Date(iso));
}

export function formatRelative(iso: string): string {
  const diffMs = Date.parse(iso) - Date.now();
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 60) return minutes >= 0 ? `in ${minutes}m` : `${-minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return hours >= 0 ? `in ${hours}h` : `${-hours}h ago`;
  const days = Math.round(hours / 24);
  return days >= 0 ? `in ${days}d` : `${-days}d ago`;
}

export { apiFetch };
