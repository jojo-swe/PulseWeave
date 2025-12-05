// Browser notification utilities

let notificationPermission: NotificationPermission = 'default';

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.log('This browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    notificationPermission = 'granted';
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    notificationPermission = permission;
    return permission === 'granted';
  }

  return false;
}

export function canNotify(): boolean {
  return notificationPermission === 'granted' || Notification.permission === 'granted';
}

interface NotifyOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  onClick?: () => void;
}

export function notify({ title, body, icon, tag, onClick }: NotifyOptions): Notification | null {
  if (!canNotify()) return null;
  
  // Don't notify if window is focused
  if (document.hasFocus()) return null;

  try {
    const notification = new Notification(title, {
      body,
      icon: icon || '/icon.png',
      tag: tag || 'chatterbox-message',
      badge: '/icon.png',
      silent: false,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
      onClick?.();
    };

    // Auto close after 5 seconds
    setTimeout(() => notification.close(), 5000);

    return notification;
  } catch (error) {
    console.error('Failed to show notification:', error);
    return null;
  }
}

export function notifyNewMessage(
  senderName: string,
  channelName: string,
  messagePreview: string,
  onClick?: () => void
): Notification | null {
  return notify({
    title: `${senderName} in #${channelName}`,
    body: messagePreview.length > 100 ? messagePreview.slice(0, 100) + '...' : messagePreview,
    tag: `message-${channelName}`,
    onClick,
  });
}

// Play notification sound
let audioContext: AudioContext | null = null;

export function playNotificationSound() {
  try {
    // Create a simple beep using Web Audio API
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
  } catch (error) {
    // Silently fail if audio doesn't work
  }
}
