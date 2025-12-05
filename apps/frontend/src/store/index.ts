import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  status: string;
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
  iconUrl?: string;
}

interface Channel {
  id: string;
  name: string;
  description?: string;
  isPrivate: boolean;
}

interface Message {
  id: string;
  content: string;
  channelId: string;
  userId: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
  parentId?: string;
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { replies: number };
  reactions?: Array<{
    emoji: string;
    user: { id: string; username: string };
  }>;
}

interface AppState {
  // Auth
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  setUser: (user: User) => void;
  logout: () => void;

  // Workspace
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  setCurrentWorkspace: (workspace: Workspace) => void;
  setWorkspaces: (workspaces: Workspace[]) => void;

  // Channels
  currentChannel: Channel | null;
  channels: Channel[];
  setCurrentChannel: (channel: Channel | null) => void;
  setChannels: (channels: Channel[]) => void;
  addChannel: (channel: Channel) => void;

  // Messages
  messages: Message[];
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, content: string) => void;
  deleteMessage: (id: string) => void;
  addReaction: (messageId: string, emoji: string, userId: string, username: string) => void;
  removeReaction: (messageId: string, emoji: string, userId: string) => void;

  // Members
  members: Array<{ user: User; role: string }>;
  setMembers: (members: Array<{ user: User; role: string }>) => void;
  updateMemberStatus: (userId: string, status: string) => void;

  // Typing
  typingUsers: Map<string, { username: string; timeout: NodeJS.Timeout }>;
  setUserTyping: (channelId: string, userId: string, username: string) => void;
  clearUserTyping: (channelId: string, userId: string) => void;

  // UI
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  useVirtualizedList: boolean;
  toggleVirtualizedList: () => void;

  // Unread
  unreadCounts: Record<string, number>;
  incrementUnread: (channelId: string) => void;
  clearUnread: (channelId: string) => void;
  setUnreadCounts: (counts: Record<string, number>) => void;

  // Thread
  activeThread: Message | null;
  setActiveThread: (message: Message | null) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Auth
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null, currentWorkspace: null, currentChannel: null }),

      // Workspace
      currentWorkspace: null,
      workspaces: [],
      setCurrentWorkspace: (workspace) => set({ currentWorkspace: workspace }),
      setWorkspaces: (workspaces) => set({ workspaces }),

      // Channels
      currentChannel: null,
      channels: [],
      setCurrentChannel: (channel) => set({ currentChannel: channel, messages: [] }),
      setChannels: (channels) => set({ channels }),
      addChannel: (channel) => set((state) => ({ channels: [...state.channels, channel] })),

      // Messages
      messages: [],
      setMessages: (messages) => set({ messages }),
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
            // Check if user already reacted with this emoji
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

      // Members
      members: [],
      setMembers: (members) => set({ members }),
      updateMemberStatus: (userId, status) =>
        set((state) => ({
          members: state.members.map((m) =>
            m.user.id === userId ? { ...m, user: { ...m.user, status } } : m
          ),
        })),

      // Typing
      typingUsers: new Map(),
      setUserTyping: (channelId, userId, username) => {
        const state = get();
        const key = `${channelId}:${userId}`;
        const existing = state.typingUsers.get(key);
        if (existing) {
          clearTimeout(existing.timeout);
        }
        const timeout = setTimeout(() => {
          get().clearUserTyping(channelId, userId);
        }, 3000);
        const newMap = new Map(state.typingUsers);
        newMap.set(key, { username, timeout });
        set({ typingUsers: newMap });
      },
      clearUserTyping: (channelId, userId) => {
        const state = get();
        const key = `${channelId}:${userId}`;
        const newMap = new Map(state.typingUsers);
        const existing = newMap.get(key);
        if (existing) {
          clearTimeout(existing.timeout);
          newMap.delete(key);
          set({ typingUsers: newMap });
        }
      },

      // UI
      sidebarOpen: true,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      useVirtualizedList: false,
      toggleVirtualizedList: () => set((state) => ({ useVirtualizedList: !state.useVirtualizedList })),

      // Unread
      unreadCounts: {},
      incrementUnread: (channelId) =>
        set((state) => ({
          unreadCounts: {
            ...state.unreadCounts,
            [channelId]: (state.unreadCounts[channelId] || 0) + 1,
          },
        })),
      clearUnread: (channelId) =>
        set((state) => {
          const { [channelId]: _, ...rest } = state.unreadCounts;
          return { unreadCounts: rest };
        }),
      setUnreadCounts: (counts) => set({ unreadCounts: counts }),

      // Thread
      activeThread: null,
      setActiveThread: (message) => set({ activeThread: message }),
    }),
    {
      name: 'pulseweave-storage',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        currentWorkspace: state.currentWorkspace,
      }),
    }
  )
);
