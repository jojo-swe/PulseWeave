'use client';

import { useEffect } from 'react';
import { useStore } from '@/store';
import { connectSocket, joinWorkspace } from '@/lib/socket';
import { requestNotificationPermission, notifyNewMessage, playNotificationSound } from '@/lib/notifications';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function useSocketEvents(): void {
  const {
    token,
    user,
    currentWorkspace,
    addMessage,
    addDirectMessage,
    setUserTyping,
    clearUserTyping,
  } = useStore();

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    if (!user || !currentWorkspace || !token) return;

    const socket = connectSocket(token);
    joinWorkspace(currentWorkspace.id);

    const handleNewMessage = (message: any) => {
      addMessage(message);
      const state = useStore.getState();
      if (message.userId !== state.user?.id) {
        if (message.channelId !== state.currentChannel?.id) {
          state.incrementUnread(message.channelId);
        }
        const channel = state.channels.find((c: any) => c.id === message.channelId);
        if (channel) {
          playNotificationSound();
          notifyNewMessage(message.user.displayName, channel.name, message.content);
        }
      }
    };

    const handleDmMessage = (message: any) => {
      const state = useStore.getState();
      if (state.currentConversation?.id === message.conversationId) {
        addDirectMessage(message);
      }
      if (message.userId !== state.user?.id) {
        if (message.conversationId !== state.currentConversation?.id) {
          state.incrementDmUnread(message.conversationId);
        }
        playNotificationSound();
        notifyNewMessage(message.user.displayName, 'Direct Message', message.content);
      }
    };

    const handleTyping = ({ channelId, userId, username }: any) => {
      setUserTyping(channelId, userId, username);
    };

    const handleTypingStop = ({ channelId, userId }: any) => {
      clearUserTyping(channelId, userId);
    };

    socket.on('message:new', handleNewMessage);
    socket.on('dm:message', handleDmMessage);
    socket.on('user:typing', handleTyping);
    socket.on('user:typing:stop', handleTypingStop);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('dm:message', handleDmMessage);
      socket.off('user:typing', handleTyping);
      socket.off('user:typing:stop', handleTypingStop);
    };
  }, [user, currentWorkspace, token, addMessage, addDirectMessage, setUserTyping, clearUserTyping]);
}
