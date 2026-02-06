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
  createdAt: string;
  updatedAt: string;
}

interface Store {
  // Server config
  serverUrl: string;
  setServerUrl: (url: string) => void;

  // Auth
  token: string | null;
  user: User | null;
  setAuth: (token: string | null, user: User | null) => void;
  logout: () => void;

  // Workspace
  currentWorkspace: Workspace | null;
  setCurrentWorkspace: (workspace: Workspace | null) => void;

  // Channels
  channels: Channel[];
  currentChannel: Channel | null;
  setChannels: (channels: Channel[]) => void;
  setCurrentChannel: (channel: Channel | null) => void;

  // Messages
  messages: Message[];
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;

  // Members
  members: User[];
  setMembers: (members: User[]) => void;
}

export const useStore = create<Store>()(
  persist(
    (set) => ({
      // Server config
      serverUrl: 'http://localhost:9090',
      setServerUrl: (url) => set({ serverUrl: url }),

      // Auth
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null, currentWorkspace: null, channels: [], currentChannel: null, messages: [], members: [] }),

      // Workspace
      currentWorkspace: null,
      setCurrentWorkspace: (workspace) => set({
        currentWorkspace: workspace,
        // Clear workspace-specific state when switching away
        ...(workspace === null ? { channels: [], currentChannel: null, messages: [], members: [] } : {}),
      }),

      // Channels
      channels: [],
      currentChannel: null,
      setChannels: (channels) => set({ channels }),
      setCurrentChannel: (channel) => set({ currentChannel: channel }),

      // Messages
      messages: [],
      setMessages: (messages) => set({ messages }),
      addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),

      // Members
      members: [],
      setMembers: (members) => set({ members }),
    }),
    {
      name: 'pulseweave-desktop-storage',
      partialize: (state) => ({
        serverUrl: state.serverUrl,
        token: state.token,
        user: state.user,
        currentWorkspace: state.currentWorkspace,
      }),
    }
  )
);
