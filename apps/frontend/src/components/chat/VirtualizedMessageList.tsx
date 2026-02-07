'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { VariableSizeList as List } from 'react-window';
import { useStore } from '@/store';
import { cn, formatMessageTime, formatMessageDate, getInitials, generateAvatarColor } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { Smile, MessageSquare, Pencil, Trash2, Copy, Check, Pin, Hash, Sparkles } from 'lucide-react';
import { EmojiPicker } from '@/components/ui/emoji-picker';
import { api } from '@/lib/api';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface VirtualizedMessageListProps {
  onReaction?: (messageId: string, emoji: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  onDelete?: (messageId: string) => void;
  onOpenThread?: (message: any) => void;
  onPin?: (messageId: string) => void;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => Promise<void>;
}

type RowItem =
  | { type: 'date'; date: string }
  | { type: 'message'; message: any; showHeader: boolean; isOwn: boolean };

const ESTIMATED_ROW_HEIGHT = 60;
const DATE_SEPARATOR_HEIGHT = 48;

export function VirtualizedMessageList({
  onReaction,
  onEdit,
  onDelete,
  onOpenThread,
  onPin,
  isLoadingMore,
  hasMore,
  onLoadMore,
}: VirtualizedMessageListProps) {
  const { messages, user, currentChannel, token } = useStore();
  const listRef = useRef<List>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const sizeMap = useRef<Record<number, number>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(400);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [emojiPickerMessageId, setEmojiPickerMessageId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);

  // Build flat list of renderable rows (date separators + messages)
  const rows: RowItem[] = [];
  let prevDate = '';
  let prevUserId = '';
  let prevTime = 0;

  messages.forEach((message) => {
    const messageDate = formatMessageDate(message.createdAt);
    if (messageDate !== prevDate) {
      rows.push({ type: 'date', date: messageDate });
      prevDate = messageDate;
      prevUserId = '';
      prevTime = 0;
    }

    const msgTime = new Date(message.createdAt).getTime();
    const showHeader =
      prevUserId !== message.userId || msgTime - prevTime > 5 * 60 * 1000;

    rows.push({
      type: 'message',
      message,
      showHeader,
      isOwn: message.userId === user?.id,
    });

    prevUserId = message.userId;
    prevTime = msgTime;
  });

  // Measure container height
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (listRef.current && rows.length > 0) {
      listRef.current.scrollToItem(rows.length - 1, 'end');
    }
  }, [messages.length]);

  // Reset size cache when messages change
  useEffect(() => {
    sizeMap.current = {};
    listRef.current?.resetAfterIndex(0);
  }, [currentChannel?.id]);

  const getItemSize = (index: number) => {
    return sizeMap.current[index] || (rows[index]?.type === 'date' ? DATE_SEPARATOR_HEIGHT : ESTIMATED_ROW_HEIGHT);
  };

  const setRowHeight = useCallback((index: number, height: number) => {
    if (sizeMap.current[index] !== height) {
      sizeMap.current[index] = height;
      listRef.current?.resetAfterIndex(index, false);
    }
  }, []);

  // Infinite scroll: detect scroll to top
  const handleScroll = useCallback(({ scrollOffset }: { scrollOffset: number }) => {
    if (scrollOffset < 100 && hasMore && !isLoadingMore) {
      onLoadMore?.();
    }
  }, [hasMore, isLoadingMore, onLoadMore]);

  const handlePin = async (messageId: string) => {
    if (!token) return;
    setPinningId(messageId);
    try {
      await api.messages.pin(messageId, token);
      onPin?.(messageId);
    } catch {
      // Pin failed silently
    } finally {
      setPinningId(null);
    }
  };

  const handleStartEdit = (msg: { id: string; content: string }) => {
    setEditingId(msg.id);
    setEditContent(msg.content);
  };

  const handleSaveEdit = () => {
    if (editingId && editContent.trim()) {
      onEdit?.(editingId, editContent.trim());
    }
    setEditingId(null);
    setEditContent('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  const handleCopy = async (content: string, messageId: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(messageId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const quickReactions = ['👍', '❤️', '😂', '🎉', '🚀', '👀'];

  // Empty state
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="relative mx-auto w-20 h-20 mb-6">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-2xl rotate-6" />
            <div className="absolute inset-0 bg-gradient-to-br from-primary to-purple-500 rounded-2xl flex items-center justify-center">
              <Hash className="h-10 w-10 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 bg-yellow-400 rounded-full p-1.5 shadow-lg">
              <Sparkles className="h-4 w-4 text-yellow-900" />
            </div>
          </div>
          <h3 className="text-xl font-semibold mb-2">
            Welcome to #{currentChannel?.name || 'this channel'}!
          </h3>
          <p className="text-muted-foreground mb-6">
            This is the very beginning of the <span className="font-medium text-foreground">#{currentChannel?.name}</span> channel.
          </p>
        </div>
      </div>
    );
  }

  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const rowRef = useRef<HTMLDivElement>(null);
    const item = rows[index];

    useEffect(() => {
      if (rowRef.current) {
        const height = rowRef.current.getBoundingClientRect().height;
        setRowHeight(index, height);
      }
    }, [index]);

    if (item.type === 'date') {
      return (
        <div style={style}>
          <div ref={rowRef} className="flex items-center gap-4 my-3 px-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs font-medium text-muted-foreground px-2 py-1 bg-background border rounded-full">
              {item.date}
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>
        </div>
      );
    }

    const { message, showHeader, isOwn } = item;

    const reactionGroups = message.reactions?.reduce(
      (acc: any, r: any) => {
        if (!r.emoji) return acc;
        if (!acc[r.emoji]) acc[r.emoji] = { count: 0, users: [], hasOwn: false };
        acc[r.emoji].count++;
        acc[r.emoji].users.push(r.user?.username || 'Unknown');
        if (r.user?.id === user?.id) acc[r.emoji].hasOwn = true;
        return acc;
      },
      {} as Record<string, { count: number; users: string[]; hasOwn: boolean }>
    );

    return (
      <div style={style}>
        <div
          ref={rowRef}
          className={cn(
            'group relative flex gap-3 px-4 py-1 rounded-lg hover:bg-accent/50 transition-colors',
            !showHeader && 'pl-16'
          )}
        >
          {showHeader && (
            <Avatar className="h-9 w-9 mt-0.5 shrink-0">
              <AvatarImage src={message.user.avatarUrl} />
              <AvatarFallback className={cn('text-sm', generateAvatarColor(message.user.displayName))}>
                {getInitials(message.user.displayName)}
              </AvatarFallback>
            </Avatar>
          )}

          <div className="flex-1 min-w-0">
            {showHeader && (
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="font-semibold text-sm">{message.user.displayName}</span>
                <span className="text-xs text-muted-foreground">{formatMessageTime(message.createdAt)}</span>
                {message.isEdited && <span className="text-xs text-muted-foreground">(edited)</span>}
              </div>
            )}

            {editingId === message.id ? (
              <div className="space-y-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full rounded-md bg-gray-800 border border-gray-600 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                  rows={3}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
                    if (e.key === 'Escape') handleCancelEdit();
                  }}
                />
                <div className="flex items-center gap-2 text-xs">
                  <Button size="sm" onClick={handleSaveEdit} className="h-7">Save</Button>
                  <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="h-7">Cancel</Button>
                </div>
              </div>
            ) : (
              <Markdown content={message.content} className="text-sm" />
            )}

            {reactionGroups && Object.keys(reactionGroups).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(reactionGroups).map(([emoji, data]: [string, any]) => (
                  <button
                    key={emoji}
                    onClick={() => onReaction?.(message.id, emoji)}
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors',
                      data.hasOwn ? 'bg-primary/20 border-primary/50 text-primary' : 'bg-muted border-transparent hover:border-border'
                    )}
                    title={data.users.join(', ')}
                  >
                    <span>{emoji}</span>
                    <span>{data.count}</span>
                  </button>
                ))}
              </div>
            )}

            {message._count?.replies > 0 && (
              <button
                className="flex items-center gap-1 mt-1 text-xs text-primary hover:underline"
                onClick={() => onOpenThread?.(message)}
              >
                <MessageSquare className="h-3 w-3" />
                {message._count.replies} {message._count.replies === 1 ? 'reply' : 'replies'}
              </button>
            )}
          </div>

          {/* Hover actions */}
          <div className="absolute right-2 top-0 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <div className="flex items-center gap-0.5 bg-gray-800 border border-gray-700 rounded-lg shadow-lg p-0.5">
              {quickReactions.slice(0, 3).map((emoji) => (
                <Button key={emoji} variant="ghost" size="icon" className="h-7 w-7 hover:bg-gray-700" onClick={() => onReaction?.(message.id, emoji)}>
                  {emoji}
                </Button>
              ))}
              <div className="relative">
                <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-gray-700" onClick={() => setEmojiPickerMessageId(emojiPickerMessageId === message.id ? null : message.id)}>
                  <Smile className="h-4 w-4" />
                </Button>
                {emojiPickerMessageId === message.id && (
                  <div className="absolute right-0 top-full mt-1">
                    <EmojiPicker onSelect={(e) => { onReaction?.(message.id, e); setEmojiPickerMessageId(null); }} onClose={() => setEmojiPickerMessageId(null)} />
                  </div>
                )}
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-gray-700" onClick={() => onOpenThread?.(message)} title="Reply in thread">
                <MessageSquare className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-gray-700" onClick={() => handleCopy(message.content, message.id)}>
                {copiedId === message.id ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-gray-700" onClick={() => handlePin(message.id)} disabled={pinningId === message.id} title="Pin message">
                <Pin className="h-4 w-4" />
              </Button>
              {isOwn && (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-gray-700" onClick={() => handleStartEdit(message)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-red-900/50 text-red-400" onClick={() => onDelete?.(message.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="flex-1 min-h-0">
      {isLoadingMore && (
        <div className="flex justify-center py-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
      <List
        ref={listRef}
        outerRef={outerRef}
        height={containerHeight}
        itemCount={rows.length}
        itemSize={getItemSize}
        estimatedItemSize={ESTIMATED_ROW_HEIGHT}
        width="100%"
        onScroll={handleScroll}
      >
        {Row}
      </List>
    </div>
  );
}

export default VirtualizedMessageList;
