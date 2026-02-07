import type { StateCreator } from 'zustand';
import type { Channel, ChannelCategory } from './types';
import type { AppState } from './index';

export interface ChannelSlice {
  currentChannel: Channel | null;
  channels: Channel[];
  setCurrentChannel: (channel: Channel | null) => void;
  setChannels: (channels: Channel[]) => void;
  addChannel: (channel: Channel) => void;

  categories: ChannelCategory[];
  setCategories: (categories: ChannelCategory[]) => void;
  addCategory: (category: ChannelCategory) => void;
  updateCategory: (id: string, data: Partial<ChannelCategory>) => void;
  deleteCategory: (id: string) => void;
  toggleCategoryCollapse: (id: string) => void;

  starredChannels: Set<string>;
  toggleStarChannel: (channelId: string) => void;
  isChannelStarred: (channelId: string) => boolean;

  unreadCounts: Record<string, number>;
  setUnreadCounts: (counts: Record<string, number>) => void;
  incrementUnread: (channelId: string) => void;
  clearUnread: (channelId: string) => void;
}

export const createChannelSlice: StateCreator<AppState, [], [], ChannelSlice> = (set, get) => ({
  currentChannel: null,
  channels: [],
  setCurrentChannel: (channel) => set({ currentChannel: channel, currentConversation: null, messages: [] }),
  setChannels: (channels) => set({ channels }),
  addChannel: (channel) => set((state) => ({ channels: [...state.channels, channel] })),

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

  unreadCounts: {},
  setUnreadCounts: (counts) => set({ unreadCounts: counts }),
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
});
