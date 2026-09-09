import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Runs an async request and tracks { data, loading, error }.
 *
 * Every page uses this so loading and error states are consistent
 * and no component is left rendering a blank area mid-request.
 *
 * @param {Function} request  async () => data
 * @param {Array}    deps     re-run when these change
 * @param {Object}   options  { immediate, initialData, onSuccess, onError }
 */
export function useApi(request, deps = [], options = {}) {
  const {
    immediate = true,
    initialData = null,
    onSuccess,
    onError,
  } = options;

  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);

  const mounted = useRef(true);
  const requestRef = useRef(request);
  const runId = useRef(0);

  requestRef.current = request;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const execute = useCallback(async (...args) => {
    runId.current += 1;
    const currentRun = runId.current;

    setLoading(true);
    setError(null);

    try {
      const result = await requestRef.current(...args);

      /* Ignore a slow response that a newer request has superseded. */
      if (!mounted.current || currentRun !== runId.current) return result;

      setData(result);
      onSuccess?.(result);
      return result;
    } catch (caught) {
      if (!mounted.current || currentRun !== runId.current) throw caught;

      setError(caught);
      onError?.(caught);
      throw caught;
    } finally {
      if (mounted.current && currentRun === runId.current) setLoading(false);
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!immediate) return;

    execute().catch(() => {
      /* the error is already captured in state */
    });
  }, [execute, immediate]);

  return { data, loading, error, refetch: execute, setData };
}

/**
 * Tracks the in-flight state of a one-off mutation (submit, delete,
 * cancel) so buttons can disable themselves and show progress.
 */
export function useMutation(mutate, options = {}) {
  const { onSuccess, onError } = options;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args) => {
      setLoading(true);
      setError(null);

      try {
        const result = await mutate(...args);
        if (mounted.current) onSuccess?.(result);
        return result;
      } catch (caught) {
        if (mounted.current) {
          setError(caught);
          onError?.(caught);
        }
        throw caught;
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [mutate, onSuccess, onError]
  );

  return { run, loading, error, setError };
}

/** Debounces a rapidly-changing value, e.g. a search box. */
export function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export default useApi;
