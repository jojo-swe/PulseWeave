import { useState, useEffect, useRef } from 'react';
import { Hash, Send, LogOut, Settings, Users, Plus, Loader2 } from 'lucide-react';
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
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <div className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col">
        {/* Workspace header */}
        <div className="p-4 border-b border-zinc-800">
          <h2 className="font-semibold text-white truncate">{currentWorkspace?.name}</h2>
        </div>

        {/* Channels */}
        <div className="flex-1 overflow-y-auto p-2">
          <div className="flex items-center justify-between px-2 py-1 mb-1">
            <span className="text-xs font-semibold text-zinc-500 uppercase">Channels</span>
            <button className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300">
              <Plus className="w-3 h-3" />
            </button>
          </div>
          {channels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => setCurrentChannel(channel)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
                currentChannel?.id === channel.id
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <Hash className="w-4 h-4 shrink-0" />
              <span className="truncate">{channel.name}</span>
            </button>
          ))}
        </div>

        {/* User section */}
        <div className="p-2 border-t border-zinc-800">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-zinc-800/50">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-sm font-medium">
              {user?.displayName?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.displayName}</p>
              <p className="text-xs text-zinc-500 truncate">@{user?.username}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col bg-zinc-950">
        {currentChannel ? (
          <>
            {/* Channel header */}
            <div className="h-12 px-4 border-b border-zinc-800 flex items-center gap-2">
              <Hash className="w-5 h-5 text-zinc-500" />
              <span className="font-medium text-white">{currentChannel.name}</span>
              {currentChannel.description && (
                <span className="text-sm text-zinc-500 truncate">— {currentChannel.description}</span>
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
                      <span className="font-medium text-white">{message.user.displayName}</span>
                      <span className="text-xs text-zinc-500">
                        {new Date(message.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-zinc-300 break-words">{message.content}</p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message input */}
            <form onSubmit={handleSendMessage} className="p-4 border-t border-zinc-800">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder={`Message #${currentChannel.name}`}
                  className="flex-1 px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                />
                <button
                  type="submit"
                  disabled={!messageInput.trim()}
                  className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500">
            Select a channel to start chatting
          </div>
        )}
      </div>

      {/* Members sidebar */}
      <div className="w-60 bg-zinc-900 border-l border-zinc-800 p-4 hidden lg:block">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-zinc-500" />
          <span className="text-sm font-semibold text-zinc-400">Members — {members.length}</span>
        </div>
        <div className="space-y-2">
          {members.map((member) => (
            <div key={member.id} className="flex items-center gap-2">
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xs font-medium">
                  {member.displayName?.charAt(0) || 'U'}
                </div>
                <div
                  className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-zinc-900 ${
                    member.status === 'online' ? 'bg-green-500' : 'bg-zinc-500'
                  }`}
                />
              </div>
              <span className="text-sm text-zinc-300 truncate">{member.displayName}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
