import type { StateCreator } from 'zustand';
import type { User } from './types';
import type { AppState } from './index';

export interface MemberSlice {
  members: Array<{ user: User; role: string }>;
  setMembers: (members: Array<{ user: User; role: string }>) => void;
  updateMemberStatus: (userId: string, status: string) => void;

  typingUsers: Map<string, { username: string; timeout: NodeJS.Timeout }>;
  setUserTyping: (channelId: string, userId: string, username: string) => void;
  clearUserTyping: (channelId: string, userId: string) => void;

  userStatus: 'online' | 'away' | 'busy' | 'offline';
  setUserStatus: (status: 'online' | 'away' | 'busy' | 'offline') => void;
}

export const createMemberSlice: StateCreator<AppState, [], [], MemberSlice> = (set, get) => ({
  members: [],
  setMembers: (members) => set({ members }),
  updateMemberStatus: (userId, status) =>
    set((state) => ({
      members: state.members.map((m) =>
        m.user.id === userId ? { ...m, user: { ...m.user, status } } : m
      ),
      user: state.user?.id === userId ? { ...state.user, status } : state.user,
    })),

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

  userStatus: 'online',
  setUserStatus: (status) => set({ userStatus: status }),
});
