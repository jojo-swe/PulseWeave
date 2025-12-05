'use client';

import { useState } from 'react';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { cn, getInitials, generateAvatarColor } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PresenceIndicator } from '@/components/ui/presence-indicator';
import { CreateChannelModal } from './CreateChannelModal';
import { UserProfileModal } from './UserProfileModal';
import { WorkspaceSettingsModal } from './WorkspaceSettingsModal';
import { Portal } from '@/components/ui/portal';
import {
  Hash,
  Lock,
  Plus,
  ChevronDown,
  Settings,
  LogOut,
  MessageCircle,
} from 'lucide-react';

interface SidebarProps {
  onCreateChannel?: () => void;
  onToggle?: () => void;
}

export function Sidebar({ onCreateChannel, onToggle }: SidebarProps) {
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);
  
  const {
    user,
    token,
    currentWorkspace,
    channels,
    currentChannel,
    setCurrentChannel,
    addChannel,
    members,
    logout,
    unreadCounts,
    clearUnread,
  } = useStore();

  const onlineMembers = members.filter((m) => m.user.status === 'online');
  const offlineMembers = members.filter((m) => m.user.status !== 'online');

  const handleCreateChannel = async (name: string, description: string, isPrivate: boolean) => {
    if (!token || !currentWorkspace) throw new Error('Not authenticated');
    
    const channel = await api.channels.create({
      workspaceId: currentWorkspace.id,
      name,
      description: description || undefined,
      isPrivate,
    }, token);
    
    addChannel(channel);
    setCurrentChannel(channel);
  };

  return (
    <div className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground">
      {/* Workspace Header */}
      <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
        <button className="flex items-center gap-2 font-semibold hover:bg-sidebar-accent rounded px-2 py-1 transition-colors">
          <span className="truncate">{currentWorkspace?.name || 'Chatterbox'}</span>
          <ChevronDown className="h-4 w-4 opacity-60" />
        </button>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={() => setShowWorkspaceSettings(true)}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {/* Channels Section */}
          <div className="mb-4">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-xs font-semibold uppercase tracking-wider opacity-60">
                Channels
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-sidebar-foreground hover:bg-sidebar-accent"
                onClick={() => setShowCreateChannel(true)}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <div className="mt-1 space-y-0.5">
              {channels.length === 0 && (
                <div className="px-2 py-4 text-center">
                  <div className="text-sidebar-foreground/50 text-sm">
                    No channels yet
                  </div>
                  <button
                    onClick={() => setShowCreateChannel(true)}
                    className="mt-2 text-xs text-primary hover:underline"
                  >
                    Create your first channel
                  </button>
                </div>
              )}
              {channels.map((channel) => {
                const unreadCount = unreadCounts[channel.id] || 0;
                const isActive = currentChannel?.id === channel.id;
                
                return (
                  <button
                    key={channel.id}
                    onClick={() => {
                      setCurrentChannel(channel);
                      if (unreadCount > 0) {
                        clearUnread(channel.id);
                      }
                      // Close sidebar on mobile
                      if (window.innerWidth < 1024 && onToggle) {
                        onToggle();
                      }
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors',
                      isActive
                        ? 'bg-sidebar-accent text-white'
                        : unreadCount > 0
                        ? 'text-white font-semibold hover:bg-sidebar-accent/50'
                        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50'
                    )}
                  >
                    {channel.isPrivate ? (
                      <Lock className={cn('h-4 w-4', unreadCount > 0 ? 'opacity-100' : 'opacity-60')} />
                    ) : (
                      <Hash className={cn('h-4 w-4', unreadCount > 0 ? 'opacity-100' : 'opacity-60')} />
                    )}
                    <span className="truncate flex-1 text-left">{channel.name}</span>
                    {unreadCount > 0 && !isActive && (
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Direct Messages Section */}
          <div className="mb-4">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-xs font-semibold uppercase tracking-wider opacity-60">
                Team Members
              </span>
            </div>
            <div className="mt-1 space-y-0.5">
              {members.length === 0 && (
                <div className="px-2 py-4 text-center text-sidebar-foreground/50 text-sm">
                  No team members yet
                </div>
              )}
              {/* Online Members */}
              {onlineMembers.map(({ user: member }) => (
                <button
                  key={member.id}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent/50 transition-colors"
                >
                  <div className="relative">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={member.avatarUrl} />
                      <AvatarFallback className={cn('text-xs', generateAvatarColor(member.displayName))}>
                        {getInitials(member.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <PresenceIndicator 
                      status={member.status as 'online' | 'away' | 'dnd' | 'offline'} 
                      size="sm" 
                      className="absolute -bottom-0.5 -right-0.5" 
                    />
                  </div>
                  <span className="truncate">{member.displayName}</span>
                  {member.id === user?.id && (
                    <span className="text-xs opacity-50">(you)</span>
                  )}
                </button>
              ))}
              {/* Offline Members */}
              {offlineMembers.map(({ user: member }) => (
                <button
                  key={member.id}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-sidebar-foreground/50 hover:bg-sidebar-accent/50 transition-colors"
                >
                  <div className="relative">
                    <Avatar className="h-6 w-6 opacity-50">
                      <AvatarImage src={member.avatarUrl} />
                      <AvatarFallback className={cn('text-xs', generateAvatarColor(member.displayName))}>
                        {getInitials(member.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <PresenceIndicator 
                      status="offline" 
                      size="sm" 
                      className="absolute -bottom-0.5 -right-0.5" 
                    />
                  </div>
                  <span className="truncate">{member.displayName}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* User Footer */}
      <div className="border-t border-white/10 p-2">
        <div className="flex items-center gap-2 rounded px-2 py-2">
          <button 
            onClick={() => setShowProfile(true)}
            className="flex items-center gap-2 flex-1 min-w-0 hover:bg-sidebar-accent rounded px-1 py-1 -ml-1 transition-colors"
          >
            <div className="relative">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.avatarUrl} />
                <AvatarFallback className={cn(generateAvatarColor(user?.displayName || ''))}>
                  {getInitials(user?.displayName || 'U')}
                </AvatarFallback>
              </Avatar>
              <PresenceIndicator 
                status={(user?.status as 'online' | 'away' | 'dnd' | 'offline') || 'online'} 
                size="sm" 
                className="absolute -bottom-0.5 -right-0.5" 
              />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium truncate">{user?.displayName}</p>
              <p className="text-xs opacity-60 truncate">@{user?.username}</p>
            </div>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Create Channel Modal */}
      {showCreateChannel && (
        <Portal>
          <CreateChannelModal
            onClose={() => setShowCreateChannel(false)}
            onCreate={handleCreateChannel}
          />
        </Portal>
      )}

      {/* User Profile Modal */}
      {showProfile && (
        <Portal>
          <UserProfileModal onClose={() => setShowProfile(false)} />
        </Portal>
      )}

      {/* Workspace Settings Modal */}
      {showWorkspaceSettings && (
        <Portal>
          <WorkspaceSettingsModal onClose={() => setShowWorkspaceSettings(false)} />
        </Portal>
      )}
    </div>
  );
}
