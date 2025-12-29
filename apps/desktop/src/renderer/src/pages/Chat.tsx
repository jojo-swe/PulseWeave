import { useState, useEffect, useRef } from 'react';
import { Hash, Send, LogOut, Users, Plus, Loader2 } from 'lucide-react';
import { useStore } from '../store';
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

/**
 * Main chat page component.
 */
export function Chat(): JSX.Element {
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
    logout,
  } = useStore();

  const [messageInput, setMessageInput] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load workspace data
  useEffect(() => {
    if (!token || !currentWorkspace) return;

    const loadData = async () => {
      try {
        // Load channels
        const channelsRes = await fetch(`${serverUrl}/api/workspaces/${currentWorkspace.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const workspaceData = await channelsRes.json();
        setChannels(workspaceData.channels || []);

        // Load members
        const membersRes = await fetch(`${serverUrl}/api/workspaces/${currentWorkspace.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const membersData = await membersRes.json();
        setMembers(membersData.members?.map((m: any) => m.user) || []);

        // Select first channel
        if (workspaceData.channels?.length > 0 && !currentChannel) {
          setCurrentChannel(workspaceData.channels[0]);
        }
      } catch (error) {
        console.error('Failed to load workspace data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [token, currentWorkspace, serverUrl]);

  // Connect to socket
  useEffect(() => {
    if (!token || !currentWorkspace) return;

    socket = io(serverUrl, {
      auth: { token },
    });

    socket.on('connect', () => {
      socket?.emit('workspace:join', currentWorkspace.id);
    });

    socket.on('message:new', (message) => {
      if (message.channelId === currentChannel?.id) {
        addMessage(message);
      }
      // Show notification for messages in other channels
      if (message.channelId !== currentChannel?.id && message.userId !== user?.id) {
        window.api?.showNotification('New message', `${message.user.displayName}: ${message.content.slice(0, 50)}`);
      }
    });

    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, [token, currentWorkspace, serverUrl]);

  // Load messages when channel changes
  useEffect(() => {
    if (!token || !currentChannel) return;

    const loadMessages = async () => {
      try {
        const res = await fetch(`${serverUrl}/api/messages/channel/${currentChannel.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setMessages(data.messages || []);

        // Join channel room
        socket?.emit('channel:join', currentChannel.id);
      } catch (error) {
        console.error('Failed to load messages:', error);
      }
    };

    loadMessages();
  }, [token, currentChannel, serverUrl]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !currentChannel || !token) return;

    try {
      const res = await fetch(`${serverUrl}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          channelId: currentChannel.id,
          content: messageInput.trim(),
        }),
      });

      if (res.ok) {
        setMessageInput('');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleLogout = () => {
    logout();
    socket?.disconnect();
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <div className="w-64 bg-secondary border-r border-border flex flex-col">
        {/* Workspace header */}
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-foreground truncate">{currentWorkspace?.name}</h2>
        </div>

        {/* Channels */}
        <div className="flex-1 overflow-y-auto p-2">
          <div className="flex items-center justify-between px-2 py-1 mb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Channels</span>
            <button
              className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
              title="Create channel"
              aria-label="Create channel"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
          {channels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => setCurrentChannel(channel)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
                currentChannel?.id === channel.id
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              <Hash className="w-4 h-4 shrink-0" />
              <span className="truncate">{channel.name}</span>
            </button>
          ))}
        </div>

        {/* User section */}
        <div className="p-2 border-t border-border">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-card border border-border">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-sm font-medium">
              {user?.displayName?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{user?.displayName}</p>
              <p className="text-xs text-muted-foreground truncate">@{user?.username}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col bg-background">
        {currentChannel ? (
          <>
            {/* Channel header */}
            <div className="h-12 px-4 border-b border-border flex items-center gap-2">
              <Hash className="w-5 h-5 text-muted-foreground" />
              <span className="font-medium text-foreground">{currentChannel.name}</span>
              {currentChannel.description && (
                <span className="text-sm text-muted-foreground truncate">— {currentChannel.description}</span>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message) => (
                <div key={message.id} className="flex gap-3 group">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-sm font-medium shrink-0">
                    {message.user.displayName?.charAt(0) || 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium text-foreground">{message.user.displayName}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(message.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-foreground break-words opacity-90">{message.content}</p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message input */}
            <form onSubmit={handleSendMessage} className="p-4 border-t border-border">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder={`Message #${currentChannel.name}`}
                  className="flex-1 px-4 py-2.5 bg-secondary border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                />
                <button
                  type="submit"
                  disabled={!messageInput.trim()}
                  className="px-4 py-2.5 bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-opacity hover:opacity-90"
                  title="Send message"
                  aria-label="Send message"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Select a channel to start chatting
          </div>
        )}
      </div>

      {/* Members sidebar */}
      <div className="w-60 bg-secondary border-l border-border p-4 hidden lg:block">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-muted-foreground">Members — {members.length}</span>
        </div>
        <div className="space-y-2">
          {members.map((member) => (
            <div key={member.id} className="flex items-center gap-2">
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xs font-medium">
                  {member.displayName?.charAt(0) || 'U'}
                </div>
                <div
                  className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-secondary ${
                    member.status === 'online' ? 'bg-green-500' : 'bg-muted-foreground'
                  }`}
                />
              </div>
              <span className="text-sm text-foreground truncate">{member.displayName}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
