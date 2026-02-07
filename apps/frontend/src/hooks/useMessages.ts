'use client';

import { useEffect, useCallback } from 'react';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { joinChannel, getSocket, startTyping } from '@/lib/socket';
import { handleAuthError } from './useAuthCheck';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function useChannelMessages(): void {
  const { user, currentChannel, token, setMessages } = useStore();

  useEffect(() => {
    if (!user || !currentChannel) return;

    const loadMessages = async () => {
      try {
        const { messages } = await api.messages.list(currentChannel.id, token || '');
        setMessages(messages);
        joinChannel(currentChannel.id);
        useStore.getState().clearUnread(currentChannel.id);
      } catch (error) {
        if (handleAuthError(error)) return;
        console.error('Failed to load messages:', error);
      }
    };

    loadMessages();
  }, [currentChannel, user, setMessages, token]);
}

export function useDmMessages(): void {
  const { user, currentConversation, token, setDirectMessages } = useStore();

  useEffect(() => {
    if (!user || !currentConversation) return;

    const loadDmMessages = async () => {
      try {
        const { messages } = await api.dm.getMessages(currentConversation.id, token || '');
        setDirectMessages(messages);
        const socket = getSocket();
        if (socket) {
          socket.emit('dm:join', currentConversation.id);
        }
        useStore.getState().clearDmUnread(currentConversation.id);
      } catch (error) {
        if (handleAuthError(error)) return;
        console.error('Failed to load DM messages:', error);
      }
    };

    loadDmMessages();
  }, [currentConversation, user, setDirectMessages, token]);
}

interface MessageActions {
  handleSendMessage: (content: string) => Promise<void>;
  handleStartDM: (userId: string) => Promise<void>;
  handleTyping: () => void;
  handleReaction: (messageId: string, emoji: string) => Promise<void>;
  handleEditMessage: (messageId: string, content: string) => Promise<void>;
  handleDeleteMessage: (messageId: string) => Promise<void>;
  handleSendReply: (content: string, parentId: string) => Promise<void>;
}

export function useMessageActions(): MessageActions {
  const {
    token,
    user,
    currentChannel,
    currentWorkspace,
    currentConversation,
    addMessage,
    addDirectMessage,
    addConversation,
    setCurrentConversation,
  } = useStore();

  const handleSendMessage = useCallback(async (content: string) => {
    if (currentConversation) {
      if (!token) return;
      try {
        const message = await api.dm.sendMessage(currentConversation.id, content, token);
        addDirectMessage(message);
      } catch (error) {
        console.error('Failed to send DM:', error);
      }
      return;
    }

    if (!token || !currentChannel) return;
    try {
      const message = await api.messages.create(
        { channelId: currentChannel.id, content },
        token
      );
      addMessage(message);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }, [token, currentChannel, currentConversation, addMessage, addDirectMessage]);

  const handleStartDM = useCallback(async (userId: string) => {
    if (!token || !currentWorkspace) return;
    try {
      const conversation = await api.dm.start(currentWorkspace.id, userId, token);
      addConversation(conversation);
      setCurrentConversation(conversation);
    } catch (error) {
      console.error('Failed to start DM:', error);
    }
  }, [token, currentWorkspace, addConversation, setCurrentConversation]);

  const handleTyping = useCallback(() => {
    if (currentChannel) {
      startTyping(currentChannel.id);
    }
  }, [currentChannel]);

  const handleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!token || !user) return;
    useStore.getState().addReaction(messageId, emoji, user.id, user.username);
    try {
      await api.messages.addReaction(messageId, emoji, token);
    } catch (error) {
      console.error('Failed to add reaction:', error);
      useStore.getState().removeReaction(messageId, emoji, user.id);
    }
  }, [token, user]);

  const handleEditMessage = useCallback(async (messageId: string, content: string) => {
    if (!token) return;
    try {
      await api.messages.update(messageId, content, token);
      useStore.getState().updateMessage(messageId, content);
    } catch (error) {
      console.error('Failed to edit message:', error);
    }
  }, [token]);

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    if (!token) return;
    try {
      await api.messages.delete(messageId, token);
      useStore.getState().deleteMessage(messageId);
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  }, [token]);

  const handleSendReply = useCallback(async (content: string, parentId: string) => {
    if (!token || !currentChannel) return;
    try {
      const message = await api.messages.create(
        { channelId: currentChannel.id, content, parentId },
        token
      );
      addMessage(message);
    } catch (error) {
      console.error('Failed to send reply:', error);
    }
  }, [token, currentChannel, addMessage]);

  return {
    handleSendMessage,
    handleStartDM,
    handleTyping,
    handleReaction,
    handleEditMessage,
    handleDeleteMessage,
    handleSendReply,
  };
}
