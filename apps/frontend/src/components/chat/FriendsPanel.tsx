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

interface FriendUser {
  id: string;
  displayName: string;
  username: string;
  avatarUrl?: string | null;
  status: string;
  statusMessage?: string | null;
}

interface Friend {
  id: string;
  friendshipId: string;
  user: FriendUser;
  since: string;
}

interface FriendRequest {
  id: string;
  from: FriendUser;
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
  const [addFriendError, setAddFriendError] = useState('');
  const [addFriendLoading, setAddFriendLoading] = useState(false);

  // Load friends and requests from API
  const loadFriends = async () => {
    if (!token) return;
    setLoading(true);
    
    try {
      // Fetch friends
      const friendsRes = await api.get<{ friends: Friend[] }>('/api/friends');
      setFriends(friendsRes.friends || []);
      
      // Fetch pending requests
      const requestsRes = await api.get<{ requests: FriendRequest[] }>('/api/friends/requests');
      setRequests(requestsRes.requests || []);
    } catch (err) {
      console.error('Failed to load friends:', err);
      // Fallback to workspace members if API fails
      const memberFriends: Friend[] = members
        .filter(m => m.user.id !== user?.id)
        .map(m => ({
          id: m.user.id,
          friendshipId: '',
          user: {
            id: m.user.id,
            displayName: m.user.displayName,
            username: m.user.username,
            avatarUrl: m.user.avatarUrl,
            status: m.user.status,
            statusMessage: m.user.statusMessage,
          },
          since: new Date().toISOString(),
        }));
      setFriends(memberFriends);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFriends();
  }, [token, members, user?.id]);

  const filteredFriends = friends.filter(friend => {
    const matchesSearch = friend.user.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          friend.user.username.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;
    
    if (filter === 'online') return friend.user.status === 'online' || friend.user.status === 'away' || friend.user.status === 'dnd';
    if (filter === 'pending') return false; // Pending shows requests, not friends
    return true;
  });

  const onlineFriends = friends.filter(f => f.user.status !== 'offline');
  const pendingCount = requests.length;

  const handleAcceptRequest = async (requestId: string) => {
    try {
      await api.post(`/api/friends/request/${requestId}/accept`, {});
      setRequests(prev => prev.filter(r => r.id !== requestId));
      loadFriends(); // Refresh friends list
    } catch (err) {
      console.error('Failed to accept request:', err);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    try {
      await api.post(`/api/friends/request/${requestId}/decline`, {});
      setRequests(prev => prev.filter(r => r.id !== requestId));
    } catch (err) {
      console.error('Failed to decline request:', err);
    }
  };

  const handleAddFriend = async () => {
    if (!addFriendUsername.trim()) return;
    setAddFriendLoading(true);
    setAddFriendError('');
    
    try {
      const result = await api.post<{ message: string; status?: string }>('/api/friends/request', {
        username: addFriendUsername.trim(),
      });
      
      setAddFriendUsername('');
      setAddFriendOpen(false);
      
      // If auto-accepted (they had sent us a request), refresh friends
      if (result.status === 'accepted') {
        loadFriends();
      }
    } catch (err: any) {
      setAddFriendError(err.message || 'Failed to send friend request');
    } finally {
      setAddFriendLoading(false);
    }
  };

  const handleRemoveFriend = async (friendshipId: string) => {
    if (!confirm('Are you sure you want to remove this friend?')) return;
    try {
      await api.delete(`/api/friends/${friendshipId}`);
      setFriends(prev => prev.filter(f => f.friendshipId !== friendshipId));
    } catch (err) {
      console.error('Failed to remove friend:', err);
    }
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
          <div className="mb-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter username..."
                value={addFriendUsername}
                onChange={(e) => {
                  setAddFriendUsername(e.target.value);
                  setAddFriendError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleAddFriend()}
                className="flex-1"
                disabled={addFriendLoading}
              />
              <Button size="sm" onClick={handleAddFriend} disabled={addFriendLoading}>
                {addFriendLoading ? 'Sending...' : 'Send'}
              </Button>
            </div>
            {addFriendError && (
              <p className="text-xs text-destructive mt-1">{addFriendError}</p>
            )}
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
                      <AvatarImage src={friend.user.avatarUrl || undefined} />
                      <AvatarFallback className={cn('text-xs', generateAvatarColor(friend.user.displayName))}>
                        {getInitials(friend.user.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <PresenceIndicator 
                      status={(friend.user.status as FriendStatus) || 'offline'} 
                      className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 border-2 border-background"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{friend.user.displayName}</p>
                    <p className="text-xs text-muted-foreground">
                      {friend.user.statusMessage || friend.user.status || 'offline'}
                    </p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => onStartDM?.(friend.user.id)}
                      title="Send message"
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      title="Remove friend"
                      onClick={() => handleRemoveFriend(friend.friendshipId)}
                    >
                      <UserMinus className="h-4 w-4" />
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
