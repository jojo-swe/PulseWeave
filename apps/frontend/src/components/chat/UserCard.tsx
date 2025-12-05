'use client';

import { useState } from 'react';
import { X, MessageSquare, AtSign, Clock, Calendar } from 'lucide-react';
import { cn, getInitials, generateAvatarColor } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { PresenceIndicator } from '@/components/ui/presence-indicator';

interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  status?: string;
  email?: string;
  createdAt?: string;
}

interface UserCardProps {
  user: User;
  onClose: () => void;
  onStartDM?: (userId: string) => void;
  position?: { top: number; left: number };
}

/**
 * User profile card that appears when clicking on a user's name.
 * Shows user info and provides quick actions like starting a DM.
 */
export function UserCard({ user, onClose, onStartDM, position }: UserCardProps) {
  const [loading, setLoading] = useState(false);

  const handleStartDM = async () => {
    if (!onStartDM) return;
    setLoading(true);
    try {
      await onStartDM(user.id);
      onClose();
    } catch (error) {
      console.error('Failed to start DM:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatJoinDate = (dateStr?: string) => {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const getStatusText = (status?: string) => {
    switch (status) {
      case 'online': return 'Active';
      case 'away': return 'Away';
      case 'busy': return 'Do Not Disturb';
      case 'dnd': return 'Do Not Disturb';
      default: return 'Offline';
    }
  };

  const style: React.CSSProperties = position
    ? { position: 'fixed', top: position.top, left: position.left }
    : {};

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      
      {/* Card */}
      <div 
        style={style}
        className="fixed z-50 w-72 rounded-xl border bg-popover shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Banner */}
        <div className="h-16 bg-gradient-to-r from-primary/80 to-purple-600/80" />
        
        {/* Avatar - overlapping banner */}
        <div className="px-4 -mt-10">
          <div className="relative inline-block">
            <Avatar className="h-20 w-20 border-4 border-popover">
              <AvatarImage src={user.avatarUrl} />
              <AvatarFallback className={cn('text-2xl', generateAvatarColor(user.displayName))}>
                {getInitials(user.displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="absolute bottom-1 right-1">
              <PresenceIndicator status={user.status as any || 'offline'} size="lg" />
            </div>
          </div>
        </div>

        {/* User Info */}
        <div className="p-4 pt-2">
          <h3 className="text-lg font-bold">{user.displayName}</h3>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <AtSign className="h-3 w-3" />
            {user.username}
          </p>
          
          {/* Status */}
          <div className="mt-3 flex items-center gap-2 text-sm">
            <div className={cn(
              'w-2 h-2 rounded-full',
              user.status === 'online' ? 'bg-green-500' :
              user.status === 'away' ? 'bg-yellow-500' :
              user.status === 'busy' || user.status === 'dnd' ? 'bg-red-500' :
              'bg-gray-500'
            )} />
            <span className="text-muted-foreground">{getStatusText(user.status)}</span>
          </div>

          {/* Join Date */}
          {user.createdAt && (
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>Joined {formatJoinDate(user.createdAt)}</span>
            </div>
          )}

          {/* Divider */}
          <div className="my-4 border-t" />

          {/* Actions */}
          <div className="flex gap-2">
            <Button 
              className="flex-1" 
              onClick={handleStartDM}
              disabled={loading}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              {loading ? 'Opening...' : 'Message'}
            </Button>
          </div>
        </div>

        {/* Close button */}
        <Button 
          variant="ghost" 
          size="icon" 
          className="absolute top-2 right-2 h-6 w-6 text-white/80 hover:text-white hover:bg-white/20"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </>
  );
}

export default UserCard;
