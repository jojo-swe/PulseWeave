'use client';

import { cn } from '@/lib/utils';

type Status = 'online' | 'away' | 'dnd' | 'offline';

interface PresenceIndicatorProps {
  status: Status;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const statusColors: Record<Status, string> = {
  online: 'bg-green-500',
  away: 'bg-yellow-500',
  dnd: 'bg-red-500',
  offline: 'bg-gray-500',
};

const statusLabels: Record<Status, string> = {
  online: 'Online',
  away: 'Away',
  dnd: 'Do not disturb',
  offline: 'Offline',
};

const sizes = {
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
};

export function PresenceIndicator({ status, size = 'md', className }: PresenceIndicatorProps) {
  return (
    <span
      className={cn(
        'rounded-full border-2 border-gray-900 shrink-0',
        statusColors[status] || statusColors.offline,
        sizes[size],
        status === 'online' && 'animate-pulse',
        className
      )}
      title={statusLabels[status] || 'Offline'}
    />
  );
}

interface UserAvatarWithPresenceProps {
  children: React.ReactNode;
  status: string;
  size?: 'sm' | 'md' | 'lg';
}

export function UserAvatarWithPresence({ children, status, size = 'md' }: UserAvatarWithPresenceProps) {
  const normalizedStatus = (['online', 'away', 'dnd', 'offline'].includes(status) 
    ? status 
    : 'offline') as Status;

  return (
    <div className="relative inline-block">
      {children}
      <PresenceIndicator
        status={normalizedStatus}
        size={size}
        className="absolute bottom-0 right-0"
      />
    </div>
  );
}
