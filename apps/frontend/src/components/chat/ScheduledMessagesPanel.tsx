'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatMessageTime } from '@/lib/utils';
import {
  X,
  Clock,
  Send,
  Trash2,
  Edit2,
  Calendar,
  Hash,
  Loader2,
} from 'lucide-react';

interface ScheduledMessagesPanelProps {
  onClose: () => void;
}

/**
 * Panel for viewing and managing scheduled messages.
 */
export function ScheduledMessagesPanel({ onClose }: ScheduledMessagesPanelProps) {
  const { token, scheduledMessages, setScheduledMessages, removeScheduledMessage, channels } = useStore();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    const loadScheduledMessages = async () => {
      try {
        const messages = await api.scheduled.list(token!);
        setScheduledMessages(messages);
      } catch (error) {
        console.error('Failed to load scheduled messages:', error);
      } finally {
        setLoading(false);
      }
    };

    loadScheduledMessages();
  }, [token, setScheduledMessages]);

  const handleSendNow = async (id: string) => {
    setActionLoading(id);
    try {
      await api.scheduled.sendNow(id, token!);
      removeScheduledMessage(id);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this scheduled message?')) return;
    
    setActionLoading(id);
    try {
      await api.scheduled.cancel(id, token!);
      removeScheduledMessage(id);
    } catch (error) {
      console.error('Failed to cancel message:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const getChannelName = (channelId: string) => {
    const channel = channels.find((c) => c.id === channelId);
    return channel?.name || 'Unknown channel';
  };

  const pendingMessages = scheduledMessages.filter((m) => m.status === 'pending');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card rounded-2xl border shadow-2xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Scheduled Messages</h2>
              <p className="text-sm text-muted-foreground">
                {pendingMessages.length} pending
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Messages list */}
        <ScrollArea className="flex-1 p-4">
          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="p-4 rounded-lg bg-muted/30">
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : pendingMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Calendar className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-medium mb-1">No scheduled messages</h3>
              <p className="text-sm text-muted-foreground">
                Schedule a message from the message input
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingMessages.map((message) => (
                <div
                  key={message.id}
                  className="p-4 rounded-lg bg-muted/30 border border-border/50"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Hash className="h-3 w-3" />
                      <span>{getChannelName(message.channelId)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => handleSendNow(message.id)}
                        disabled={actionLoading === message.id}
                        title="Send now"
                      >
                        {actionLoading === message.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Send className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleCancel(message.id)}
                        disabled={actionLoading === message.id}
                        title="Cancel"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  
                  <p className="text-sm mb-3 line-clamp-3">{message.content}</p>
                  
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>
                      Scheduled for{' '}
                      <span className="font-medium text-foreground">
                        {new Date(message.scheduledAt).toLocaleString()}
                      </span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="p-4 border-t border-border/50">
          <Button variant="outline" onClick={onClose} className="w-full">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
