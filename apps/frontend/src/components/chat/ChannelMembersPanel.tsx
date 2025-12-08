'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { cn, getInitials, generateAvatarColor } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PresenceIndicator } from '@/components/ui/presence-indicator';
import {
  X,
  Search,
  Users,
  Crown,
  Shield,
  MessageSquare,
  UserPlus,
  MoreVertical,
} from 'lucide-react';

interface ChannelMember {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  status: string;
  statusMessage?: string | null;
  role?: string;
}

interface ChannelMembersPanelProps {
  channelId: string;
  channelName: string;
  isPrivate?: boolean;
  onClose: () => void;
  onStartDM?: (userId: string) => void;
}

export function ChannelMembersPanel({
  channelId,
  channelName,
  isPrivate,
  onClose,
  onStartDM,
}: ChannelMembersPanelProps) {
  const { token, user, members: workspaceMembers } = useStore();
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchMembers = async () => {
      if (!token) return;
      
      setLoading(true);
      try {
        // Try to fetch channel-specific members
        const response = await api.get<{ members: ChannelMember[] }>(
          `/api/channels/${channelId}/members`
        );
        setMembers(response.members);
      } catch {
        // Fallback to workspace members if channel members endpoint doesn't exist
        const mapped = workspaceMembers.map(m => ({
          id: m.user.id,
          username: m.user.username,
          displayName: m.user.displayName,
          avatarUrl: m.user.avatarUrl || null,
          status: m.user.status,
          statusMessage: m.user.statusMessage || null,
          role: m.role,
        }));
        setMembers(mapped);
      } finally {
        setLoading(false);
      }
    };

    fetchMembers();
  }, [channelId, token, workspaceMembers]);

  const filteredMembers = search
    ? members.filter(
        (m) =>
          m.displayName.toLowerCase().includes(search.toLowerCase()) ||
          m.username.toLowerCase().includes(search.toLowerCase())
      )
    : members;

  const onlineMembers = filteredMembers.filter((m) => m.status === 'online' || m.status === 'away' || m.status === 'dnd');
  const offlineMembers = filteredMembers.filter((m) => m.status === 'offline' || !m.status);

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'online': return 'Online';
      case 'away': return 'Away';
      case 'dnd': return 'Do Not Disturb';
      default: return 'Offline';
    }
  };

  const getRoleIcon = (role?: string) => {
    if (role === 'owner') return <Crown className="w-3 h-3 text-yellow-500" />;
    if (role === 'admin') return <Shield className="w-3 h-3 text-red-500" />;
    return null;
  };

  return (
    <div className="flex flex-col h-full bg-card border-l w-72">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-muted-foreground" />
          <div>
            <h3 className="font-semibold text-sm">Channel Members</h3>
            <p className="text-xs text-muted-foreground">
              {members.length} member{members.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members..."
            className="pl-9 h-8 text-sm"
          />
        </div>
      </div>

      {/* Members List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="p-2">
            {/* Online Members */}
            {onlineMembers.length > 0 && (
              <div className="mb-4">
                <p className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Online — {onlineMembers.length}
                </p>
                <div className="space-y-0.5">
                  {onlineMembers.map((member) => (
                    <MemberItem
                      key={member.id}
                      member={member}
                      isCurrentUser={member.id === user?.id}
                      onStartDM={onStartDM}
                      getStatusLabel={getStatusLabel}
                      getRoleIcon={getRoleIcon}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Offline Members */}
            {offlineMembers.length > 0 && (
              <div>
                <p className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Offline — {offlineMembers.length}
                </p>
                <div className="space-y-0.5">
                  {offlineMembers.map((member) => (
                    <MemberItem
                      key={member.id}
                      member={member}
                      isCurrentUser={member.id === user?.id}
                      onStartDM={onStartDM}
                      getStatusLabel={getStatusLabel}
                      getRoleIcon={getRoleIcon}
                      isOffline
                    />
                  ))}
                </div>
              </div>
            )}

            {filteredMembers.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {search ? 'No members found' : 'No members in this channel'}
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function MemberItem({
  member,
  isCurrentUser,
  onStartDM,
  getStatusLabel,
  getRoleIcon,
  isOffline,
}: {
  member: ChannelMember;
  isCurrentUser: boolean;
  onStartDM?: (userId: string) => void;
  getStatusLabel: (status: string) => string;
  getRoleIcon: (role?: string) => React.ReactNode;
  isOffline?: boolean;
}) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      className={cn(
        'flex items-center gap-2 p-2 rounded-lg transition-colors group',
        isOffline ? 'opacity-60' : '',
        !isCurrentUser && 'hover:bg-muted cursor-pointer'
      )}
      onClick={() => !isCurrentUser && onStartDM?.(member.id)}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="relative">
        <Avatar className="h-8 w-8">
          <AvatarImage src={member.avatarUrl || undefined} />
          <AvatarFallback className={cn('text-xs', generateAvatarColor(member.displayName))}>
            {getInitials(member.displayName)}
          </AvatarFallback>
        </Avatar>
        <PresenceIndicator
          status={(member.status as 'online' | 'away' | 'dnd' | 'offline') || 'offline'}
          size="sm"
          className="absolute -bottom-0.5 -right-0.5"
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="font-medium text-sm truncate">{member.displayName}</span>
          {getRoleIcon(member.role)}
          {isCurrentUser && (
            <span className="text-xs text-muted-foreground">(you)</span>
          )}
        </div>
        {member.statusMessage ? (
          <p className="text-xs text-muted-foreground truncate italic">
            {member.statusMessage}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {getStatusLabel(member.status)}
          </p>
        )}
      </div>

      {!isCurrentUser && showActions && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onStartDM?.(member.id);
          }}
        >
          <MessageSquare className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
}
