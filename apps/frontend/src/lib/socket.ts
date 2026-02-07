import { io, Socket } from 'socket.io-client';
import { useStore } from '@/store';

import { API_URL } from '@/config/env';

const SOCKET_URL = API_URL;

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(token: string): Socket {
  if (socket?.connected) {
    return socket;
  }

  // Disconnect existing socket if any
  if (socket) {
    socket.disconnect();
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  // Register status listener BEFORE connection completes
  // This ensures we don't miss the initial status event from the server
  socket.on('user:status', ({ userId, status }: { userId: string; status: string }) => {
    useStore.getState().updateMemberStatus(userId, status);
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

const TYPING_DEBOUNCE_MS = 2000;
let typingTimeout: ReturnType<typeof setTimeout> | null = null;
let lastTypingChannel: string | null = null;

export function startTyping(channelId: string): void {
  if (lastTypingChannel !== channelId) {
    // Channel changed — emit immediately
    socket?.emit('typing:start', channelId);
    lastTypingChannel = channelId;
  } else if (!typingTimeout) {
    // First keystroke or after debounce expired — emit
    socket?.emit('typing:start', channelId);
  }

  // Reset the auto-stop timer on every call
  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket?.emit('typing:stop', channelId);
    typingTimeout = null;
  }, TYPING_DEBOUNCE_MS);
}

export function stopTyping(channelId: string): void {
  if (typingTimeout) {
    clearTimeout(typingTimeout);
    typingTimeout = null;
  }
  lastTypingChannel = null;
  socket?.emit('typing:stop', channelId);
}

export function addReaction(messageId: string, emoji: string): void {
  socket?.emit('reaction:add', { messageId, emoji });
}

export function removeReaction(messageId: string, emoji: string): void {
  socket?.emit('reaction:remove', { messageId, emoji });
}
