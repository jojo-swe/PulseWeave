'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Send, Hash, MessageCircle } from 'lucide-react';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { cn, formatMessageTime, getInitials, generateAvatarColor } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Markdown } from '@/components/ui/markdown';

interface Message {
  id: string;
  content: string;
  userId: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
  createdAt: string;
  isEdited?: boolean;
}

interface ThreadPanelProps {
  parentMessage: Message;
  channelName: string;
  onClose: () => void;
  onSendReply: (content: string, parentId: string) => Promise<void>;
}

export function ThreadPanel({ parentMessage, channelName, onClose, onSendReply }: ThreadPanelProps) {
  const [replies, setReplies] = useState<Message[]>([]);
  const [replyContent, setReplyContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const { token, user } = useStore();

  // Load thread replies
  useEffect(() => {
    const loadReplies = async () => {
      if (!token) return;
      
      try {
        // For now, we'll just use the parent message
        // In a full implementation, you'd fetch replies from the API
        setReplies([]);
      } catch (error) {
        console.error('Failed to load thread:', error);
      } finally {
        setLoading(false);
      }
    };

    loadReplies();
  }, [parentMessage.id, token]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [replies]);

  // Handle send reply
  const handleSend = async () => {
    if (!replyContent.trim() || sending) return;

    setSending(true);
    try {
      await onSendReply(replyContent.trim(), parentMessage.id);
      setReplyContent('');
      
      // Optimistically add the reply
      const newReply: Message = {
        id: `temp-${Date.now()}`,
        content: replyContent.trim(),
        userId: user?.id || '',
        user: {
          id: user?.id || '',
          username: user?.username || '',
          displayName: user?.displayName || '',
          avatarUrl: user?.avatarUrl,
        },
        createdAt: new Date().toISOString(),
      };
      setReplies(prev => [...prev, newReply]);
    } catch (error) {
      console.error('Failed to send reply:', error);
    } finally {
      setSending(false);
    }
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="w-96 h-full border-l border-gray-700 flex flex-col bg-gray-900">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-gray-700 shrink-0">
        <div>
          <h2 className="font-semibold text-white">Thread</h2>
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <Hash className="h-3 w-3" />
            {channelName}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Parent Message */}
      <div className="p-4 border-b border-gray-700 bg-gray-800/50">
        <div className="flex gap-3">
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarImage src={parentMessage.user.avatarUrl} />
            <AvatarFallback className={cn('text-sm', generateAvatarColor(parentMessage.user.displayName))}>
              {getInitials(parentMessage.user.displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-sm text-white">
                {parentMessage.user.displayName}
              </span>
              <span className="text-xs text-gray-500">
                {formatMessageTime(parentMessage.createdAt)}
              </span>
            </div>
            <Markdown content={parentMessage.content} className="mt-1 text-sm text-gray-300" />
          </div>
        </div>
      </div>

      {/* Replies */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
          </div>
        ) : replies.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                <MessageCircle className="h-7 w-7 text-primary" />
              </div>
              <p className="text-sm font-medium text-white mb-1">No replies yet</p>
              <p className="text-xs text-gray-500">Be the first to reply to this thread!</p>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {replies.map((reply) => (
              <div key={reply.id} className="flex gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={reply.user.avatarUrl} />
                  <AvatarFallback className={cn('text-xs', generateAvatarColor(reply.user.displayName))}>
                    {getInitials(reply.user.displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-sm text-white">
                      {reply.user.displayName}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatMessageTime(reply.createdAt)}
                    </span>
                  </div>
                  <Markdown content={reply.content} className="mt-0.5 text-sm text-gray-300" />
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {/* Reply Input */}
      <div className="p-3 border-t border-gray-700">
        <div className="flex items-end gap-2 rounded-lg border border-gray-600 bg-gray-800 p-2">
          <textarea
            ref={textareaRef}
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Reply..."
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 resize-none outline-none min-h-[36px] max-h-32"
            rows={1}
          />
          <Button
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={!replyContent.trim() || sending}
            onClick={handleSend}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
