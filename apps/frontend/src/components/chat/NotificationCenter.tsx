'use client';

import { useState } from 'react';
import { useStore } from '@/store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { X, Bell, BellOff, Check, Trash2, Hash, MessageSquare } from 'lucide-react';
import { cn, getInitials, generateAvatarColor, formatRelativeTime } from '@/lib/utils';

interface Notification {
  id: string;
  type: 'mention' | 'reply' | 'reaction' | 'channel';
  title: string;
  message: string;
  channelId?: string;
  channelName?: string;
  user?: {
    displayName: string;
    avatarUrl?: string;
  };
  read: boolean;
  createdAt: string;
}

interface NotificationCenterProps {
  onClose: () => void;
}

export function NotificationCenter({ onClose }: NotificationCenterProps) {
  const { channels, setCurrentChannel } = useStore();
  
  // Mock notifications for demo - in production, these would come from the backend
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: '1',
      type: 'mention',
      title: 'New mention',
      message: 'John mentioned you in #general: "Hey @you, check this out!"',
      channelName: 'general',
      user: { displayName: 'John Doe' },
      read: false,
      createdAt: new Date(Date.now() - 5 * 60000).toISOString(),
    },
    {
      id: '2',
      type: 'reply',
      title: 'New reply',
      message: 'Sarah replied to your message in #random',
      channelName: 'random',
      user: { displayName: 'Sarah Smith' },
      read: false,
      createdAt: new Date(Date.now() - 30 * 60000).toISOString(),
    },
    {
      id: '3',
      type: 'reaction',
      title: 'New reaction',
      message: 'Mike reacted 👍 to your message',
      user: { displayName: 'Mike Johnson' },
      read: true,
      createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    },
  ]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = (id: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const deleteNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    if (notification.channelName) {
      const channel = channels.find(c => c.name === notification.channelName);
      if (channel) {
        setCurrentChannel(channel);
      }
    }
    onClose();
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'mention':
        return <span className="text-lg">@</span>;
      case 'reply':
        return <MessageSquare className="h-4 w-4" />;
      case 'reaction':
        return <span className="text-lg">👍</span>;
      case 'channel':
        return <Hash className="h-4 w-4" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end pt-16 pr-4 bg-black/50" onClick={onClose}>
      <div 
        className="bg-background rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in fade-in slide-in-from-right-5 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <h2 className="font-semibold">Notifications</h2>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllAsRead}>
                <Check className="h-4 w-4 mr-1" />
                Mark all read
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Notifications List */}
        <ScrollArea className="max-h-[60vh]">
          {notifications.length > 0 ? (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    'p-4 hover:bg-accent/50 transition-colors cursor-pointer relative group',
                    !notification.read && 'bg-primary/5'
                  )}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex gap-3">
                    <div className={cn(
                      'h-10 w-10 rounded-full flex items-center justify-center shrink-0',
                      notification.read ? 'bg-muted' : 'bg-primary/10'
                    )}>
                      {notification.user ? (
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={notification.user.avatarUrl} />
                          <AvatarFallback className={cn(generateAvatarColor(notification.user.displayName))}>
                            {getInitials(notification.user.displayName)}
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        getNotificationIcon(notification.type)
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'text-sm',
                          !notification.read && 'font-medium'
                        )}>
                          {notification.title}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(notification.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                        {notification.message}
                      </p>
                    </div>
                    {!notification.read && (
                      <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-2" />
                    )}
                  </div>
                  
                  {/* Delete button on hover */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNotification(notification.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              <BellOff className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No notifications</p>
              <p className="text-sm mt-1">You're all caught up!</p>
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="p-3 border-t">
            <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={clearAll}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear all notifications
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
