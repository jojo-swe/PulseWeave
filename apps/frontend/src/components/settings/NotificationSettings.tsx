'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { subscribeToPush, unsubscribeFromPush } from '@/lib/push';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Bell, Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/toast';

export function NotificationSettings() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    // Check if push is supported
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setSupported(true);
      // Check current subscription status
      navigator.serviceWorker.ready.then(async (registration) => {
        const subscription = await registration.pushManager.getSubscription();
        setEnabled(!!subscription);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  const handleToggle = async (checked: boolean) => {
    setLoading(true);
    try {
      if (checked) {
        await subscribeToPush();
        toast.success('Push notifications enabled');
      } else {
        await unsubscribeFromPush();
        toast.success('Push notifications disabled');
      }
      setEnabled(checked);
    } catch (error: any) {
      console.error('Failed to toggle notifications:', error);
      toast.error('Failed to update settings', error.message);
      // Revert state if failed
      setEnabled(!checked);
    } finally {
      setLoading(false);
    }
  };

  if (!supported) {
    return (
      <div className="p-4 border rounded-lg bg-muted/50">
        <div className="flex items-center gap-3 opacity-50">
          <Bell className="h-5 w-5" />
          <div>
            <h3 className="font-medium">Push Notifications</h3>
            <p className="text-sm">Your browser does not support push notifications.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 border rounded-lg space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-medium">Push Notifications</h3>
            <p className="text-sm text-muted-foreground">
              Receive notifications for mentions and direct messages even when the app is closed.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Switch
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={loading}
          />
        </div>
      </div>
    </div>
  );
}
