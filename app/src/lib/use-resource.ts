import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";

interface Resource<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  /** Replace the cached value without a round trip, for optimistic updates. */
  setData: (updater: T | ((current: T) => T)) => void;
  refresh: () => Promise<void>;
  reload: () => Promise<void>;
  setError: (message: string | null) => void;
}

/**
 * The three screens all load a list, pull to refresh, and mutate optimistically.
 * This keeps that shape in one place.
 *
 * `loader` is expected to be a useCallback -- it is the dependency that decides
 * when a reload happens (e.g. the timetable's selected date).
 */
export function useResource<T>(loader: () => Promise<T>): Resource<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards against a slow first request resolving after the component has
  // unmounted, or after a newer request has already landed.
  const requestId = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (mode: "initial" | "refresh") => {
      const id = ++requestId.current;
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);

      try {
        const result = await loader();
        if (!mounted.current || id !== requestId.current) return;
        setDataState(result);
        setError(null);
      } catch (err) {
        if (!mounted.current || id !== requestId.current) return;
        setError(
          err instanceof ApiError ? err.message : "Something went wrong.",
        );
      } finally {
        if (mounted.current && id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [loader],
  );

  useEffect(() => {
    void run("initial");
  }, [run]);

  const setData = useCallback((updater: T | ((current: T) => T)) => {
    setDataState((current) =>
      typeof updater === "function"
        ? current === null
          ? current
          : (updater as (c: T) => T)(current)
        : updater,
    );
  }, []);

  return {
    data,
    loading,
    refreshing,
    error,
    setData,
    setError,
    refresh: () => run("refresh"),
    reload: () => run("initial"),
  };
}
