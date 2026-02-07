import type { StateCreator } from 'zustand';
import type { Conversation, DirectMessage } from './types';
import type { AppState } from './index';

export interface DmSlice {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  directMessages: DirectMessage[];
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  setCurrentConversation: (conversation: Conversation | null) => void;
  setDirectMessages: (messages: DirectMessage[]) => void;
  addDirectMessage: (message: DirectMessage) => void;
  dmUnreadCounts: Record<string, number>;
  incrementDmUnread: (conversationId: string) => void;
  clearDmUnread: (conversationId: string) => void;
}

export const createDmSlice: StateCreator<AppState, [], [], DmSlice> = (set) => ({
  conversations: [],
  currentConversation: null,
  directMessages: [],
  setConversations: (conversations) => set({ conversations }),
  addConversation: (conversation) =>
    set((state) => {
      const exists = state.conversations.some((c) => c.id === conversation.id);
      if (exists) return state;
      return { conversations: [conversation, ...state.conversations] };
    }),
  setCurrentConversation: (conversation) =>
    set({ currentConversation: conversation, currentChannel: null, directMessages: [] }),
  setDirectMessages: (messages) => set({ directMessages: messages }),
  addDirectMessage: (message) =>
    set((state) => {
      const exists = state.directMessages.some((m) => m.id === message.id);
      if (exists) return state;
      return { directMessages: [...state.directMessages, message] };
    }),
  dmUnreadCounts: {},
  incrementDmUnread: (conversationId) =>
    set((state) => ({
      dmUnreadCounts: {
        ...state.dmUnreadCounts,
        [conversationId]: (state.dmUnreadCounts[conversationId] || 0) + 1,
      },
    })),
  clearDmUnread: (conversationId) =>
    set((state) => {
      const { [conversationId]: _, ...rest } = state.dmUnreadCounts;
      return { dmUnreadCounts: rest };
    }),
});
