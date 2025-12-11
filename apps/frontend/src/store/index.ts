import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { API_URL } from '@/config/env';

interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  status: string;
  statusMessage?: string | null;
  role?: 'user' | 'admin' | 'owner';
  isActive: boolean;
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
  iconUrl?: string;
}

interface ChannelCategory {
  id: string;
  name: string;
  position: number;
  isCollapsed: boolean;
  channels: Channel[];
}

interface Channel {
  id: string;
  name: string;
  description?: string;
  isPrivate: boolean;
  categoryId?: string;
  position?: number;
}

interface ScheduledMessage {
  id: string;
  content: string;
  channelId: string;
  scheduledAt: string;
  status: 'pending' | 'sent' | 'cancelled';
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

interface Conversation {
  id: string;
  isGroup: boolean;
  name?: string;
  members: Array<{
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    status?: string;
  }>;
  lastMessage?: {
    id: string;
    content: string;
    createdAt: string;
    user: { id: string; displayName: string };
  };
  updatedAt: string;
}

interface DirectMessage {
  id: string;
  content: string;
  conversationId: string;
  userId: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
  createdAt: string;
}

interface AppState {
  // Auth
  token: string | null;
  user: User | null;
  setAuth: (token: string | null, user: User) => void;
  setUser: (user: User) => void;
  logout: () => void;

  // Workspace
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  setCurrentWorkspace: (workspace: Workspace | null) => void;
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

  // Starred Channels
  starredChannels: Set<string>;
  toggleStarChannel: (channelId: string) => void;
  isChannelStarred: (channelId: string) => boolean;

  // User Status
  userStatus: 'online' | 'away' | 'busy' | 'offline';
  setUserStatus: (status: 'online' | 'away' | 'busy' | 'offline') => void;

  // Direct Messages
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

  // Channel Categories
  categories: ChannelCategory[];
  setCategories: (categories: ChannelCategory[]) => void;
  addCategory: (category: ChannelCategory) => void;
  updateCategory: (id: string, data: Partial<ChannelCategory>) => void;
  deleteCategory: (id: string) => void;
  toggleCategoryCollapse: (id: string) => void;

  // Scheduled Messages
  scheduledMessages: ScheduledMessage[];
  setScheduledMessages: (messages: ScheduledMessage[]) => void;
  addScheduledMessage: (message: ScheduledMessage) => void;
  removeScheduledMessage: (id: string) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Auth
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      setUser: (user) => set({ user }),
      logout: () => {
        // Call backend to clear cookies and revoke token
        const token = get().token;
        fetch(`${API_URL}/api/auth/logout`, {
          method: 'POST',
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }).catch(() => {
          // Ignore errors - we're logging out anyway
        });
        // Clear local state
        set({ token: null, user: null, currentWorkspace: null, currentChannel: null });
        // Redirect to login
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
      },

      // Workspace
      currentWorkspace: null,
      workspaces: [],
      setCurrentWorkspace: (workspace) => set({ currentWorkspace: workspace }),
      setWorkspaces: (workspaces) => set({ workspaces }),

      // Channels
      currentChannel: null,
      channels: [],
      setCurrentChannel: (channel) => set({ currentChannel: channel, currentConversation: null, messages: [] }),
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
          // Also update current user's status if it's our own status change
          user: state.user?.id === userId ? { ...state.user, status } : state.user,
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

      // Starred Channels
      starredChannels: new Set<string>(),
      toggleStarChannel: (channelId) =>
        set((state) => {
          const newStarred = new Set(state.starredChannels);
          if (newStarred.has(channelId)) {
            newStarred.delete(channelId);
          } else {
            newStarred.add(channelId);
          }
          return { starredChannels: newStarred };
        }),
      isChannelStarred: (channelId) => get().starredChannels.has(channelId),

      // User Status
      userStatus: 'online',
      setUserStatus: (status) => set({ userStatus: status }),

      // Direct Messages
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

      // Channel Categories
      categories: [],
      setCategories: (categories) => set({ categories }),
      addCategory: (category) =>
        set((state) => ({ categories: [...state.categories, category] })),
      updateCategory: (id, data) =>
        set((state) => ({
          categories: state.categories.map((c) =>
            c.id === id ? { ...c, ...data } : c
          ),
        })),
      deleteCategory: (id) =>
        set((state) => ({
          categories: state.categories.filter((c) => c.id !== id),
        })),
      toggleCategoryCollapse: (id) =>
        set((state) => ({
          categories: state.categories.map((c) =>
            c.id === id ? { ...c, isCollapsed: !c.isCollapsed } : c
          ),
        })),

      // Scheduled Messages
      scheduledMessages: [],
      setScheduledMessages: (messages) => set({ scheduledMessages: messages }),
      addScheduledMessage: (message) =>
        set((state) => ({ scheduledMessages: [...state.scheduledMessages, message] })),
      removeScheduledMessage: (id) =>
        set((state) => ({
          scheduledMessages: state.scheduledMessages.filter((m) => m.id !== id),
        })),
    }),
    {
      name: 'pulseweave-storage',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        currentWorkspace: state.currentWorkspace,
        starredChannels: Array.from(state.starredChannels),
        userStatus: state.userStatus,
      }),
      merge: (persistedState: any, currentState) => ({
        ...currentState,
        ...persistedState,
        starredChannels: new Set(persistedState?.starredChannels || []),
      }),
    }
  )
);
