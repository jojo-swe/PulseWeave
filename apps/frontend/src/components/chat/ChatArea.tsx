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
import { Portal } from '@/components/ui/portal';
import { Button } from '@/components/ui/button';
import { Hash, Lock, Users, Star, Bell, Pin, Search, Settings, Menu, Zap } from 'lucide-react';

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
  const { currentChannel, members, typingUsers, activeThread, setActiveThread, useVirtualizedList, toggleVirtualizedList } = useStore();

  // Get typing users for current channel
  const channelTypingUsers = Array.from(typingUsers.entries())
    .filter(([key]) => key.startsWith(`${currentChannel?.id}:`))
    .map(([, value]) => value.username);

  if (!currentChannel) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Hash className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Welcome to PulseWeave</h2>
          <p className="text-muted-foreground">
            Select a channel from the sidebar to start chatting
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-background min-w-0">
        {/* Channel Header */}
        <div className="h-14 flex items-center justify-between px-2 sm:px-4 border-b shrink-0">
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
            <Button variant="ghost" size="icon" className="h-8 w-8 hidden sm:flex">
              <Star className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="gap-1 hidden sm:flex">
              <Users className="h-4 w-4" />
              <span>{members.length}</span>
            </Button>
            <div className="w-px h-4 bg-border mx-1 hidden sm:block" />
            <Button variant="ghost" size="icon" className="h-8 w-8 hidden md:flex">
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
