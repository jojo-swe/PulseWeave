"use client";

import { useState, useRef, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Channel, Message } from "@pulseweave/types";
import { useStore } from "@/store";
import {
  MoreVertical,
  Reply,
  Smile,
  Trash2,
  Paperclip,
  Menu
} from "lucide-react";
import { MessageInput } from "./MessageInput";
import { ThreadPanel } from "./ThreadPanel";
import { ChannelMembersPanel } from "./ChannelMembersPanel";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

interface ChatAreaProps {
  onSendMessage: (content: string, attachments?: File[]) => Promise<void>;
  onSendReply?: (threadId: string, content: string) => Promise<void>;
  onTyping?: (isTyping: boolean) => void;
  // Actions
  onReaction?: (messageId: string, emoji: string) => Promise<void>;
  onEditMessage?: (messageId: string, content: string) => Promise<void>;
  onDeleteMessage?: (messageId: string) => Promise<void>;
  onToggleSidebar?: () => void;
}

export function ChatArea({
  onSendMessage,
  onSendReply,
  onTyping,
  onReaction,
  onEditMessage,
  onDeleteMessage,
  onToggleSidebar,
}: ChatAreaProps) {
  const currentUser = useStore((state) => state.user);
  const currentChannel = useStore((state) => state.currentChannel);
  const messages = useStore((state) => state.messages);
  // We'll ignore typing users for the build fix
  const channelTypingUsers: string[] = []; 

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [activeThread, setActiveThread] = useState<Message | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  if (!currentChannel) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground bg-background/50 backdrop-blur-sm">
        <div className="text-center">
            <h3 className="text-lg font-medium mb-2">Welcome to PulseWeave</h3>
            <p className="text-sm">Select a channel to start chatting</p>
        </div>
      </div>
    );
  }

  // Group messages by date
  const groupedMessages = (messages || []).reduce(
    (acc, message) => {
      const date = new Date(message.createdAt);
      const dateStr = date.toDateString();
      
      let group = acc.find((g) => g.date.toDateString() === dateStr);
      if (!group) {
        group = { date, messages: [] };
        acc.push(group);
      }
      group.messages.push(message as unknown as Message);
      return acc;
    },
    [] as { date: Date; messages: Message[] }[]
  );

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-background/50 backdrop-blur-sm relative">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Channel Header */}
        <div className="h-14 px-4 border-b border-border/40 flex items-center justify-between bg-background/40 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-2">
            {onToggleSidebar && (
              <Button variant="ghost" size="icon" className="md:hidden mr-2" onClick={onToggleSidebar}>
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <span className="text-muted-foreground opacity-50 text-lg">#</span>
              {currentChannel.name}
            </h2>
            {currentChannel.description && (
              <>
                <span className="text-muted-foreground/30 mx-1">|</span>
                <span className="text-sm text-muted-foreground truncate max-w-md hidden sm:block">
                  {currentChannel.description}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setMembersOpen(!membersOpen)}
            >
              <MoreVertical className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Messages List - Fixed scrolling container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 scrollbar-thin">
          <AnimatePresence initial={false}>
            {groupedMessages.map((group) => (
              <motion.div
                key={group.date.toISOString()}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="space-y-4"
              >
                <div className="relative flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/40" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground/60 font-medium tracking-wider">
                      {format(group.date, "MMMM d, yyyy")}
                    </span>
                  </div>
                </div>

                {group.messages.map((msg) => {
                  const isCurrentUser = msg.userId === currentUser?.id;
                  const isSystem = (msg as any).type === "system";

                  if (isSystem) {
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center justify-center py-2"
                      >
                        <span className="bg-muted/50 px-3 py-1 rounded-full text-xs text-muted-foreground">
                          {msg.content}
                        </span>
                      </motion.div>
                    );
                  }

                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, x: isCurrentUser ? 20 : -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      className={`group flex items-start gap-3 ${
                        isCurrentUser ? "justify-end" : "justify-start"
                      }`}
                    >
                      {!isCurrentUser && (
                        <Avatar className="h-8 w-8 mt-1 border border-border/50 shadow-sm">
                          <AvatarImage src={msg.user?.avatarUrl} />
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                            {msg.user?.username.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      )}

                      <div
                        className={`max-w-[70%] group shadow-sm transition-all duration-200 hover:shadow-md ${
                          isCurrentUser ? "items-end" : "items-start"
                        }`}
                      >
                        <div className="flex items-baseline gap-2 mb-1 px-1">
                          {!isCurrentUser && (
                            <span className="text-sm font-semibold text-foreground/90 hover:text-primary transition-colors cursor-pointer">
                              {msg.user?.username}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground/60 select-none">
                            {format(new Date(msg.createdAt), "h:mm a")}
                          </span>
                        </div>

                        <div
                          className={`relative px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                            isCurrentUser
                              ? "bg-primary text-primary-foreground rounded-tr-sm bg-gradient-to-br from-primary to-primary/90"
                              : "bg-card border border-border/50 text-card-foreground rounded-tl-sm hover:border-border/80"
                          }`}
                        >
                          <p>{msg.content}</p>
                          
                          {/* Attachments */}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="mt-2 space-y-2">
                              {msg.attachments.map((att) => (
                                <div
                                  key={att.id}
                                  className="flex items-center gap-2 p-2 rounded bg-background/20 backdrop-blur-sm border border-white/10"
                                >
                                  <Paperclip className="h-4 w-4 opacity-70" />
                                  <a
                                    href={att.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs hover:underline truncate max-w-[200px]"
                                  >
                                    {att.name}
                                  </a>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Message Actions - Hover only */}
                          <div
                            className={`absolute -top-3 ${
                              isCurrentUser ? "left-0 -translate-x-full pr-2" : "right-0 translate-x-full pl-2"
                            } opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center gap-1 scale-95 group-hover:scale-100`}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-full bg-background/80 shadow-sm border border-border/50 hover:bg-accent hover:text-accent-foreground backdrop-blur-sm"
                              onClick={() => setActiveThread(msg)}
                              title="Reply in thread"
                            >
                              <Reply className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-full bg-background/80 shadow-sm border border-border/50 hover:bg-accent hover:text-accent-foreground backdrop-blur-sm"
                              title="React"
                              onClick={() => onReaction?.(msg.id, "👍")}
                            >
                              <Smile className="h-3.5 w-3.5" />
                            </Button>
                            {isCurrentUser && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-full bg-background/80 shadow-sm border border-border/50 hover:text-destructive hover:bg-destructive/10 backdrop-blur-sm"
                                title="Delete"
                                onClick={() => onDeleteMessage?.(msg.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            ))}
            <div ref={messagesEndRef} />
          </AnimatePresence>
        </div>

        {/* Typing Indicator */}
        {channelTypingUsers.length > 0 && (
          <div className="px-4 py-2 text-xs text-muted-foreground animate-fade-in bg-background/30 backdrop-blur-sm border-t border-border/30">
            <span className="flex items-center gap-2">
              <span className="flex gap-0.5">
                <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
              <span>
                {channelTypingUsers.length === 1
                  ? `${channelTypingUsers[0]} is typing...`
                  : channelTypingUsers.length === 2
                  ? `${channelTypingUsers.join(' and ')} are typing...`
                  : `${channelTypingUsers.slice(0, 2).join(', ')} and ${channelTypingUsers.length - 2} others are typing...`}
              </span>
            </span>
          </div>
        )}

        {/* Message Input */}
        <MessageInput onSend={onSendMessage} onTyping={() => onTyping?.(true)} />
      </div>

      {/* Thread Panel */}
      {activeThread && (
        <ThreadPanel
          parentMessage={activeThread as any}
          channelName={currentChannel.name}
          onClose={() => setActiveThread(null)}
          onSendReply={onSendReply || (async () => {})}
        />
      )}

      {/* Channel Members Panel */}
      {membersOpen && currentChannel && (
        <ChannelMembersPanel
          channelId={currentChannel.id}
          channelName={currentChannel.name}
          isPrivate={currentChannel.isPrivate}
          onClose={() => setMembersOpen(false)}
        />
      )}
    </div>
  );
}
