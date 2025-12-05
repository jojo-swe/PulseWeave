'use client';

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { FixedSizeList as List } from 'react-window';
import { useStore } from '@/store';
import { cn, formatMessageTime, formatMessageDate, getInitials, generateAvatarColor } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { EmojiPicker } from '@/components/ui/emoji-picker';
import { Smile, MessageSquare, MoreHorizontal, Pencil, Trash2, Copy, Check, X, Hash, Sparkles } from 'lucide-react';

interface Message {
  id: string;
  content: string;
  userId: string;
  channelId: string;
  createdAt: string;
  updatedAt?: string;
  isEdited?: boolean;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
  reactions?: Array<{
    emoji: string;
    user: { id: string; username: string };
  }>;
  replyCount?: number;
  _count?: { replies: number };
}

interface VirtualizedMessageListProps {
  onReaction?: (messageId: string, emoji: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  onDelete?: (messageId: string) => void;
  onOpenThread?: (message: Message) => void;
}

const ESTIMATED_ITEM_SIZE = 80;

/**
 * Virtualized message list for performance with large channels.
 * Uses react-window for efficient rendering of only visible messages.
 */
export function VirtualizedMessageList({ 
  onReaction, 
  onEdit, 
  onDelete, 
  onOpenThread 
}: VirtualizedMessageListProps) {
  const { messages, user, currentChannel } = useStore();
  const listRef = useRef<List>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(500);
  const itemSizes = useRef<Map<number, number>>(new Map());

  // Update container height on resize
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight);
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (listRef.current && messages.length > 0) {
      listRef.current.scrollToItem(messages.length - 1, 'end');
    }
  }, [messages.length]);

  const getItemSize = useCallback((index: number) => {
    return itemSizes.current.get(index) || ESTIMATED_ITEM_SIZE;
  }, []);

  const setItemSize = useCallback((index: number, size: number) => {
    if (itemSizes.current.get(index) !== size) {
      itemSizes.current.set(index, size);
      listRef.current?.resetAfterIndex(index);
    }
  }, []);

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
          <div className="flex flex-wrap justify-center gap-2 text-sm text-muted-foreground">
            <span className="px-3 py-1.5 bg-accent rounded-full">👋 Say hello</span>
            <span className="px-3 py-1.5 bg-accent rounded-full">📝 Share updates</span>
            <span className="px-3 py-1.5 bg-accent rounded-full">🎉 Celebrate wins</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-hidden">
      <List
        ref={listRef}
        height={containerHeight}
        itemCount={messages.length}
        itemSize={getItemSize}
        width="100%"
        overscanCount={5}
        itemData={{
          messages,
          user,
          onReaction,
          onEdit,
          onDelete,
          onOpenThread,
          setItemSize,
        }}
      >
        {MessageRow}
      </List>
    </div>
  );
}

interface MessageRowProps {
  index: number;
  style: React.CSSProperties;
  data: {
    messages: Message[];
    user: any;
    onReaction?: (messageId: string, emoji: string) => void;
    onEdit?: (messageId: string, content: string) => void;
    onDelete?: (messageId: string) => void;
    onOpenThread?: (message: Message) => void;
    setItemSize: (index: number, size: number) => void;
  };
}

const MessageRow = memo(function MessageRow({ index, style, data }: MessageRowProps) {
  const { messages, user, onReaction, onEdit, onDelete, onOpenThread, setItemSize } = data;
  const message = messages[index];
  const rowRef = useRef<HTMLDivElement>(null);
  const [showActions, setShowActions] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  // Measure actual row height
  useEffect(() => {
    if (rowRef.current) {
      const height = rowRef.current.getBoundingClientRect().height;
      setItemSize(index, height);
    }
  }, [index, setItemSize, message.content]);

  const prevMessage = index > 0 ? messages[index - 1] : null;
  const showHeader =
    !prevMessage ||
    prevMessage.userId !== message.userId ||
    new Date(message.createdAt).getTime() - new Date(prevMessage.createdAt).getTime() > 5 * 60 * 1000;

  // Check if this is a new date
  const showDateSeparator = !prevMessage || 
    formatMessageDate(message.createdAt) !== formatMessageDate(prevMessage.createdAt);

  const isOwn = message.userId === user?.id;
  const quickReactions = ['👍', '❤️', '😂', '🎉', '🚀', '👀'];

  // Group reactions
  const reactionGroups = message.reactions?.reduce(
    (acc, r) => {
      if (!acc[r.emoji]) {
        acc[r.emoji] = { count: 0, users: [], hasOwn: false };
      }
      acc[r.emoji].count++;
      acc[r.emoji].users.push(r.user.username);
      if (r.user.id === user?.id) {
        acc[r.emoji].hasOwn = true;
      }
      return acc;
    },
    {} as Record<string, { count: number; users: string[]; hasOwn: boolean }>
  );

  return (
    <div style={style}>
      <div ref={rowRef} className="px-4">
        {/* Date Separator */}
        {showDateSeparator && (
          <div className="flex items-center gap-4 my-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs font-medium text-muted-foreground px-2 py-1 bg-background border rounded-full">
              {formatMessageDate(message.createdAt)}
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>
        )}

        {/* Message */}
        <div
          className={cn(
            'group relative flex gap-3 px-2 py-1 -mx-2 rounded-lg hover:bg-accent/50 transition-colors',
            !showHeader && 'pl-12'
          )}
          onMouseEnter={() => setShowActions(true)}
          onMouseLeave={() => !emojiPickerOpen && setShowActions(false)}
        >
          {showHeader && (
            <Avatar className="h-9 w-9 shrink-0 mt-0.5">
              <AvatarImage src={message.user.avatarUrl} />
              <AvatarFallback className={cn('text-sm', generateAvatarColor(message.user.displayName))}>
                {getInitials(message.user.displayName)}
              </AvatarFallback>
            </Avatar>
          )}

          <div className="flex-1 min-w-0">
            {showHeader && (
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="font-semibold text-sm hover:underline cursor-pointer">
                  {message.user.displayName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatMessageTime(message.createdAt)}
                </span>
                {message.isEdited && (
                  <span className="text-xs text-muted-foreground">(edited)</span>
                )}
              </div>
            )}

            <Markdown content={message.content} className="text-sm" />

            {/* Reactions */}
            {reactionGroups && Object.keys(reactionGroups).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {Object.entries(reactionGroups).map(([emoji, { count, users, hasOwn }]) => (
                  <button
                    key={emoji}
                    onClick={() => onReaction?.(message.id, emoji)}
                    className={cn(
                      'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors',
                      hasOwn
                        ? 'bg-primary/20 border-primary/50 text-primary'
                        : 'bg-muted border-transparent hover:border-border'
                    )}
                    title={users.join(', ')}
                  >
                    <span>{emoji}</span>
                    <span>{count}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Thread indicator */}
            {message.replyCount && message.replyCount > 0 && (
              <button
                onClick={() => onOpenThread?.(message)}
                className="flex items-center gap-1 mt-2 text-xs text-primary hover:underline"
              >
                <MessageSquare className="h-3 w-3" />
                {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
              </button>
            )}
          </div>

          {/* Actions */}
          {showActions && (
            <div className="absolute -top-3 right-2 flex items-center gap-0.5 p-1 rounded-lg bg-background border shadow-sm">
              {quickReactions.slice(0, 3).map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => onReaction?.(message.id, emoji)}
                  className="p-1 hover:bg-accent rounded text-sm"
                >
                  {emoji}
                </button>
              ))}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setEmojiPickerOpen(!emojiPickerOpen)}
              >
                <Smile className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onOpenThread?.(message)}
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
              {isOwn && (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => onDelete?.(message.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default VirtualizedMessageList;
