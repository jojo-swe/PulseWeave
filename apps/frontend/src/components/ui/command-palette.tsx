'use client';

import * as React from 'react';
import { useEffect, useState, useCallback } from 'react';
import { Search, Hash, User, Settings, LogOut, MessageSquare, Plus } from 'lucide-react';
import { useStore } from '@/store';
import { cn } from '@/lib/utils';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  action: () => void;
  keywords?: string[];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const { channels, members, setCurrentChannel, logout } = useStore();

  const commands: CommandItem[] = React.useMemo(() => {
    const items: CommandItem[] = [];

    // Channel commands
    channels.forEach((channel) => {
      items.push({
        id: `channel-${channel.id}`,
        label: `#${channel.name}`,
        description: channel.description || 'Go to channel',
        icon: <Hash className="h-4 w-4" />,
        action: () => {
          setCurrentChannel(channel);
          setOpen(false);
        },
        keywords: ['channel', channel.name],
      });
    });

    // Member commands (DMs)
    members.forEach((member) => {
      items.push({
        id: `dm-${member.user.id}`,
        label: member.user.displayName,
        description: `Message ${member.user.username}`,
        icon: <User className="h-4 w-4" />,
        action: () => {
          // TODO: Open DM
          setOpen(false);
        },
        keywords: ['dm', 'message', member.user.username, member.user.displayName],
      });
    });

    // Action commands
    items.push({
      id: 'new-channel',
      label: 'Create new channel',
      description: 'Start a new conversation',
      icon: <Plus className="h-4 w-4" />,
      action: () => {
        // TODO: Open create channel modal
        setOpen(false);
      },
      keywords: ['new', 'create', 'channel'],
    });

    items.push({
      id: 'settings',
      label: 'Settings',
      description: 'Manage your preferences',
      icon: <Settings className="h-4 w-4" />,
      action: () => {
        // TODO: Open settings
        setOpen(false);
      },
      keywords: ['settings', 'preferences', 'config'],
    });

    items.push({
      id: 'logout',
      label: 'Sign out',
      description: 'Log out of PulseWeave',
      icon: <LogOut className="h-4 w-4" />,
      action: () => {
        logout();
        setOpen(false);
      },
      keywords: ['logout', 'signout', 'exit'],
    });

    return items;
  }, [channels, members, setCurrentChannel, logout]);

  const filteredCommands = React.useMemo(() => {
    if (!search) return commands;
    const query = search.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(query) ||
        cmd.description?.toLowerCase().includes(query) ||
        cmd.keywords?.some((k) => k.toLowerCase().includes(query))
    );
  }, [commands, search]);

  // Keyboard shortcut to open
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Handle navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        filteredCommands[selectedIndex]?.action();
      }
    },
    [filteredCommands, selectedIndex]
  );

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  // Reset when opened
  useEffect(() => {
    if (open) {
      setSearch('');
      setSelectedIndex(0);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
        {/* Search input */}
        <div className="flex items-center border-b border-gray-700 px-4">
          <Search className="h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search channels, people, or commands..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent px-3 py-4 text-sm text-white placeholder-gray-400 outline-none"
            autoFocus
          />
          <kbd className="hidden rounded bg-gray-700 px-2 py-1 text-xs text-gray-400 sm:inline-block">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto p-2">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No results found
            </div>
          ) : (
            filteredCommands.map((cmd, index) => (
              <button
                key={cmd.id}
                onClick={cmd.action}
                onMouseEnter={() => setSelectedIndex(index)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                  index === selectedIndex
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800'
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-md',
                    index === selectedIndex ? 'bg-purple-500' : 'bg-gray-700'
                  )}
                >
                  {cmd.icon}
                </span>
                <div className="flex-1 overflow-hidden">
                  <div className="truncate font-medium">{cmd.label}</div>
                  {cmd.description && (
                    <div
                      className={cn(
                        'truncate text-xs',
                        index === selectedIndex ? 'text-purple-200' : 'text-gray-500'
                      )}
                    >
                      {cmd.description}
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-700 px-4 py-2 text-xs text-gray-500">
          <div className="flex gap-2">
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-gray-700 px-1.5 py-0.5">↑</kbd>
              <kbd className="rounded bg-gray-700 px-1.5 py-0.5">↓</kbd>
              to navigate
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-gray-700 px-1.5 py-0.5">↵</kbd>
            to select
          </span>
        </div>
      </div>
    </div>
  );
}
