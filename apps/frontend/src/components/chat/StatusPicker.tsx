'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Circle, Clock, MinusCircle, Moon, Check } from 'lucide-react';

type StatusValue = 'online' | 'away' | 'dnd' | 'offline';

interface StatusOption {
  value: StatusValue;
  label: string;
  description: string;
  icon: typeof Circle;
  color: string;
  bgColor: string;
}

const STATUS_OPTIONS: StatusOption[] = [
  {
    value: 'online',
    label: 'Active',
    description: 'You appear active to others',
    icon: Circle,
    color: 'text-green-500',
    bgColor: 'bg-green-500',
  },
  {
    value: 'away',
    label: 'Away',
    description: 'You appear away',
    icon: Clock,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500',
  },
  {
    value: 'dnd',
    label: 'Do Not Disturb',
    description: 'Mute all notifications',
    icon: MinusCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-500',
  },
  {
    value: 'offline',
    label: 'Invisible',
    description: 'Appear offline to others',
    icon: Moon,
    color: 'text-gray-500',
    bgColor: 'bg-gray-500',
  },
];

interface StatusPickerProps {
  onClose: () => void;
  position?: { top?: number; bottom?: number; left?: number; right?: number };
}

/**
 * Dropdown picker for changing user status.
 * Can be positioned relative to a trigger element.
 */
export function StatusPicker({ onClose, position }: StatusPickerProps) {
  const { user, token, updateMemberStatus } = useStore();
  const ref = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const currentStatus = user?.status || 'offline';

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSelect = async (status: StatusValue) => {
    if (!user || loading) return;
    setLoading(true);
    
    try {
      // Update status on server (uses /api/user/me endpoint)
      await api.patch('/user/me', { status });
      
      // Update local store (this updates both user.status and members array)
      updateMemberStatus(user.id, status);
      
      onClose();
    } catch (error) {
      console.error('Failed to update status:', error);
    } finally {
      setLoading(false);
    }
  };

  const style: React.CSSProperties = position
    ? { position: 'absolute', ...position }
    : {};

  return (
    <div
      ref={ref}
      style={style}
      className="z-50 w-64 rounded-xl border bg-popover shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
    >
      <div className="p-1">
        {STATUS_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = currentStatus === option.value;
          
          return (
            <button
              key={option.value}
              onClick={() => handleSelect(option.value)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left',
                isSelected ? 'bg-accent' : 'hover:bg-accent/50'
              )}
            >
              <div className={cn('p-1 rounded-full', option.bgColor + '/20')}>
                <Icon className={cn('h-4 w-4', option.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{option.label}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {option.description}
                </div>
              </div>
              {isSelected && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </button>
          );
        })}
      </div>

      <div className="border-t p-2">
        <button
          onClick={onClose}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1"
        >
          Press ESC to close
        </button>
      </div>
    </div>
  );
}

export default StatusPicker;
