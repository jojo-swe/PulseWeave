import { useState, useEffect, useRef, useCallback } from 'react';
import { Hash, Send, LogOut, Users, Plus, Loader2, ArrowLeftRight, Lock, MessageSquare, PanelRightClose, PanelRightOpen, AlertCircle } from 'lucide-react';
import { useStore } from '../store';
import { io, Socket } from 'socket.io-client';
import type { ConnectionStatus } from '../App';

let socket: Socket | null = null;

interface ChatProps {
  connectionStatus: ConnectionStatus;
  onConnectionChange: (status: ConnectionStatus) => void;
}

/** Format a date as a human-readable day separator. */
function formatDateSeparator(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - msgDay.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

/** Avatar component: loads actual image or falls back to initials. */
function Avatar({ url, name, size = 'md' }: { url?: string; name: string; size?: 'sm' | 'md' }) {
  const px = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  if (url) {
    return <img src={url} alt={name} className={`${px} rounded-full object-cover shrink-0`} />;
  }
  return (
    <div className={`${px} rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-medium shrink-0`}>
      {name?.charAt(0)?.toUpperCase() || 'U'}
    </div>
  );
}

/**
 * Main chat page component.
 */
export function Chat({ onConnectionChange }: ChatProps): JSX.Element {
  const {
    serverUrl,
    token,
    user,
    currentWorkspace,
    channels,
    currentChannel,
    messages,
    members,
    setChannels,
    setCurrentChannel,
    setMessages,
    addMessage,
    setMembers,
    setCurrentWorkspace,
    logout,
  } = useStore();

  const [messageInput, setMessageInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [unreadChannels, setUnreadChannels] = useState<Set<string>>(new Set());
  const [showMembers, setShowMembers] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentChannelRef = useRef(currentChannel);
  const channelsRef = useRef(channels);
  const badgeCountRef = useRef(0);

  // Keep refs in sync for socket callbacks
  useEffect(() => { currentChannelRef.current = currentChannel; }, [currentChannel]);
  useEffect(() => { channelsRef.current = channels; }, [channels]);

  // Load workspace data (single API call instead of duplicate)
  useEffect(() => {
    if (!token || !currentWorkspace) return;
    setLoading(true);
    setError('');

    const loadData = async () => {
      try {
        const res = await fetch(`${serverUrl}/api/workspaces/${currentWorkspace.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to load workspace');
        const data = await res.json();

        setChannels(data.channels || []);
        setMembers(data.members?.map((m: any) => m.user) || []);

        if (data.channels?.length > 0 && !currentChannel) {
          setCurrentChannel(data.channels[0]);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load workspace data');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [token, currentWorkspace?.id, serverUrl]);

  // Socket connection with reconnection handling
  useEffect(() => {
    if (!token || !currentWorkspace) return;

    onConnectionChange('connecting');

    socket = io(serverUrl, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socket.on('connect', () => {
      onConnectionChange('connected');
      socket?.emit('workspace:join', currentWorkspace.id);
      // Rejoin current channel on reconnect
      if (currentChannelRef.current) {
        socket?.emit('channel:join', currentChannelRef.current.id);
      }
    });

    socket.on('disconnect', () => {
      onConnectionChange('disconnected');
    });

    socket.io.on('reconnect_attempt', () => {
      onConnectionChange('connecting');
    });

    socket.on('message:new', (message) => {
      if (message.channelId === currentChannelRef.current?.id) {
        addMessage(message);
      } else {
        // Mark channel as unread + native notification
        setUnreadChannels((prev) => new Set(prev).add(message.channelId));
        if (message.userId !== user?.id) {
          window.api?.showNotification(
            `#${channelsRef.current.find((c) => c.id === message.channelId)?.name || 'channel'}`,
            `${message.user.displayName}: ${message.content.slice(0, 80)}`
          );
          badgeCountRef.current += 1;
          window.api?.setBadgeCount(badgeCountRef.current);
        }
      }
    });

    socket.on('user:typing', ({ userId, username }: { userId: string; username: string }) => {
      if (userId !== user?.id) {
        setTypingUsers((prev) => (prev.includes(username) ? prev : [...prev, username]));
        // Clear after 3s
        setTimeout(() => {
          setTypingUsers((prev) => prev.filter((u) => u !== username));
        }, 3000);
      }
    });

    return () => {
      socket?.disconnect();
      socket = null;
      onConnectionChange('disconnected');
    };
  }, [token, currentWorkspace?.id, serverUrl]);

  // Load messages when channel changes
  useEffect(() => {
    if (!token || !currentChannel) return;

    const loadMessages = async () => {
      try {
        const res = await fetch(`${serverUrl}/api/messages/channel/${currentChannel.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to load messages');
        const data = await res.json();
        setMessages(data.messages || []);
        socket?.emit('channel:join', currentChannel.id);
      } catch (err) {
        console.error('Failed to load messages:', err);
      }
    };

    // Clear unread badge for this channel
    setUnreadChannels((prev) => {
      const next = new Set(prev);
      next.delete(currentChannel.id);
      if (next.size === 0) {
        badgeCountRef.current = 0;
        window.api?.setBadgeCount(0);
      }
      return next;
    });
    setTypingUsers([]);
    loadMessages();
  }, [token, currentChannel?.id, serverUrl]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K / Cmd+K — focus message input
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      // Escape — blur input
      if (e.key === 'Escape') {
        (document.activeElement as HTMLElement)?.blur();
      }
      // Alt+Up / Alt+Down — navigate channels
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        if (channels.length === 0) return;
        const idx = channels.findIndex((c) => c.id === currentChannel?.id);
        const next = e.key === 'ArrowDown'
          ? (idx + 1) % channels.length
          : (idx - 1 + channels.length) % channels.length;
        setCurrentChannel(channels[next]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [channels, currentChannel]);

  const emitTyping = useCallback(() => {
    if (!currentChannel || !socket) return;
    socket.emit('typing:start', { channelId: currentChannel.id });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket?.emit('typing:stop', { channelId: currentChannel.id });
    }, 2000);
  }, [currentChannel]);

  const handleSendMessage = async () => {
    const content = messageInput.trim();
    if (!content || !currentChannel || !token) return;

    setMessageInput('');
    try {
      const res = await fetch(`${serverUrl}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ channelId: currentChannel.id, content }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send');
      }
    } catch (err: any) {
      // Put message back on failure
      setMessageInput(content);
      console.error('Failed to send message:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleLogout = () => {
    socket?.disconnect();
    logout();
  };

  const handleSwitchWorkspace = () => {
    socket?.disconnect();
    setCurrentWorkspace(null);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center max-w-sm">
          <AlertCircle className="w-10 h-10 text-red-400" />
          <p className="text-foreground font-medium">Failed to load workspace</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={handleSwitchWorkspace}
            className="mt-2 px-4 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-accent transition-colors"
          >
            Switch workspace
          </button>
        </div>
      </div>
    );
  }

  // Group messages by date for separators
  let lastDate = '';

  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <div className="w-64 bg-secondary border-r border-border flex flex-col shrink-0">
        {/* Workspace header */}
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-foreground truncate text-sm">{currentWorkspace?.name}</h2>
          <button
            onClick={handleSwitchWorkspace}
            className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Switch workspace"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Channels */}
        <div className="flex-1 overflow-y-auto p-2">
          <div className="flex items-center justify-between px-2 py-1 mb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Channels</span>
            <button
              className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
              title="Create channel"
              aria-label="Create channel"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
          {channels.length === 0 && (
            <p className="px-2 py-4 text-xs text-muted-foreground text-center">No channels yet</p>
          )}
          {channels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => setCurrentChannel(channel)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
                currentChannel?.id === channel.id
                  ? 'bg-accent text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              {channel.isPrivate ? (
                <Lock className="w-4 h-4 shrink-0" />
              ) : (
                <Hash className="w-4 h-4 shrink-0" />
              )}
              <span className="truncate flex-1 text-left">{channel.name}</span>
              {unreadChannels.has(channel.id) && (
                <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
              )}
            </button>
          ))}
        </div>

        {/* User section */}
        <div className="p-2 border-t border-border">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-card border border-border">
            <Avatar url={user?.avatarUrl} name={user?.displayName || 'U'} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{user?.displayName}</p>
              <p className="text-xs text-muted-foreground truncate">@{user?.username}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col bg-background min-w-0">
        {currentChannel ? (
          <>
            {/* Channel header */}
            <div className="h-12 px-4 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                {currentChannel.isPrivate ? (
                  <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                ) : (
                  <Hash className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <span className="font-medium text-foreground">{currentChannel.name}</span>
                {currentChannel.description && (
                  <span className="text-sm text-muted-foreground truncate hidden md:inline">— {currentChannel.description}</span>
                )}
              </div>
              <button
                onClick={() => setShowMembers(!showMembers)}
                className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                title={showMembers ? 'Hide members' : 'Show members'}
              >
                {showMembers ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <MessageSquare className="w-12 h-12 text-muted-foreground/30 mb-3" />
                  <p className="text-foreground font-medium">No messages yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Be the first to say something in #{currentChannel.name}</p>
                </div>
              )}
              {messages.map((message) => {
                const msgDate = new Date(message.createdAt).toDateString();
                let showDateSep = false;
                if (msgDate !== lastDate) {
                  showDateSep = true;
                  lastDate = msgDate;
                }
                return (
                  <div key={message.id}>
                    {showDateSep && (
                      <div className="flex items-center gap-3 my-4">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-xs text-muted-foreground font-medium px-2">
                          {formatDateSeparator(message.createdAt)}
                        </span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                    )}
                    <div className="flex gap-3 py-1 group hover:bg-accent/30 rounded px-2 -mx-2 transition-colors">
                      <Avatar url={message.user.avatarUrl} name={message.user.displayName || 'U'} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-medium text-foreground text-sm">{message.user.displayName}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-foreground/90 break-words text-sm whitespace-pre-wrap">{message.content}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Typing indicator */}
            {typingUsers.length > 0 && (
              <div className="px-4 pb-1 text-xs text-muted-foreground animate-fade-in">
                <span className="font-medium">{typingUsers.join(', ')}</span>
                {typingUsers.length === 1 ? ' is' : ' are'} typing…
              </div>
            )}

            {/* Message input (multi-line textarea with Shift+Enter) */}
            <div className="p-3 border-t border-border">
              <div className="flex gap-2 items-end">
                <textarea
                  ref={inputRef}
                  value={messageInput}
                  onChange={(e) => { setMessageInput(e.target.value); emitTyping(); }}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message #${currentChannel.name}`}
                  rows={1}
                  className="flex-1 px-4 py-2.5 bg-secondary border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-none text-sm leading-relaxed max-h-32 overflow-y-auto"
                  style={{ minHeight: '42px' }}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim()}
                  className="px-3 py-2.5 bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-opacity hover:opacity-90 shrink-0"
                  title="Send message"
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-1 px-1">
                <kbd className="font-mono">Enter</kbd> to send · <kbd className="font-mono">Shift+Enter</kbd> for new line
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <Hash className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <p className="text-foreground font-medium">Select a channel</p>
            <p className="text-sm text-muted-foreground mt-1">Choose a channel from the sidebar to start chatting</p>
          </div>
        )}
      </div>

      {/* Members sidebar (toggleable) */}
      {showMembers && currentChannel && (
        <div className="w-56 bg-secondary border-l border-border p-3 shrink-0 overflow-y-auto">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Members — {members.length}
            </span>
          </div>
          <div className="space-y-1">
            {/* Online first */}
            {[...members]
              .sort((a, b) => (a.status === 'online' ? -1 : 1) - (b.status === 'online' ? -1 : 1))
              .map((member) => (
                <div key={member.id} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-accent/50 transition-colors">
                  <div className="relative">
                    <Avatar url={member.avatarUrl} name={member.displayName || 'U'} size="sm" />
                    <div
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-secondary ${
                        member.status === 'online' ? 'bg-green-500' : 'bg-zinc-500'
                      }`}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">{member.displayName}</p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
