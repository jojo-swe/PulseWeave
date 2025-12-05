'use client';

import { useState, useEffect } from 'react';
import { X, Pin, MessageSquare, ExternalLink } from 'lucide-react';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { cn, formatMessageTime, formatMessageDate, getInitials, generateAvatarColor } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Markdown } from '@/components/ui/markdown';

interface PinnedMessage {
  id: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
  pinnedAt?: string;
  pinnedBy?: {
    displayName: string;
  };
}

interface PinnedMessagesPanelProps {
  onClose: () => void;
  onJumpToMessage?: (messageId: string) => void;
  onUnpin?: (messageId: string) => void;
}

/**
 * Panel component that displays all pinned messages in the current channel.
 * Allows users to view, jump to, or unpin messages.
 */
export function PinnedMessagesPanel({ onClose, onJumpToMessage, onUnpin }: PinnedMessagesPanelProps) {
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const { token, currentChannel, user } = useStore();

  // Load pinned messages
  useEffect(() => {
    const loadPinnedMessages = async () => {
      if (!token || !currentChannel) return;
      
      setLoading(true);
      try {
        const messages = await api.messages.getPinned(currentChannel.id, token);
        setPinnedMessages(messages);
      } catch (error) {
        console.error('Failed to load pinned messages:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPinnedMessages();
  }, [token, currentChannel]);

  // Handle unpin
  const handleUnpin = async (messageId: string) => {
    if (!token) return;
    
    try {
      await api.messages.unpin(messageId, token);
      setPinnedMessages(prev => prev.filter(m => m.id !== messageId));
      onUnpin?.(messageId);
    } catch (error) {
      console.error('Failed to unpin message:', error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Pin className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Pinned Messages</h2>
            {!loading && (
              <span className="text-sm text-muted-foreground">
                ({pinnedMessages.length})
              </span>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <ScrollArea className="max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : pinnedMessages.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <Pin className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium">No pinned messages</p>
              <p className="text-sm text-muted-foreground mt-1">
                Pin important messages to find them easily later
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {pinnedMessages.map((message) => (
                <div
                  key={message.id}
                  className="p-4 hover:bg-accent/30 transition-colors group"
                >
                  <div className="flex gap-3">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarImage src={message.user.avatarUrl} />
                      <AvatarFallback className={cn('text-sm', generateAvatarColor(message.user.displayName))}>
                        {getInitials(message.user.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="font-semibold text-sm">
                          {message.user.displayName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatMessageDate(message.createdAt)} at {formatMessageTime(message.createdAt)}
                        </span>
                      </div>
                      <Markdown 
                        content={message.content} 
                        className="text-sm line-clamp-3" 
                      />
                      
                      {/* Actions */}
                      <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            onJumpToMessage?.(message.id);
                            onClose();
                          }}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Jump to message
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          onClick={() => handleUnpin(message.id)}
                        >
                          <Pin className="h-3 w-3 mr-1" />
                          Unpin
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Pinned by info */}
                  {message.pinnedBy && (
                    <div className="mt-2 ml-12 text-xs text-muted-foreground flex items-center gap-1">
                      <Pin className="h-3 w-3" />
                      Pinned by {message.pinnedBy.displayName}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="border-t px-4 py-2 text-xs text-muted-foreground">
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">ESC</kbd> to close
        </div>
      </div>
    </div>
  );
}

export default PinnedMessagesPanel;
