import type { StateCreator } from 'zustand';
import type { User } from './types';
import type { AppState } from './index';
import { API_URL } from '@/config/env';

export interface AuthSlice {
  token: string | null;
  user: User | null;
  setAuth: (token: string | null, user: User) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

export const createAuthSlice: StateCreator<AppState, [], [], AuthSlice> = (set, get) => ({
  token: null,
  user: null,
  setAuth: (token, user) => set({ token, user }),
  setUser: (user) => set({ user }),
  logout: () => {
    const token = get().token;
    fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).catch(() => {
      // Ignore errors - we're logging out anyway
    });
    set({ token: null, user: null, currentWorkspace: null, currentChannel: null });
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },
});
