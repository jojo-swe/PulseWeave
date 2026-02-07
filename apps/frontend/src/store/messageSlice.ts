import type { StateCreator } from 'zustand';
import type { Message, ScheduledMessage } from './types';
import type { AppState } from './index';

export interface MessageSlice {
  messages: Message[];
  setMessages: (messages: Message[]) => void;
  prependMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, content: string) => void;
  deleteMessage: (id: string) => void;
  addReaction: (messageId: string, emoji: string, userId: string, username: string) => void;
  removeReaction: (messageId: string, emoji: string, userId: string) => void;

  activeThread: Message | null;
  setActiveThread: (message: Message | null) => void;

  scheduledMessages: ScheduledMessage[];
  setScheduledMessages: (messages: ScheduledMessage[]) => void;
  addScheduledMessage: (message: ScheduledMessage) => void;
  removeScheduledMessage: (id: string) => void;
}

export const createMessageSlice: StateCreator<AppState, [], [], MessageSlice> = (set) => ({
  messages: [],
  setMessages: (messages) => set({ messages }),
  prependMessages: (messages) =>
    set((state) => {
      const existingIds = new Set(state.messages.map((m) => m.id));
      const newMessages = messages.filter((m) => !existingIds.has(m.id));
      return { messages: [...newMessages, ...state.messages] };
    }),
  addMessage: (message) =>
    set((state) => {
      const exists = state.messages.some((m) => m.id === message.id);
      if (exists) return state;
      return { messages: [...state.messages, message] };
    }),
  updateMessage: (id, content) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, content, isEdited: true } : m
      ),
    })),
  deleteMessage: (id) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== id),
    })),
  addReaction: (messageId, emoji, userId, username) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = m.reactions || [];
        const exists = reactions.some(r => r.emoji === emoji && r.user.id === userId);
        if (exists) return m;
        return {
          ...m,
          reactions: [...reactions, { emoji, user: { id: userId, username } }],
        };
      }),
    })),
  removeReaction: (messageId, emoji, userId) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== messageId) return m;
        return {
          ...m,
          reactions: (m.reactions || []).filter(
            r => !(r.emoji === emoji && r.user.id === userId)
          ),
        };
      }),
    })),

  activeThread: null,
  setActiveThread: (message) => set({ activeThread: message }),

  scheduledMessages: [],
  setScheduledMessages: (messages) => set({ scheduledMessages: messages }),
  addScheduledMessage: (message) =>
    set((state) => ({ scheduledMessages: [...state.scheduledMessages, message] })),
  removeScheduledMessage: (id) =>
    set((state) => ({
      scheduledMessages: state.scheduledMessages.filter((m) => m.id !== id),
    })),
});
