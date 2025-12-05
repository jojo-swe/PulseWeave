'use client';

import { useState } from 'react';
import { useStore } from '@/store';
import { MessageList } from './MessageList';
import { VirtualizedMessageList } from './VirtualizedMessageList';
import { MessageInput } from './MessageInput';
import { SearchMessages } from './SearchMessages';
import { ThreadPanel } from './ThreadPanel';
import { ChannelSettingsModal } from './ChannelSettingsModal';
import { NotificationCenter } from './NotificationCenter';
import { PinnedMessagesPanel } from './PinnedMessagesPanel';
import { Portal } from '@/components/ui/portal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Hash, Lock, Users, Star, Bell, Pin, Search, Settings, Menu, Zap, MessageCircle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials, generateAvatarColor } from '@/lib/utils';

interface ChatAreaProps {
  onSendMessage: (content: string) => void;
  onTyping?: () => void;
  onReaction?: (messageId: string, emoji: string) => void;
  onEditMessage?: (messageId: string, content: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onSendReply?: (content: string, parentId: string) => Promise<void>;
  onToggleSidebar?: () => void;
}

export function ChatArea({ onSendMessage, onTyping, onReaction, onEditMessage, onDeleteMessage, onSendReply, onToggleSidebar }: ChatAreaProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const { currentChannel, currentConversation, directMessages, user, members, typingUsers, activeThread, setActiveThread, useVirtualizedList, toggleVirtualizedList, starredChannels, toggleStarChannel } = useStore();

  // Get typing users for current channel
  const channelTypingUsers = Array.from(typingUsers.entries())
    .filter(([key]) => key.startsWith(`${currentChannel?.id}:`))
    .map(([, value]) => value.username);

  // Get DM conversation display info
  const dmOtherMembers = currentConversation?.members.filter((m) => m.id !== user?.id) || [];
  const dmDisplayName = currentConversation?.isGroup
    ? currentConversation.name || dmOtherMembers.map((m) => m.displayName).join(', ')
    : dmOtherMembers[0]?.displayName || 'Unknown';
  const dmAvatarMember = dmOtherMembers[0];

  // Show DM conversation view
  if (currentConversation) {
    return (
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col bg-background min-w-0">
          {/* DM Header */}
          <div className="h-14 flex items-center justify-between px-2 sm:px-4 border-b shrink-0">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 lg:hidden"
                onClick={onToggleSidebar}
              >
                <Menu className="h-5 w-5" />
              </Button>
              {currentConversation.isGroup ? (
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="h-4 w-4 text-primary" />
                </div>
              ) : (
                <Avatar className="h-8 w-8">
                  <AvatarImage src={dmAvatarMember?.avatarUrl} />
                  <AvatarFallback className={cn('text-xs', generateAvatarColor(dmDisplayName))}>
                    {getInitials(dmDisplayName)}
                  </AvatarFallback>
                </Avatar>
              )}
              <div>
                <h1 className="font-semibold">{dmDisplayName}</h1>
                {!currentConversation.isGroup && dmAvatarMember?.status && (
                  <p className="text-xs text-muted-foreground capitalize">{dmAvatarMember.status}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSearchOpen(true)}
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* DM Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {directMessages.length === 0 ? (
              <div className="flex-1 flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                    <MessageCircle className="h-8 w-8 text-primary" />
                  </div>
                  <h2 className="text-lg font-semibold mb-2">Start the conversation</h2>
                  <p className="text-muted-foreground text-sm">
                    Send a message to {dmDisplayName}
                  </p>
                </div>
              </div>
            ) : (
              directMessages.map((message) => (
                <div key={message.id} className="flex items-start gap-3">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={message.user.avatarUrl} />
                    <AvatarFallback className={cn('text-xs', generateAvatarColor(message.user.displayName))}>
                      {getInitials(message.user.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-sm">{message.user.displayName}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm break-words">{message.content}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Message Input */}
          <MessageInput onSend={onSendMessage} onTyping={onTyping} placeholder={`Message ${dmDisplayName}`} />
        </div>
      </div>
    );
  }

  if (!currentChannel) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-background to-primary/5">
        <div className="text-center max-w-md px-6">
          {/* Animated logo */}
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-pulse" />
            <div className="relative w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/30">
              <Zap className="h-10 w-10 text-white" />
            </div>
          </div>
          
          <h2 className="text-2xl font-bold mb-3 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
            Welcome to PulseWeave
          </h2>
          <p className="text-muted-foreground mb-6">
            Select a channel from the sidebar to start chatting, or use{' '}
            <kbd className="px-2 py-0.5 rounded bg-muted text-xs font-mono">⌘K</kbd>{' '}
            to search
          </p>
          
          {/* Quick tips */}
          <div className="grid gap-3 text-left">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-card/50 border border-border/50">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Hash className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Channels</p>
                <p className="text-xs text-muted-foreground">Join public channels or create your own</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-card/50 border border-border/50">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <MessageCircle className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Direct Messages</p>
                <p className="text-xs text-muted-foreground">Chat privately with team members</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-gradient-to-br from-background/50 to-indigo-950/20 w-full h-full relative">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-transparent min-w-0 h-full">
        {/* Channel Header */}
        <div className="h-16 flex items-center justify-between px-4 sm:px-6 border-b border-white/5 shrink-0 z-10 glass-card bg-white/5">
          <div className="flex items-center gap-2">
            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 lg:hidden"
              onClick={onToggleSidebar}
            >
              <Menu className="h-5 w-5" />
            </Button>
            {currentChannel.isPrivate ? (
              <Lock className="h-5 w-5 text-muted-foreground" />
            ) : (
              <Hash className="h-5 w-5 text-muted-foreground" />
            )}
            <h1 className="font-semibold">{currentChannel.name}</h1>
            {currentChannel.description && (
              <>
                <span className="text-muted-foreground">|</span>
                <span className="text-sm text-muted-foreground truncate max-w-xs">
                  {currentChannel.description}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-0.5 sm:gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 hidden sm:flex"
              onClick={() => currentChannel && toggleStarChannel(currentChannel.id)}
              title={starredChannels.has(currentChannel?.id || '') ? 'Unstar channel' : 'Star channel'}
            >
              <Star className={cn(
                'h-4 w-4',
                starredChannels.has(currentChannel?.id || '') && 'fill-yellow-400 text-yellow-400'
              )} />
            </Button>
            <Button variant="ghost" size="sm" className="gap-1 hidden sm:flex">
              <Users className="h-4 w-4" />
              <span>{members.length}</span>
            </Button>
            <div className="w-px h-4 bg-border mx-1 hidden sm:block" />
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 hidden md:flex"
              onClick={() => setPinnedOpen(true)}
              title="Pinned messages"
            >
              <Pin className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 hidden md:flex"
              onClick={() => setNotificationsOpen(true)}
            >
              <Bell className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 hidden sm:flex"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="h-4 w-4" />
            </Button>
            <Button 
              variant={useVirtualizedList ? "default" : "ghost"}
              size="icon" 
              className="h-8 w-8 hidden sm:flex"
              onClick={toggleVirtualizedList}
              title={useVirtualizedList ? "Using virtualized list (better for large channels)" : "Using standard list"}
            >
              <Zap className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Search Modal */}
        {searchOpen && (
          <Portal>
            <SearchMessages onClose={() => setSearchOpen(false)} />
          </Portal>
        )}

        {/* Channel Settings Modal */}
        {settingsOpen && (
          <Portal>
            <ChannelSettingsModal onClose={() => setSettingsOpen(false)} />
          </Portal>
        )}

        {/* Notification Center */}
        {notificationsOpen && (
          <Portal>
            <NotificationCenter onClose={() => setNotificationsOpen(false)} />
          </Portal>
        )}

        {/* Pinned Messages Panel */}
        {pinnedOpen && (
          <Portal>
            <PinnedMessagesPanel onClose={() => setPinnedOpen(false)} />
          </Portal>
        )}

        {/* Messages */}
        {useVirtualizedList ? (
          <VirtualizedMessageList 
            onReaction={onReaction} 
            onEdit={onEditMessage}
            onDelete={onDeleteMessage}
            onOpenThread={setActiveThread}
          />
        ) : (
          <MessageList 
            onReaction={onReaction} 
            onEdit={onEditMessage}
            onDelete={onDeleteMessage}
            onOpenThread={setActiveThread}
          />
        )}

        {/* Typing Indicator */}
        {channelTypingUsers.length > 0 && (
          <div className="px-4 py-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
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
        <MessageInput onSend={onSendMessage} onTyping={onTyping} />
      </div>

      {/* Thread Panel */}
      {activeThread && (
        <ThreadPanel
          parentMessage={activeThread}
          channelName={currentChannel.name}
          onClose={() => setActiveThread(null)}
          onSendReply={onSendReply || (async () => {})}
        />
      )}
    </div>
  );
}
