import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(token: string): Socket {
  if (socket?.connected) {
    return socket;
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('Socket connected');
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected');
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function joinWorkspace(workspaceId: string): void {
  socket?.emit('workspace:join', workspaceId);
}

export function joinChannel(channelId: string): void {
  socket?.emit('channel:join', channelId);
}

export function leaveChannel(channelId: string): void {
  socket?.emit('channel:leave', channelId);
}

export function joinDM(conversationId: string): void {
  socket?.emit('dm:join', conversationId);
}

export function leaveDM(conversationId: string): void {
  socket?.emit('dm:leave', conversationId);
}

export function sendMessage(channelId: string, content: string, parentId?: string): void {
  socket?.emit('message:send', { channelId, content, parentId });
}

export function startTyping(channelId: string): void {
  socket?.emit('typing:start', channelId);
}

export function stopTyping(channelId: string): void {
  socket?.emit('typing:stop', channelId);
}

export function addReaction(messageId: string, emoji: string): void {
  socket?.emit('reaction:add', { messageId, emoji });
}

export function removeReaction(messageId: string, emoji: string): void {
  socket?.emit('reaction:remove', { messageId, emoji });
}
