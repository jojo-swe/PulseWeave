import { api } from './api';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BAOcikxVSXADQjF9KPhx-AfJ3HxPVmKF5J6vFVnGj7ynr4Yt8isWprctA2O7kaA6NWprqXMst9blsgODbZg8aHc';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerServiceWorker() {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      console.log('Service Worker registered with scope:', registration.scope);
      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      throw error;
    }
  }
  return null;
}

export async function subscribeToPush() {
  const registration = await navigator.serviceWorker.ready;

  try {
    // Check current permission
    if (Notification.permission === 'denied') {
      throw new Error('Push notifications are blocked');
    }

    // Subscribe
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });

    console.log('Push subscription successful:', subscription);

    // Send to backend
    const { endpoint, keys } = subscription.toJSON();
    
    // We treat 'notifications' as a separate part of API even if slightly redundant with other methods
    // We'll add this to api.ts properly, but for now we can fetch directly or extend api.ts
    // Let's extend api.ts in a bit, but for now call fetch directly via existing api helper if possible
    // Actually, I should update api.ts to include notification methods
    
    await api.post('/notifications/subscribe', {
      endpoint,
      keys
    });

    return subscription;
  } catch (error) {
    console.error('Failed to subscribe to push:', error);
    throw error;
  }
}

export async function unsubscribeFromPush() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  
  if (subscription) {
    await subscription.unsubscribe();
    await api.post('/notifications/unsubscribe', {
      endpoint: subscription.endpoint
    });
  }
}
