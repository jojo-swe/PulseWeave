'use client';

import { useState, useCallback, useRef } from 'react';

/**
 * State for an optimistic update operation.
 */
interface OptimisticState<T> {
  data: T;
  pending: boolean;
  error: string | null;
  rollback: T | null;
}

/**
 * Hook for managing optimistic updates with automatic rollback on failure.
 *
 * @example
 * ```tsx
 * const { data, pending, error, update } = useOptimistic(messages);
 *
 * const handleSend = async (content: string) => {
 *   const tempMessage = { id: 'temp', content, pending: true };
 *   await update(
 *     [...data, tempMessage],
 *     async () => {
 *       const result = await api.messages.send(content);
 *       return [...data, result];
 *     }
 *   );
 * };
 * ```
 */
export function useOptimistic<T>(initialData: T) {
  const [state, setState] = useState<OptimisticState<T>>({
    data: initialData,
    pending: false,
    error: null,
    rollback: null,
  });

  const update = useCallback(
    async (
      optimisticData: T,
      asyncOperation: () => Promise<T>
    ): Promise<{ success: boolean; error?: string }> => {
      // Store current data for rollback
      const rollbackData = state.data;

      // Apply optimistic update immediately
      setState((prev) => ({
        ...prev,
        data: optimisticData,
        pending: true,
        error: null,
        rollback: rollbackData,
      }));

      try {
        // Perform the actual async operation
        const result = await asyncOperation();

        // Update with real data
        setState((prev) => ({
          ...prev,
          data: result,
          pending: false,
          rollback: null,
        }));

        return { success: true };
      } catch (err: any) {
        // Rollback on error
        setState((prev) => ({
          ...prev,
          data: rollbackData,
          pending: false,
          error: err.message || 'Operation failed',
          rollback: null,
        }));

        return { success: false, error: err.message };
      }
    },
    [state.data]
  );

  const setData = useCallback((newData: T) => {
    setState((prev) => ({
      ...prev,
      data: newData,
      error: null,
    }));
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    data: state.data,
    pending: state.pending,
    error: state.error,
    update,
    setData,
    clearError,
  };
}

/**
 * Hook for managing async operations with loading and error states.
 */
export function useAsync<T, Args extends any[]>(
  asyncFn: (...args: Args) => Promise<T>
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);

  const execute = useCallback(
    async (...args: Args): Promise<T | null> => {
      setLoading(true);
      setError(null);

      try {
        const result = await asyncFn(...args);
        setData(result);
        return result;
      } catch (err: any) {
        setError(err.message || 'An error occurred');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [asyncFn]
  );

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setData(null);
  }, []);

  return { execute, loading, error, data, reset };
}

/**
 * Hook for debounced values (useful for search inputs).
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update debounced value after delay
  if (timeoutRef.current) {
    clearTimeout(timeoutRef.current);
  }

  timeoutRef.current = setTimeout(() => {
    setDebouncedValue(value);
  }, delay);

  return debouncedValue;
}

/**
 * Hook for managing a queue of operations (useful for message sending).
 */
export function useOperationQueue<T>() {
  const [queue, setQueue] = useState<Array<{ id: string; data: T; status: 'pending' | 'success' | 'error' }>>([]);
  const processingRef = useRef(false);

  const add = useCallback((id: string, data: T) => {
    setQueue((prev) => [...prev, { id, data, status: 'pending' }]);
  }, []);

  const updateStatus = useCallback((id: string, status: 'success' | 'error') => {
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item))
    );

    // Remove successful items after a delay
    if (status === 'success') {
      setTimeout(() => {
        setQueue((prev) => prev.filter((item) => item.id !== id));
      }, 1000);
    }
  }, []);

  const remove = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const retry = useCallback((id: string) => {
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: 'pending' } : item))
    );
  }, []);

  return {
    queue,
    add,
    updateStatus,
    remove,
    retry,
    hasPending: queue.some((item) => item.status === 'pending'),
    hasErrors: queue.some((item) => item.status === 'error'),
  };
}
