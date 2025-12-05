'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { cn, getInitials, generateAvatarColor } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { PresenceIndicator } from '@/components/ui/presence-indicator';
import {
  Users,
  UserPlus,
  MessageSquare,
  Search,
  MoreHorizontal,
  UserMinus,
  Ban,
  Check,
  X,
  Clock,
} from 'lucide-react';

type FriendStatus = 'online' | 'away' | 'dnd' | 'offline';

interface Friend {
  id: string;
  displayName: string;
  username: string;
  avatarUrl?: string;
  status: FriendStatus;
  customStatus?: string;
}

interface FriendRequest {
  id: string;
  from: Friend;
  createdAt: string;
}

interface FriendsPanelProps {
  onStartDM?: (userId: string) => void;
}

/**
 * Friends panel showing online friends and friend requests.
 */
export function FriendsPanel({ onStartDM }: FriendsPanelProps) {
  const { token, members, user } = useStore();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'online' | 'all' | 'pending'>('online');
  const [searchQuery, setSearchQuery] = useState('');
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const [addFriendUsername, setAddFriendUsername] = useState('');

  // Use workspace members as friends for now
  useEffect(() => {
    const loadFriends = async () => {
      setLoading(true);
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Convert members to friends format
      const mapStatus = (status: string): FriendStatus => {
        if (status === 'online') return 'online';
        if (status === 'away') return 'away';
        if (status === 'busy' || status === 'dnd') return 'dnd';
        return 'offline';
      };
      
      const memberFriends: Friend[] = members
        .filter(m => m.user.id !== user?.id)
        .map(m => ({
          id: m.user.id,
          displayName: m.user.displayName,
          username: m.user.username,
          avatarUrl: m.user.avatarUrl,
          status: mapStatus(m.user.status),
        }));
      
      setFriends(memberFriends);
      
      // Mock pending requests
      setRequests([]);
      
      setLoading(false);
    };

    loadFriends();
  }, [members, user?.id]);

  const filteredFriends = friends.filter(friend => {
    const matchesSearch = friend.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          friend.username.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;
    
    if (filter === 'online') return friend.status === 'online' || friend.status === 'away' || friend.status === 'dnd';
    if (filter === 'pending') return false; // Pending shows requests, not friends
    return true;
  });

  const onlineFriends = friends.filter(f => f.status !== 'offline');
  const pendingCount = requests.length;

  const handleAcceptRequest = (requestId: string) => {
    setRequests(prev => prev.filter(r => r.id !== requestId));
    // TODO: API call to accept
  };

  const handleDeclineRequest = (requestId: string) => {
    setRequests(prev => prev.filter(r => r.id !== requestId));
    // TODO: API call to decline
  };

  const handleAddFriend = async () => {
    if (!addFriendUsername.trim()) return;
    // TODO: API call to send friend request
    setAddFriendUsername('');
    setAddFriendOpen(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-lg">Friends</h2>
          </div>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setAddFriendOpen(!addFriendOpen)}
            className="gap-1"
          >
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Add</span>
          </Button>
        </div>

        {/* Add friend input */}
        {addFriendOpen && (
          <div className="flex gap-2 mb-4">
            <Input
              placeholder="Enter username..."
              value={addFriendUsername}
              onChange={(e) => setAddFriendUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddFriend()}
              className="flex-1"
            />
            <Button size="sm" onClick={handleAddFriend}>
              Send
            </Button>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
          <button
            onClick={() => setFilter('online')}
            className={cn(
              'flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              filter === 'online'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Online
            {onlineFriends.length > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({onlineFriends.length})
              </span>
            )}
          </button>
          <button
            onClick={() => setFilter('all')}
            className={cn(
              'flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              filter === 'all'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            All
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={cn(
              'flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors relative',
              filter === 'pending'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Pending
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 text-xs bg-primary text-primary-foreground rounded-full flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        {filter !== 'pending' && (
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search friends..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        )}
      </div>

      {/* Friends list */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {loading ? (
            <div className="space-y-2 p-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              ))}
            </div>
          ) : filter === 'pending' ? (
            requests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Clock className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground text-sm">No pending requests</p>
              </div>
            ) : (
              <div className="space-y-1">
                {requests.map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/30"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={request.from.avatarUrl} />
                      <AvatarFallback className={cn('text-xs', generateAvatarColor(request.from.displayName))}>
                        {getInitials(request.from.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{request.from.displayName}</p>
                      <p className="text-xs text-muted-foreground">@{request.from.username}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-green-500 hover:text-green-400 hover:bg-green-500/10"
                        onClick={() => handleAcceptRequest(request.id)}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                        onClick={() => handleDeclineRequest(request.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : filteredFriends.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm">
                {searchQuery 
                  ? 'No friends found' 
                  : filter === 'online' 
                  ? 'No friends online' 
                  : 'No friends yet'}
              </p>
              {!searchQuery && friends.length === 0 && (
                <Button 
                  variant="link" 
                  size="sm" 
                  className="mt-2"
                  onClick={() => setAddFriendOpen(true)}
                >
                  Add your first friend
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredFriends.map((friend) => (
                <div
                  key={friend.id}
                  className="group flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="relative">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={friend.avatarUrl} />
                      <AvatarFallback className={cn('text-xs', generateAvatarColor(friend.displayName))}>
                        {getInitials(friend.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <PresenceIndicator 
                      status={friend.status} 
                      className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 border-2 border-background"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{friend.displayName}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {friend.customStatus || friend.status}
                    </p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => onStartDM?.(friend.id)}
                      title="Send message"
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      title="More options"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
