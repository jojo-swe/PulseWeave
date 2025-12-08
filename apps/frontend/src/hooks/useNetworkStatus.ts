'use client';

import { useState, useEffect, useCallback } from 'react';

interface NetworkStatus {
  isOnline: boolean;
  isReconnecting: boolean;
  lastOnline: Date | null;
}

/**
 * Hook to monitor network connectivity status.
 * Provides real-time updates when the user goes online/offline.
 */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isReconnecting: false,
    lastOnline: null,
  });

  const handleOnline = useCallback(() => {
    setStatus((prev) => ({
      ...prev,
      isOnline: true,
      isReconnecting: false,
    }));
  }, []);

  const handleOffline = useCallback(() => {
    setStatus((prev) => ({
      ...prev,
      isOnline: false,
      lastOnline: new Date(),
    }));
  }, []);

  useEffect(() => {
    // Set initial state
    setStatus((prev) => ({
      ...prev,
      isOnline: navigator.onLine,
    }));

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  return status;
}

/**
 * Hook to check if the API server is reachable.
 * More reliable than just checking navigator.onLine.
 */
export function useApiHealth(checkInterval = 30000) {
  const [isApiReachable, setIsApiReachable] = useState(true);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9090';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${API_URL}/health/live`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      setIsApiReachable(response.ok);
      setLastCheck(new Date());
    } catch {
      setIsApiReachable(false);
      setLastCheck(new Date());
    }
  }, []);

  useEffect(() => {
    // Initial check
    checkHealth();

    // Periodic checks
    const interval = setInterval(checkHealth, checkInterval);

    // Also check when coming back online
    const handleOnline = () => {
      setTimeout(checkHealth, 1000); // Small delay to let network stabilize
    };
    window.addEventListener('online', handleOnline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
    };
  }, [checkHealth, checkInterval]);

  return { isApiReachable, lastCheck, checkHealth };
}
