import type { StateCreator } from 'zustand';
import type { AppState } from './index';

export interface UiSlice {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  useVirtualizedList: boolean;
  toggleVirtualizedList: () => void;

  unreadCounts: Record<string, number>;
  incrementUnread: (channelId: string) => void;
  clearUnread: (channelId: string) => void;
  setUnreadCounts: (counts: Record<string, number>) => void;
}

export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  useVirtualizedList: false,
  toggleVirtualizedList: () => set((state) => ({ useVirtualizedList: !state.useVirtualizedList })),

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
});
