'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { cn, formatMessageTime, getInitials, generateAvatarColor } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Bell,
  MessageSquare,
  AtSign,
  Heart,
  UserPlus,
  Hash,
  Check,
  CheckCheck,
  Trash2,
  Settings,
} from 'lucide-react';

interface Activity {
  id: string;
  type: 'mention' | 'reply' | 'reaction' | 'channel_invite' | 'dm';
  message?: string;
  channelName?: string;
  channelId?: string;
  fromUser: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };
  createdAt: string;
  read: boolean;
}

interface ActivityPanelProps {
  onClose?: () => void;
}

/**
 * Activity panel showing notifications and mentions.
 */
export function ActivityPanel({ onClose }: ActivityPanelProps) {
  const { token, setCurrentChannel, channels } = useStore();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'mentions' | 'unread'>('all');

  // Mock activities for now - replace with API call
  useEffect(() => {
    const loadActivities = async () => {
      setLoading(true);
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Mock data
      setActivities([
        {
          id: '1',
          type: 'mention',
          message: 'Hey @you, can you check this out?',
          channelName: 'general',
          channelId: channels[0]?.id,
          fromUser: { id: '1', displayName: 'Alice Johnson', avatarUrl: undefined },
          createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
          read: false,
        },
        {
          id: '2',
          type: 'reply',
          message: 'Great point! I agree with your suggestion.',
          channelName: 'development',
          channelId: channels[1]?.id,
          fromUser: { id: '2', displayName: 'Bob Smith', avatarUrl: undefined },
          createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
          read: false,
        },
        {
          id: '3',
          type: 'reaction',
          message: 'reacted with 🎉 to your message',
          channelName: 'general',
          channelId: channels[0]?.id,
          fromUser: { id: '3', displayName: 'Carol White', avatarUrl: undefined },
          createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
          read: true,
        },
        {
          id: '4',
          type: 'dm',
          message: 'Hey, do you have a minute to chat?',
          fromUser: { id: '4', displayName: 'David Brown', avatarUrl: undefined },
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
          read: true,
        },
      ]);
      setLoading(false);
    };

    loadActivities();
  }, [channels]);

  const filteredActivities = activities.filter(activity => {
    if (filter === 'mentions') return activity.type === 'mention';
    if (filter === 'unread') return !activity.read;
    return true;
  });

  const markAsRead = (id: string) => {
    setActivities(prev => 
      prev.map(a => a.id === id ? { ...a, read: true } : a)
    );
  };

  const markAllAsRead = () => {
    setActivities(prev => prev.map(a => ({ ...a, read: true })));
  };

  const clearAll = () => {
    setActivities([]);
  };

  const getActivityIcon = (type: Activity['type']) => {
    switch (type) {
      case 'mention': return <AtSign className="h-4 w-4 text-blue-400" />;
      case 'reply': return <MessageSquare className="h-4 w-4 text-green-400" />;
      case 'reaction': return <Heart className="h-4 w-4 text-pink-400" />;
      case 'channel_invite': return <UserPlus className="h-4 w-4 text-purple-400" />;
      case 'dm': return <MessageSquare className="h-4 w-4 text-primary" />;
      default: return <Bell className="h-4 w-4" />;
    }
  };

  const handleActivityClick = (activity: Activity) => {
    markAsRead(activity.id);
    if (activity.channelId) {
      const channel = channels.find(c => c.id === activity.channelId);
      if (channel) {
        setCurrentChannel(channel);
      }
    }
  };

  const unreadCount = activities.filter(a => !a.read).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-lg">Activity</h2>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
              title="Mark all as read"
            >
              <CheckCheck className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={clearAll}
              disabled={activities.length === 0}
              title="Clear all"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
          {(['all', 'mentions', 'unread'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors capitalize',
                filter === f
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Activity list */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {loading ? (
            <div className="space-y-3 p-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <Bell className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm">
                {filter === 'all' 
                  ? "You're all caught up!" 
                  : filter === 'mentions'
                  ? 'No mentions yet'
                  : 'No unread notifications'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredActivities.map((activity) => (
                <button
                  key={activity.id}
                  onClick={() => handleActivityClick(activity)}
                  className={cn(
                    'w-full flex items-start gap-3 p-3 rounded-lg text-left transition-colors',
                    activity.read
                      ? 'hover:bg-muted/50'
                      : 'bg-primary/5 hover:bg-primary/10'
                  )}
                >
                  <div className="relative">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={activity.fromUser.avatarUrl} />
                      <AvatarFallback className={cn('text-xs', generateAvatarColor(activity.fromUser.displayName))}>
                        {getInitials(activity.fromUser.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-background flex items-center justify-center">
                      {getActivityIcon(activity.type)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {activity.fromUser.displayName}
                      </span>
                      {!activity.read && (
                        <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {activity.message}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {activity.channelName && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Hash className="h-3 w-3" />
                          {activity.channelName}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatMessageTime(activity.createdAt)}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Settings link */}
      <div className="p-3 border-t border-border/50">
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground">
          <Settings className="h-4 w-4" />
          Notification settings
        </Button>
      </div>
    </div>
  );
}
