import type { StateCreator } from 'zustand';
import type { Workspace } from './types';
import type { AppState } from './index';

export interface WorkspaceSlice {
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  setCurrentWorkspace: (workspace: Workspace | null) => void;
  setWorkspaces: (workspaces: Workspace[]) => void;
}

export const createWorkspaceSlice: StateCreator<AppState, [], [], WorkspaceSlice> = (set) => ({
  currentWorkspace: null,
  workspaces: [],
  setCurrentWorkspace: (workspace) => set({ currentWorkspace: workspace }),
  setWorkspaces: (workspaces) => set({ workspaces }),
});
