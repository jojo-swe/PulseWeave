'use client';

import { useEffect, useState } from 'react';
import { WifiOff, Wifi, AlertTriangle, RefreshCw } from 'lucide-react';
import { useNetworkStatus, useApiHealth } from '@/hooks/useNetworkStatus';
import { cn } from '@/lib/utils';

interface NetworkStatusBannerProps {
  className?: string;
}

/**
 * Banner that shows when the user is offline or the API is unreachable.
 */
export function NetworkStatusBanner({ className }: NetworkStatusBannerProps) {
  const { isOnline } = useNetworkStatus();
  const { isApiReachable, checkHealth } = useApiHealth();
  const [isVisible, setIsVisible] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // Show banner when offline or API unreachable
  useEffect(() => {
    if (!isOnline || !isApiReachable) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to external network state
      setIsVisible(true);
    } else {
      // Delay hiding to show "reconnected" message briefly
      const timeout = setTimeout(() => setIsVisible(false), 2000);
      return () => clearTimeout(timeout);
    }
  }, [isOnline, isApiReachable]);

  const handleRetry = async () => {
    setIsRetrying(true);
    await checkHealth();
    setIsRetrying(false);
  };

  if (!isVisible) return null;

  const isConnected = isOnline && isApiReachable;

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-[100] px-4 py-2 text-sm font-medium text-center transition-all duration-300',
        isConnected
          ? 'bg-emerald-500 text-white'
          : 'bg-amber-500 text-amber-950',
        className
      )}
    >
      <div className="flex items-center justify-center gap-2">
        {isConnected ? (
          <>
            <Wifi className="w-4 h-4" />
            <span>Connection restored</span>
          </>
        ) : !isOnline ? (
          <>
            <WifiOff className="w-4 h-4" />
            <span>You&apos;re offline. Check your internet connection.</span>
          </>
        ) : (
          <>
            <AlertTriangle className="w-4 h-4" />
            <span>Unable to reach server.</span>
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-600/20 hover:bg-amber-600/30 transition-colors"
            >
              <RefreshCw className={cn('w-3 h-3', isRetrying && 'animate-spin')} />
              {isRetrying ? 'Retrying...' : 'Retry'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Small indicator dot for showing connection status in compact spaces.
 */
export function NetworkStatusIndicator({ className }: { className?: string }) {
  const { isOnline } = useNetworkStatus();
  const { isApiReachable } = useApiHealth();

  const isConnected = isOnline && isApiReachable;

  return (
    <div
      className={cn(
        'w-2 h-2 rounded-full transition-colors',
        isConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse',
        className
      )}
      title={isConnected ? 'Connected' : 'Connection issues'}
    />
  );
}

/**
 * Toast-style notification for connection status changes.
 */
export function ConnectionToast() {
  const { isOnline } = useNetworkStatus();
  const { isApiReachable } = useApiHealth();
  const [showToast, setShowToast] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const isConnected = isOnline && isApiReachable;

    if (!isConnected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to external network state
      setWasOffline(true);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to external network state
      setShowToast(true);
    } else if (wasOffline) {
      // Show reconnected toast
      setShowToast(true);
      const timeout = setTimeout(() => {
        setShowToast(false);
        setWasOffline(false);
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [isOnline, isApiReachable, wasOffline]);

  if (!showToast) return null;

  const isConnected = isOnline && isApiReachable;

  return (
    <div
      className={cn(
        'fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-lg shadow-lg text-sm font-medium transition-all duration-300',
        isConnected
          ? 'bg-emerald-500 text-white'
          : 'bg-card border border-border text-foreground'
      )}
    >
      <div className="flex items-center gap-2">
        {isConnected ? (
          <>
            <Wifi className="w-4 h-4" />
            <span>Back online</span>
          </>
        ) : (
          <>
            <WifiOff className="w-4 h-4 text-amber-500" />
            <span>Connection lost</span>
          </>
        )}
      </div>
    </div>
  );
}
