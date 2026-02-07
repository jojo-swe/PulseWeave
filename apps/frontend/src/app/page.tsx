'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { Sidebar } from '@/components/chat/Sidebar';
import { ChatArea } from '@/components/chat/ChatArea';
import { CommandPalette } from '@/components/chat/CommandPalette';
import { KeyboardShortcuts } from '@/components/chat/KeyboardShortcuts';
import { CreateChannelModal } from '@/components/chat/CreateChannelModal';
import { GlobalSearch } from '@/components/chat/GlobalSearch';
import { ActivityPanel } from '@/components/chat/ActivityPanel';
import { FriendsPanel } from '@/components/chat/FriendsPanel';
import { Portal } from '@/components/ui/portal';
import { TooltipProvider } from '@/components/ui/tooltip';
import { NavigationRail } from '@/components/chat/NavigationRail';
import { BottomNavigation } from '@/components/chat/BottomNavigation';
import { WelcomeGuide } from '@/components/onboarding/WelcomeGuide';
import { UserProfileModal } from '@/components/chat/UserProfileModal';
import { cn } from '@/lib/utils';
import { useAuthCheck } from '@/hooks/useAuthCheck';
import { useSocketEvents } from '@/hooks/useSocketEvents';
import { useChannelMessages, useDmMessages, useMessageActions } from '@/hooks/useMessages';

export default function Home() {
  const router = useRouter();
  const { user, token, currentWorkspace, sidebarOpen, toggleSidebar } = useStore();

  const { loading } = useAuthCheck();
  useSocketEvents();
  useChannelMessages();
  useDmMessages();

  const {
    handleSendMessage,
    handleStartDM,
    handleTyping,
    handleReaction,
    handleEditMessage,
    handleDeleteMessage,
    handleSendReply,
  } = useMessageActions();

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'activity' | 'friends'>('chat');

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setShortcutsOpen(prev => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCreateChannel = useCallback(async (name: string, description: string, isPrivate: boolean) => {
    if (!token || !currentWorkspace) return;
    const channel = await api.channels.create({
      workspaceId: currentWorkspace.id,
      name,
      description: description || undefined,
      isPrivate,
    }, token);
    useStore.getState().addChannel(channel);
    useStore.getState().setCurrentChannel(channel);
  }, [token, currentWorkspace]);

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
      {/* Main Container - Unified Glass Layout */}
      <div className="flex h-screen w-full p-4 lg:p-6 overflow-hidden max-w-[1920px] mx-auto bg-transparent relative">
        {/* Master Glass Wrapper */}
        <div className="flex h-full w-full glass rounded-3xl shadow-2xl border border-white/10 overflow-hidden relative z-10">
          
          {/* Mobile sidebar overlay */}
          {sidebarOpen && (
            <div 
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              onClick={toggleSidebar}
            />
          )}
          
          {/* Navigation Rail - Desktop only */}
          <div className="hidden lg:flex shrink-0">
            <NavigationRail 
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onOpenProfile={() => setShowProfile(true)}
            />
          </div>

          {/* Bottom Navigation - Mobile only */}
          <BottomNavigation 
            activeTab={activeTab}
            onTabChange={setActiveTab}
            className="lg:hidden z-[60]"
          />

          {/* Sidebar Panel */}
          <div className={cn(
            "flex-col shrink-0 transition-all duration-300 ease-in-out lg:z-auto bg-background/95 backdrop-blur-xl lg:bg-transparent absolute inset-y-0 left-0 z-50 pb-16 lg:pb-0",
            sidebarOpen ? "translate-x-0 w-80 border-r border-white/5 shadow-2xl lg:shadow-none lg:static lg:w-64" : "-translate-x-full lg:translate-x-0 lg:w-64"
          )}>
            {activeTab === 'chat' && (
              <Sidebar onToggle={toggleSidebar} onStartDM={handleStartDM} />
            )}
            {activeTab === 'activity' && (
              <ActivityPanel />
            )}
            {activeTab === 'friends' && (
              <FriendsPanel onStartDM={handleStartDM} />
            )}
          </div>
          
          {/* Chat Area */}
          <div className="flex-1 min-w-0 flex flex-col h-full relative bg-gradient-to-br from-transparent to-indigo-950/20 pb-16 lg:pb-0">
            <ChatArea
              onSendMessage={handleSendMessage}
              onTyping={handleTyping}
              onReaction={handleReaction}
              onEditMessage={handleEditMessage}
              onDeleteMessage={handleDeleteMessage}
              onToggleSidebar={toggleSidebar}
              onSendReply={handleSendReply}
            />
          </div>
        </div>



        {/* User Profile Modal */}
        {showProfile && user && (
          <Portal>
            <UserProfileModal
              onClose={() => setShowProfile(false)}
            />
          </Portal>
        )}

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
              onCreate={handleCreateChannel}
            />
          </Portal>
        )}

        {/* Global Search */}
        {searchOpen && (
          <Portal>
            <GlobalSearch onClose={() => setSearchOpen(false)} />
          </Portal>
        )}

        {/* Welcome Guide for new users */}
        <WelcomeGuide />
      </div>
    </TooltipProvider>
  );
}
