'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { connectSocket, joinWorkspace, joinChannel, getSocket, startTyping } from '@/lib/socket';
import { requestNotificationPermission, notifyNewMessage, playNotificationSound } from '@/lib/notifications';
import { Sidebar } from '@/components/chat/Sidebar';
import { ChatArea } from '@/components/chat/ChatArea';
import { CommandPalette } from '@/components/chat/CommandPalette';
import { KeyboardShortcuts } from '@/components/chat/KeyboardShortcuts';
import { CreateChannelModal } from '@/components/chat/CreateChannelModal';
import { Portal } from '@/components/ui/portal';
import { TooltipProvider } from '@/components/ui/tooltip';

export default function Home() {
  const router = useRouter();
  const {
    token,
    user,
    currentWorkspace,
    currentChannel,
    setCurrentWorkspace,
    setChannels,
    setMembers,
    setMessages,
    addMessage,
    setCurrentChannel,
    updateMemberStatus,
    setUserTyping,
    clearUserTyping,
    sidebarOpen,
    toggleSidebar,
    // DM state
    currentConversation,
    setConversations,
    addConversation,
    setCurrentConversation,
    setDirectMessages,
    addDirectMessage,
  } = useStore();

  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [createChannelOpen, setCreateChannelOpen] = useState(false);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K - Open command palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
      }
      // Ctrl+/ - Open keyboard shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setShortcutsOpen(prev => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Wait for Zustand to hydrate from localStorage
  useEffect(() => {
    setHydrated(true);
  }, []);

  // Request notification permission on mount
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Check auth and load initial data
  useEffect(() => {
    // Wait for hydration before checking token
    if (!hydrated) return;
    
    if (!token) {
      router.push('/login');
      return;
    }

    const loadData = async () => {
      try {
        // Get workspaces
        const workspaces = await api.workspaces.list(token);
        if (workspaces.length > 0) {
          const workspace = await api.workspaces.get(workspaces[0].id, token);
          setCurrentWorkspace(workspace);
          setChannels(workspace.channels);
          setMembers(workspace.members);

          // Auto-select first channel
          if (workspace.channels.length > 0 && !currentChannel) {
            setCurrentChannel(workspace.channels[0]);
          }

          // Connect socket
          const socket = connectSocket(token);
          joinWorkspace(workspace.id);

          // Socket event listeners
          socket.on('message:new', (message: any) => {
            addMessage(message);
            // Handle messages from other users
            const state = useStore.getState();
            if (message.userId !== state.user?.id) {
              // Increment unread if message is for a different channel
              if (message.channelId !== state.currentChannel?.id) {
                state.incrementUnread(message.channelId);
              }
              // Show notification and play sound
              const channel = state.channels.find(c => c.id === message.channelId);
              if (channel) {
                playNotificationSound();
                notifyNewMessage(
                  message.user.displayName,
                  channel.name,
                  message.content
                );
              }
            }
          });

          // Listen for DM messages
          socket.on('dm:message', (message: any) => {
            const state = useStore.getState();
            if (state.currentConversation?.id === message.conversationId) {
              addDirectMessage(message);
            }
            // Handle messages from other users
            if (message.userId !== state.user?.id) {
              if (message.conversationId !== state.currentConversation?.id) {
                state.incrementDmUnread(message.conversationId);
              }
              playNotificationSound();
              notifyNewMessage(
                message.user.displayName,
                'Direct Message',
                message.content
              );
            }
          });

          socket.on('user:status', ({ userId, status }: { userId: string; status: string }) => {
            updateMemberStatus(userId, status);
          });

          socket.on('user:typing', ({ channelId, userId, username }: any) => {
            setUserTyping(channelId, userId, username);
          });

          socket.on('user:typing:stop', ({ channelId, userId }: any) => {
            clearUserTyping(channelId, userId);
          });
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [token, router, hydrated]);

  // Load messages when channel changes
  useEffect(() => {
    if (!token || !currentChannel) return;

    const loadMessages = async () => {
      try {
        const { messages } = await api.messages.list(currentChannel.id, token);
        setMessages(messages);
        joinChannel(currentChannel.id);
        // Clear unread when viewing channel
        useStore.getState().clearUnread(currentChannel.id);
      } catch (error) {
        console.error('Failed to load messages:', error);
      }
    };

    loadMessages();
  }, [currentChannel, token, setMessages]);

  // Load DM messages when conversation changes
  useEffect(() => {
    if (!token || !currentConversation) return;

    const loadDmMessages = async () => {
      try {
        const { messages } = await api.dm.getMessages(currentConversation.id, token);
        setDirectMessages(messages);
        // Join DM room for real-time updates
        const socket = getSocket();
        if (socket) {
          socket.emit('dm:join', currentConversation.id);
        }
        // Clear unread when viewing conversation
        useStore.getState().clearDmUnread(currentConversation.id);
      } catch (error) {
        console.error('Failed to load DM messages:', error);
      }
    };

    loadDmMessages();
  }, [currentConversation, token, setDirectMessages]);

  // Load conversations on workspace load
  useEffect(() => {
    if (!token || !currentWorkspace) return;

    const loadConversations = async () => {
      try {
        const conversations = await api.dm.list(currentWorkspace.id, token);
        setConversations(conversations);
      } catch (error) {
        console.error('Failed to load conversations:', error);
      }
    };

    loadConversations();
  }, [currentWorkspace, token, setConversations]);

  const handleSendMessage = async (content: string) => {
    // Handle DM messages
    if (currentConversation) {
      if (!token) return;
      try {
        const message = await api.dm.sendMessage(currentConversation.id, content, token);
        addDirectMessage(message);
      } catch (error) {
        console.error('Failed to send DM:', error);
      }
      return;
    }

    // Handle channel messages
    if (!token || !currentChannel) return;

    try {
      const message = await api.messages.create(
        { channelId: currentChannel.id, content },
        token
      );
      addMessage(message);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleStartDM = async (userId: string) => {
    if (!token || !currentWorkspace) return;

    try {
      const conversation = await api.dm.start(currentWorkspace.id, userId, token);
      // Add to conversations if not already there
      addConversation(conversation);
      // Switch to this conversation
      setCurrentConversation(conversation);
    } catch (error) {
      console.error('Failed to start DM:', error);
    }
  };

  const handleTyping = () => {
    if (currentChannel) {
      startTyping(currentChannel.id);
    }
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!token || !user) return;
    
    // Optimistically update the UI
    useStore.getState().addReaction(messageId, emoji, user.id, user.username);
    
    try {
      await api.messages.addReaction(messageId, emoji, token);
    } catch (error) {
      console.error('Failed to add reaction:', error);
      // Rollback on error
      useStore.getState().removeReaction(messageId, emoji, user.id);
    }
  };

  const handleEditMessage = async (messageId: string, content: string) => {
    if (!token) return;
    try {
      await api.messages.update(messageId, content, token);
      useStore.getState().updateMessage(messageId, content);
    } catch (error) {
      console.error('Failed to edit message:', error);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!token) return;
    try {
      await api.messages.delete(messageId, token);
      useStore.getState().deleteMessage(messageId);
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  };

  const handleSendReply = async (content: string, parentId: string) => {
    if (!token || !currentChannel) return;
    try {
      const message = await api.messages.create(
        { channelId: currentChannel.id, content, parentId },
        token
      );
      addMessage(message);
    } catch (error) {
      console.error('Failed to send reply:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading PulseWeave...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={toggleSidebar}
          />
        )}
        
        {/* Sidebar - hidden on mobile, slide in when open */}
        <div className={`
          fixed lg:relative inset-y-0 left-0 z-50 lg:z-auto
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          <Sidebar onToggle={toggleSidebar} onStartDM={handleStartDM} />
        </div>
        
        <ChatArea
          onSendMessage={handleSendMessage}
          onTyping={handleTyping}
          onReaction={handleReaction}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
          onToggleSidebar={toggleSidebar}
          onSendReply={handleSendReply}
        />

        {/* Command Palette */}
        {commandPaletteOpen && (
          <Portal>
            <CommandPalette
              onClose={() => setCommandPaletteOpen(false)}
              onOpenShortcuts={() => {
                setCommandPaletteOpen(false);
                setShortcutsOpen(true);
              }}
              onStartDM={handleStartDM}
              onCreateChannel={() => {
                setCommandPaletteOpen(false);
                setCreateChannelOpen(true);
              }}
              onOpenSettings={() => {
                setCommandPaletteOpen(false);
                router.push('/settings');
              }}
              onLogout={() => {
                useStore.getState().logout();
                router.push('/login');
              }}
            />
          </Portal>
        )}

        {/* Keyboard Shortcuts */}
        {shortcutsOpen && (
          <Portal>
            <KeyboardShortcuts onClose={() => setShortcutsOpen(false)} />
          </Portal>
        )}

        {/* Create Channel Modal */}
        {createChannelOpen && (
          <Portal>
            <CreateChannelModal
              onClose={() => setCreateChannelOpen(false)}
              onCreate={async (name, description, isPrivate) => {
                if (!token || !currentWorkspace) return;
                const channel = await api.channels.create({
                  workspaceId: currentWorkspace.id,
                  name,
                  description: description || undefined,
                  isPrivate,
                }, token);
                useStore.getState().addChannel(channel);
                useStore.getState().setCurrentChannel(channel);
              }}
            />
          </Portal>
        )}
      </div>
    </TooltipProvider>
  );
}
