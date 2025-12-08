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
 * Uses exponential backoff on failures to reduce noise.
 */
export function useApiHealth(baseInterval = 30000) {
  const [isApiReachable, setIsApiReachable] = useState(true);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);

  const checkHealth = useCallback(async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9090';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${API_URL}/health/live`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      setIsApiReachable(response.ok);
      setLastCheck(new Date());
      setConsecutiveFailures(0); // Reset on success
      return response.ok;
    } catch {
      setConsecutiveFailures((prev) => prev + 1);
      setLastCheck(new Date());
      // Only mark unreachable after 2+ failures to avoid flicker
      if (consecutiveFailures >= 1) {
        setIsApiReachable(false);
      }
      return false;
    }
  }, [consecutiveFailures]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const scheduleCheck = () => {
      // Exponential backoff: 30s, 60s, 120s, max 5min
      const backoffInterval = Math.min(
        baseInterval * Math.pow(2, consecutiveFailures),
        300000
      );
      timeoutId = setTimeout(async () => {
        await checkHealth();
        scheduleCheck();
      }, consecutiveFailures > 0 ? backoffInterval : baseInterval);
    };

    // Initial check after short delay
    const initialTimeout = setTimeout(() => {
      checkHealth().then(() => scheduleCheck());
    }, 3000);

    // Also check when coming back online
    const handleOnline = () => {
      setConsecutiveFailures(0); // Reset backoff
      setTimeout(checkHealth, 1000);
    };
    window.addEventListener('online', handleOnline);

    return () => {
      clearTimeout(initialTimeout);
      clearTimeout(timeoutId);
      window.removeEventListener('online', handleOnline);
    };
  }, [checkHealth, baseInterval, consecutiveFailures]);

  return { isApiReachable, lastCheck, checkHealth, consecutiveFailures };
}
