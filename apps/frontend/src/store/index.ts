import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { AuthSlice, createAuthSlice } from './authSlice';
import { WorkspaceSlice, createWorkspaceSlice } from './workspaceSlice';
import { ChannelSlice, createChannelSlice } from './channelSlice';
import { MessageSlice, createMessageSlice } from './messageSlice';
import { MemberSlice, createMemberSlice } from './memberSlice';
import { DmSlice, createDmSlice } from './dmSlice';
import { UiSlice, createUiSlice } from './uiSlice';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type AppState =
  & AuthSlice
  & WorkspaceSlice
  & ChannelSlice
  & MessageSlice
  & MemberSlice
  & DmSlice
  & UiSlice;

export { type User, type Workspace, type Channel, type Message, type Conversation, type DirectMessage, type ChannelCategory, type ScheduledMessage } from './types';

export const useStore = create<AppState>()(
  persist(
    (...a) => ({
      ...createAuthSlice(...a),
      ...createWorkspaceSlice(...a),
      ...createChannelSlice(...a),
      ...createMessageSlice(...a),
      ...createMemberSlice(...a),
      ...createDmSlice(...a),
      ...createUiSlice(...a),
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
