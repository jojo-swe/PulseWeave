'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '@/lib/push';

export function PushNotificationManager() {
  useEffect(() => {
    // Register Service Worker on mount to handle push events
    // This doesn't prompt the user yet, just installs the worker
    if (typeof window !== 'undefined') {
      registerServiceWorker().catch((err) => 
        console.error('Failed to register service worker:', err)
      );
    }
  }, []);

  return null;
}
