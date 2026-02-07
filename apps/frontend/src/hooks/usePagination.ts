'use client';

import { useState, useCallback, useRef } from 'react';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { handleAuthError } from './useAuthCheck';

export interface MessagePaginationState {
  isLoadingMore: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  setCursor: (cursor: string | null) => void;
}

export function useMessagePagination(): MessagePaginationState {
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<string | null>(null);

  const setCursor = useCallback((cursor: string | null) => {
    cursorRef.current = cursor;
    setHasMore(cursor !== null);
  }, []);

  const loadMore = useCallback(async () => {
    const { currentChannel, token, prependMessages } = useStore.getState();
    if (!currentChannel || !token || !cursorRef.current) return;

    setIsLoadingMore(true);
    try {
      const { messages, nextCursor } = await api.messages.list(
        currentChannel.id,
        token,
        cursorRef.current,
      );
      prependMessages(messages);
      cursorRef.current = nextCursor;
      setHasMore(nextCursor !== null);
    } catch (error) {
      if (handleAuthError(error)) return;
      console.error('Failed to load more messages:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, []);

  return { isLoadingMore, hasMore, loadMore, setCursor };
}
