'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store';
import { api } from '@/lib/api';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function handleAuthError(error: any): boolean {
  const errorMsg = error?.message?.toLowerCase() || '';
  if (
    error?.status === 401 ||
    error?.status === 403 ||
    errorMsg.includes('token expired') ||
    errorMsg.includes('unauthorized') ||
    errorMsg.includes('jwt') ||
    errorMsg.includes('access denied') ||
    errorMsg.includes('revoked') ||
    errorMsg.includes('authentication')
  ) {
    useStore.getState().logout();
    return true;
  }
  return false;
}

interface AuthCheckResult {
  loading: boolean;
  hydrated: boolean;
  authenticated: boolean;
}

export function useAuthCheck(): AuthCheckResult {
  const router = useRouter();
  const {
    token,
    user,
    currentChannel,
    setCurrentWorkspace,
    setChannels,
    setMembers,
    setCurrentChannel,
    setConversations,
    setUnreadCounts,
  } = useStore();

  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    const checkAuthAndLoadData = async () => {
      try {
        const userData = await api.get<any>('/auth/me');

        if (!userData) {
          router.push('/login');
          return;
        }

        if (!user || user.id !== userData.id) {
          useStore.getState().setUser(userData);
        }

        const workspaces = await api.workspaces.list(token || '');
        if (workspaces.length > 0) {
          const workspace = await api.workspaces.get(workspaces[0].id, token || '');
          setCurrentWorkspace(workspace);
          setChannels(workspace.channels);
          setMembers(workspace.members);

          if (workspace.channels.length > 0 && !currentChannel) {
            setCurrentChannel(workspace.channels[0]);
          }

          const conversations = await api.dm.list(workspace.id, token || '');
          setConversations(conversations);

          const unreadCounts = await api.channels.getUnreadCounts(workspace.id, token || '');
          setUnreadCounts(unreadCounts);
        }
      } catch (error: any) {
        if (handleAuthError(error)) return;
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    checkAuthAndLoadData();
  }, [router, hydrated]);

  return {
    loading,
    hydrated,
    authenticated: !!user,
  };
}
