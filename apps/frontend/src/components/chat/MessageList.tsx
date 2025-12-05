'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/store';
import { cn, formatMessageTime, formatMessageDate, getInitials, generateAvatarColor } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Markdown } from '@/components/ui/markdown';
import { EmojiPicker } from '@/components/ui/emoji-picker';
import { Smile, MessageSquare, MoreHorizontal, Pencil, Trash2, Copy, Check, X } from 'lucide-react';

interface MessageListProps {
  onReaction?: (messageId: string, emoji: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  onDelete?: (messageId: string) => void;
  onOpenThread?: (message: any) => void;
}

export function MessageList({ onReaction, onEdit, onDelete, onOpenThread }: MessageListProps) {
  const { messages, user } = useStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [emojiPickerMessageId, setEmojiPickerMessageId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Group messages by date
  const groupedMessages: { date: string; messages: typeof messages }[] = [];
  let currentDate = '';

  messages.forEach((message) => {
    const messageDate = formatMessageDate(message.createdAt);
    if (messageDate !== currentDate) {
      currentDate = messageDate;
      groupedMessages.push({ date: messageDate, messages: [message] });
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(message);
    }
  });

  const quickReactions = ['👍', '❤️', '😂', '🎉', '🚀', '👀'];

  const handleStartEdit = (message: { id: string; content: string }) => {
    setEditingId(message.id);
    setEditContent(message.content);
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

  return (
    <ScrollArea className="flex-1 px-4">
      <div className="py-4 space-y-4">
        {groupedMessages.map((group) => (
          <div key={group.date}>
            {/* Date Separator */}
            <div className="flex items-center gap-4 my-6">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs font-medium text-muted-foreground px-2 py-1 bg-background border rounded-full">
                {group.date}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Messages */}
            <div className="space-y-1">
              {group.messages.map((message, index) => {
                const prevMessage = index > 0 ? group.messages[index - 1] : null;
                const showHeader =
                  !prevMessage ||
                  prevMessage.userId !== message.userId ||
                  new Date(message.createdAt).getTime() -
                    new Date(prevMessage.createdAt).getTime() >
                    5 * 60 * 1000;

                const isOwn = message.userId === user?.id;

                // Group reactions by emoji
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
                  <div
                    key={message.id}
                    className={cn(
                      'group relative flex gap-3 px-2 py-1 -mx-2 rounded-lg hover:bg-accent/50 transition-colors message-enter',
                      !showHeader && 'pl-14'
                    )}
                  >
                    {showHeader && (
                      <Avatar className="h-9 w-9 mt-0.5 shrink-0">
                        <AvatarImage src={message.user.avatarUrl} />
                        <AvatarFallback
                          className={cn(
                            'text-sm',
                            generateAvatarColor(message.user.displayName)
                          )}
                        >
                          {getInitials(message.user.displayName)}
                        </AvatarFallback>
                      </Avatar>
                    )}

                    <div className="flex-1 min-w-0">
                      {showHeader && (
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className="font-semibold text-sm">
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

                      {editingId === message.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full rounded-md bg-gray-800 border border-gray-600 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                            rows={3}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSaveEdit();
                              }
                              if (e.key === 'Escape') {
                                handleCancelEdit();
                              }
                            }}
                          />
                          <div className="flex items-center gap-2 text-xs">
                            <Button size="sm" onClick={handleSaveEdit} className="h-7">
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="h-7">
                              Cancel
                            </Button>
                            <span className="text-gray-500">
                              Press Enter to save, Escape to cancel
                            </span>
                          </div>
                        </div>
                      ) : (
                        <Markdown content={message.content} className="text-sm" />
                      )}

                      {/* Reactions */}
                      {reactionGroups && Object.keys(reactionGroups).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {Object.entries(reactionGroups).map(([emoji, data]) => (
                            <button
                              key={emoji}
                              onClick={() => onReaction?.(message.id, emoji)}
                              className={cn(
                                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors',
                                data.hasOwn
                                  ? 'bg-primary/20 border-primary/50 text-primary'
                                  : 'bg-muted border-transparent hover:border-border'
                              )}
                              title={data.users.join(', ')}
                            >
                              <span>{emoji}</span>
                              <span>{data.count}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Thread count */}
                      {message._count?.replies && message._count.replies > 0 && (
                        <button 
                          className="flex items-center gap-1 mt-1 text-xs text-primary hover:underline"
                          onClick={() => onOpenThread?.(message)}
                        >
                          <MessageSquare className="h-3 w-3" />
                          {message._count.replies} {message._count.replies === 1 ? 'reply' : 'replies'}
                        </button>
                      )}
                    </div>

                    {/* Message Actions */}
                    <div className="absolute right-2 top-0 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <div className="flex items-center gap-0.5 bg-gray-800 border border-gray-700 rounded-lg shadow-lg p-0.5">
                        {quickReactions.slice(0, 3).map((emoji) => (
                          <Button
                            key={emoji}
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 hover:bg-gray-700"
                            onClick={() => onReaction?.(message.id, emoji)}
                          >
                            {emoji}
                          </Button>
                        ))}
                        <div className="relative">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 hover:bg-gray-700"
                            onClick={() => setEmojiPickerMessageId(
                              emojiPickerMessageId === message.id ? null : message.id
                            )}
                          >
                            <Smile className="h-4 w-4" />
                          </Button>
                          {emojiPickerMessageId === message.id && (
                            <div className="absolute right-0 top-full mt-1">
                              <EmojiPicker
                                onSelect={(emoji) => {
                                  onReaction?.(message.id, emoji);
                                  setEmojiPickerMessageId(null);
                                }}
                                onClose={() => setEmojiPickerMessageId(null)}
                              />
                            </div>
                          )}
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 hover:bg-gray-700"
                          onClick={() => onOpenThread?.(message)}
                          title="Reply in thread"
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 hover:bg-gray-700"
                          onClick={() => handleCopy(message.content, message.id)}
                        >
                          {copiedId === message.id ? (
                            <Check className="h-4 w-4 text-green-400" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                        {isOwn && (
                          <>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 hover:bg-gray-700"
                              onClick={() => handleStartEdit(message)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 hover:bg-red-900/50 text-red-400"
                              onClick={() => onDelete?.(message.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
