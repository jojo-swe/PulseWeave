'use client';

import { useState, useRef, useEffect } from 'react';
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
import { StatusPicker } from './StatusPicker';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Portal } from '@/components/ui/portal';
import Link from 'next/link';
import {
  Hash,
  Lock,
  Plus,
  ChevronDown,
  Settings,
  LogOut,
  MessageCircle,
  MessageSquareText,
  Star,
  Shield,
  Users,
} from 'lucide-react';

interface SidebarProps {
  onCreateChannel?: () => void;
  onToggle?: () => void;
  onStartDM?: (userId: string) => void;
}

export function Sidebar({ onCreateChannel, onToggle, onStartDM }: SidebarProps) {
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showThreads, setShowThreads] = useState(false);
  const [statusPickerPosition, setStatusPickerPosition] = useState({ left: 0, bottom: 0 });
  const statusButtonRef = useRef<HTMLButtonElement>(null);
  
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
    starredChannels,
    toggleStarChannel,
    userStatus,
    conversations,
    currentConversation,
    setCurrentConversation,
    dmUnreadCounts,
    clearDmUnread,
  } = useStore();

  // Separate starred and regular channels
  const starredChannelsList = channels.filter(c => starredChannels.has(c.id));
  const regularChannels = channels.filter(c => !starredChannels.has(c.id));

  // Users with online/away/dnd are "active" (connected), only 'offline' means disconnected
  const onlineMembers = members.filter((m) => m.user.status !== 'offline');
  const offlineMembers = members.filter((m) => m.user.status === 'offline');

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
    <div className="flex h-full w-full flex-col text-sidebar-foreground glass-sidebar">
      {/* Workspace Header */}
      <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
        <button className="flex items-center gap-2 font-semibold hover:bg-sidebar-accent rounded px-2 py-1 transition-colors">
          <span className="truncate">{currentWorkspace?.name || 'PulseWeave'}</span>
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
          {/* Starred Channels Section */}
          {starredChannelsList.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-xs font-semibold uppercase tracking-wider opacity-60 flex items-center gap-1">
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  Starred
                </span>
              </div>
              <div className="mt-1 space-y-0.5">
                {starredChannelsList.map((channel) => {
                  const unreadCount = unreadCounts[channel.id] || 0;
                  const isActive = currentChannel?.id === channel.id;
                  
                  return (
                    <div key={channel.id} className="group relative flex items-center">
                      <button
                        onClick={() => {
                          setCurrentChannel(channel);
                          if (unreadCount > 0) {
                            clearUnread(channel.id);
                            if (token) api.channels.markRead(channel.id, token).catch(() => {});
                          }
                          if (window.innerWidth < 1024 && onToggle) onToggle();
                        }}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-all duration-200',
                          isActive
                            ? 'bg-primary/20 text-white shadow-sm'
                            : unreadCount > 0
                            ? 'text-white font-semibold hover:bg-sidebar-accent/50'
                            : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                        )}
                      >
                        {channel.isPrivate ? (
                          <Lock className={cn('h-4 w-4 transition-colors', isActive ? 'text-primary' : unreadCount > 0 ? 'opacity-100' : 'opacity-60')} />
                        ) : (
                          <Hash className={cn('h-4 w-4 transition-colors', isActive ? 'text-primary' : unreadCount > 0 ? 'opacity-100' : 'opacity-60')} />
                        )}
                        <span className="truncate flex-1 text-left">{channel.name}</span>
                        {unreadCount > 0 && !isActive && (
                          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-white animate-pulse">
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStarChannel(channel.id);
                        }}
                        className="absolute right-1 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-sidebar-accent transition-all duration-200"
                        title="Unstar channel"
                      >
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Threads Section */}
          <div className="mb-4">
            <button
              onClick={() => setShowThreads(!showThreads)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm transition-colors',
                showThreads 
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground' 
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
              )}
            >
              <MessageSquareText className="h-4 w-4" />
              <span className="font-medium">Threads</span>
            </button>
            {showThreads && (
              <div className="mt-2 px-2 py-3 rounded-md bg-sidebar-accent/30 text-sm text-sidebar-foreground/70">
                <p className="text-center">No active threads</p>
                <p className="text-center text-xs mt-1 opacity-60">Replies to messages will appear here</p>
              </div>
            )}
          </div>

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
              {regularChannels.map((channel) => {
                const unreadCount = unreadCounts[channel.id] || 0;
                const isActive = currentChannel?.id === channel.id;
                
                return (
                  <div key={channel.id} className="group relative flex items-center">
                    <button
                      onClick={() => {
                        setCurrentChannel(channel);
                        if (unreadCount > 0) {
                          clearUnread(channel.id);
                          if (token) api.channels.markRead(channel.id, token).catch(() => {});
                        }
                        if (window.innerWidth < 1024 && onToggle) onToggle();
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-all duration-200',
                        isActive
                          ? 'bg-primary/20 text-white shadow-sm'
                          : unreadCount > 0
                          ? 'text-white font-semibold hover:bg-sidebar-accent/50'
                          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                      )}
                    >
                      {channel.isPrivate ? (
                        <Lock className={cn('h-4 w-4 transition-colors', isActive ? 'text-primary' : unreadCount > 0 ? 'opacity-100' : 'opacity-60')} />
                      ) : (
                        <Hash className={cn('h-4 w-4 transition-colors', isActive ? 'text-primary' : unreadCount > 0 ? 'opacity-100' : 'opacity-60')} />
                      )}
                      <span className="truncate flex-1 text-left">{channel.name}</span>
                      {unreadCount > 0 && !isActive && (
                        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-white animate-pulse">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStarChannel(channel.id);
                      }}
                      className="absolute right-1 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-sidebar-accent transition-all duration-200"
                      title="Star channel"
                    >
                      <Star className="h-3 w-3 text-sidebar-foreground/60 hover:text-yellow-400" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Direct Messages Section */}
          <div className="mb-4">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-xs font-semibold uppercase tracking-wider opacity-60">
                Direct Messages
              </span>
            </div>
            <div className="mt-1 space-y-0.5">
              {conversations.length === 0 && (
                <div className="px-2 py-2 text-center text-sidebar-foreground/50 text-xs">
                  Click a member below to start a DM
                </div>
              )}
              {conversations.map((conv) => {
                const otherMembers = conv.members.filter((m) => m.id !== user?.id);
                const displayName = conv.isGroup
                  ? conv.name || otherMembers.map((m) => m.displayName).join(', ')
                  : otherMembers[0]?.displayName || 'Unknown';
                const avatarMember = otherMembers[0];
                const unreadCount = dmUnreadCounts[conv.id] || 0;
                const isActive = currentConversation?.id === conv.id;

                return (
                  <button
                    key={conv.id}
                    onClick={() => {
                      setCurrentConversation(conv);
                      if (unreadCount > 0) clearDmUnread(conv.id);
                      if (window.innerWidth < 1024 && onToggle) onToggle();
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
                    <div className="relative">
                      {conv.isGroup ? (
                        <div className="h-6 w-6 rounded-full bg-sidebar-accent flex items-center justify-center">
                          <Users className="h-3 w-3" />
                        </div>
                      ) : (
                        <>
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={avatarMember?.avatarUrl} />
                            <AvatarFallback className={cn('text-xs', generateAvatarColor(displayName))}>
                              {getInitials(displayName)}
                            </AvatarFallback>
                          </Avatar>
                          <PresenceIndicator
                            status={(avatarMember?.status as 'online' | 'away' | 'dnd' | 'offline') || 'offline'}
                            size="sm"
                            className="absolute -bottom-0.5 -right-0.5"
                          />
                        </>
                      )}
                    </div>
                    <span className="truncate flex-1 text-left">{displayName}</span>
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

          {/* Team Members Section */}
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
              {onlineMembers.map(({ user: member }) => {
                const statusLabel = member.status === 'online' ? 'Online' : 
                                   member.status === 'away' ? 'Away' : 
                                   member.status === 'dnd' ? 'Do Not Disturb' : 'Offline';
                const statusMsg = member.statusMessage;
                const tooltip = statusMsg 
                  ? `${member.displayName} • ${statusLabel}\n"${statusMsg}"`
                  : `${member.displayName} • ${statusLabel}`;
                
                return (
                  <button
                    key={member.id}
                    onClick={() => member.id !== user?.id && onStartDM?.(member.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors group',
                      member.id === user?.id
                        ? 'text-sidebar-foreground/80 cursor-default'
                        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50'
                    )}
                    title={member.id === user?.id ? undefined : tooltip}
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
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-1">
                        <span className="truncate">{member.displayName}</span>
                        {member.id === user?.id && (
                          <span className="text-xs opacity-50">(you)</span>
                        )}
                      </div>
                      {statusMsg && (
                        <p className="text-xs text-sidebar-foreground/50 truncate italic">
                          {statusMsg}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
              {/* Offline Members */}
              {offlineMembers.map(({ user: member }) => {
                const statusMsg = member.statusMessage;
                const tooltip = statusMsg 
                  ? `${member.displayName} • Offline\n"${statusMsg}"`
                  : `${member.displayName} • Offline`;
                
                return (
                  <button
                    key={member.id}
                    onClick={() => member.id !== user?.id && onStartDM?.(member.id)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-sidebar-foreground/50 hover:bg-sidebar-accent/50 transition-colors"
                    title={tooltip}
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
                    <div className="flex-1 min-w-0 text-left">
                      <span className="truncate block">{member.displayName}</span>
                      {statusMsg && (
                        <p className="text-xs text-sidebar-foreground/40 truncate italic">
                          {statusMsg}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* User Footer */}
      <div className="p-3 border-t border-white/5 bg-black/20 mt-auto">
        <button
          onClick={() => setShowProfile(true)}
          className="flex w-full items-center gap-3 rounded-lg p-2 hover:bg-white/5 transition-colors group"
        >
          <div className="relative">
            <Avatar className="h-9 w-9 border border-white/10">
              <AvatarImage src={user?.avatarUrl} />
              <AvatarFallback className={cn('text-sm', generateAvatarColor(user?.displayName || 'User'))}>
                {getInitials(user?.displayName || 'User')}
              </AvatarFallback>
            </Avatar>
            <PresenceIndicator 
              status={user?.status as any || 'online'} 
              size="sm" 
              className="absolute -bottom-0.5 -right-0.5 border-2 border-[#1a1b1e]" 
            />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="font-medium text-sm truncate text-sidebar-foreground">{user?.displayName}</div>
            <div className="text-xs text-sidebar-foreground/60 truncate">
              {user?.status === 'online' ? 'Online' : user?.status === 'dnd' ? 'Do Not Disturb' : user?.status === 'away' ? 'Away' : 'Offline'}
            </div>
          </div>
          <Settings className="h-4 w-4 text-sidebar-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
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

      {/* Status Picker */}
      {showStatusPicker && (
        <Portal>
          <div 
            className="fixed z-50"
            style={{ 
              left: statusPickerPosition.left, 
              bottom: statusPickerPosition.bottom 
            }}
          >
            <StatusPicker onClose={() => setShowStatusPicker(false)} />
          </div>
        </Portal>
      )}
    </div>
  );
}
