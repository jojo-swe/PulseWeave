'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useStore } from '@/store';
import { useTheme } from '@/components/theme-provider';
import { cn, getInitials, generateAvatarColor } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Search,
  Hash,
  Lock,
  MessageSquare,
  Settings,
  User,
  LogOut,
  Moon,
  Sun,
  Bell,
  Plus,
  Star,
  Pin,
  Keyboard,
  HelpCircle,
  Zap,
} from 'lucide-react';

interface CommandItem {
  id: string;
  title: string;
  description?: string;
  icon: React.ReactNode;
  category: 'channels' | 'members' | 'actions' | 'navigation';
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  onClose: () => void;
  onNavigateToChannel?: (channelId: string) => void;
  onStartDM?: (userId: string) => void;
  onOpenSettings?: () => void;
  onOpenProfile?: () => void;
  onOpenShortcuts?: () => void;
  onCreateChannel?: () => void;
  onToggleTheme?: () => void;
  onLogout?: () => void;
}

/**
 * Command palette for quick navigation and actions.
 * Opens with Ctrl+K or Cmd+K.
 */
export function CommandPalette({
  onClose,
  onNavigateToChannel,
  onStartDM,
  onOpenSettings,
  onOpenProfile,
  onOpenShortcuts,
  onCreateChannel,
  onToggleTheme,
  onLogout,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  
  const { channels, members, setCurrentChannel, starredChannels, toggleStarChannel } = useStore();
  const { theme, setTheme, resolvedTheme } = useTheme();

  // Build command items
  const allItems = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [];

    // Channel items
    channels.forEach((channel) => {
      items.push({
        id: `channel-${channel.id}`,
        title: channel.name,
        description: channel.description || (channel.isPrivate ? 'Private channel' : 'Public channel'),
        icon: channel.isPrivate ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />,
        category: 'channels',
        action: () => {
          setCurrentChannel(channel);
          onClose();
        },
        keywords: ['channel', channel.name],
      });
    });

    // Member items (for DMs)
    members.forEach((member) => {
      items.push({
        id: `member-${member.user.id}`,
        title: member.user.displayName,
        description: `@${member.user.username}`,
        icon: (
          <Avatar className="h-5 w-5">
            <AvatarImage src={member.user.avatarUrl} />
            <AvatarFallback className={cn('text-[10px]', generateAvatarColor(member.user.displayName))}>
              {getInitials(member.user.displayName)}
            </AvatarFallback>
          </Avatar>
        ),
        category: 'members',
        action: () => {
          onStartDM?.(member.user.id);
          onClose();
        },
        keywords: ['member', 'dm', 'message', member.user.username, member.user.displayName],
      });
    });

    // Action items
    const actions: CommandItem[] = [
      {
        id: 'action-create-channel',
        title: 'Create Channel',
        description: 'Create a new channel',
        icon: <Plus className="h-4 w-4" />,
        category: 'actions',
        action: () => {
          onCreateChannel?.();
          onClose();
        },
        keywords: ['create', 'new', 'channel', 'add'],
      },
      {
        id: 'action-profile',
        title: 'Edit Profile',
        description: 'Update your profile and status',
        icon: <User className="h-4 w-4" />,
        category: 'actions',
        action: () => {
          onOpenProfile?.();
          onClose();
        },
        keywords: ['profile', 'edit', 'avatar', 'status'],
      },
      {
        id: 'action-settings',
        title: 'Settings',
        description: 'Open workspace settings',
        icon: <Settings className="h-4 w-4" />,
        category: 'actions',
        action: () => {
          onOpenSettings?.();
          onClose();
        },
        keywords: ['settings', 'preferences', 'config'],
      },
      {
        id: 'action-shortcuts',
        title: 'Keyboard Shortcuts',
        description: 'View all keyboard shortcuts',
        icon: <Keyboard className="h-4 w-4" />,
        category: 'actions',
        action: () => {
          onOpenShortcuts?.();
          onClose();
        },
        keywords: ['keyboard', 'shortcuts', 'hotkeys', 'keys'],
      },
      {
        id: 'action-theme',
        title: resolvedTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode',
        description: `Currently using ${resolvedTheme} mode`,
        icon: resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />,
        category: 'actions',
        action: () => {
          setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
          onClose();
        },
        keywords: ['theme', 'dark', 'light', 'mode', 'toggle'],
      },
      {
        id: 'action-logout',
        title: 'Log Out',
        description: 'Sign out of your account',
        icon: <LogOut className="h-4 w-4" />,
        category: 'actions',
        action: () => {
          onLogout?.();
          onClose();
        },
        keywords: ['logout', 'signout', 'exit'],
      },
    ];

    return [...items, ...actions];
  }, [channels, members, setCurrentChannel, onClose, onStartDM, onCreateChannel, onOpenProfile, onOpenSettings, onOpenShortcuts, onLogout, resolvedTheme, setTheme]);

  // Filter items based on query
  const filteredItems = useMemo(() => {
    if (!query.trim()) return allItems;
    
    const searchTerms = query.toLowerCase().split(' ');
    return allItems.filter((item) => {
      const searchText = [
        item.title,
        item.description,
        ...(item.keywords || []),
      ].join(' ').toLowerCase();
      
      return searchTerms.every((term) => searchText.includes(term));
    });
  }, [allItems, query]);

  // Group items by category
  const groupedItems = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {
      channels: [],
      members: [],
      actions: [],
    };
    
    filteredItems.forEach((item) => {
      groups[item.category].push(item);
    });
    
    return groups;
  }, [filteredItems]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = filteredItems[selectedIndex];
        if (item) item.action();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [filteredItems, selectedIndex, onClose]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    const selectedElement = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    selectedElement?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'channels': return 'Channels';
      case 'members': return 'Team Members';
      case 'actions': return 'Actions';
      default: return category;
    }
  };

  let itemIndex = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Palette */}
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl border bg-popover shadow-2xl">
        {/* Search Input */}
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <Search className="h-5 w-5 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search channels, people, or type a command..."
            className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-flex px-2 py-1 text-xs font-medium bg-muted rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <HelpCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No results found</p>
              <p className="text-sm mt-1">Try a different search term</p>
            </div>
          ) : (
            Object.entries(groupedItems).map(([category, items]) => {
              if (items.length === 0) return null;
              
              return (
                <div key={category} className="mb-2">
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {getCategoryLabel(category)}
                  </div>
                  {items.map((item) => {
                    itemIndex++;
                    const isSelected = itemIndex === selectedIndex;
                    const currentIndex = itemIndex;
                    
                    return (
                      <button
                        key={item.id}
                        data-index={currentIndex}
                        onClick={item.action}
                        onMouseEnter={() => setSelectedIndex(currentIndex)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                          isSelected ? 'bg-accent' : 'hover:bg-accent/50'
                        )}
                      >
                        <div className="flex-shrink-0 text-muted-foreground">
                          {item.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{item.title}</div>
                          {item.description && (
                            <div className="text-sm text-muted-foreground truncate">
                              {item.description}
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] font-medium bg-muted rounded">
                            ↵
                          </kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-2 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-muted rounded">↓</kbd>
              <span>navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded">↵</kbd>
              <span>select</span>
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            <span>PulseWeave</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
