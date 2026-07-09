'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Search, Hash, Lock, MessageSquare } from 'lucide-react';
import { cn, getInitials, generateAvatarColor, formatRelativeTime } from '@/lib/utils';

interface GlobalSearchProps {
  onClose: () => void;
}

interface SearchResult {
  id: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
  channel: {
    id: string;
    name: string;
    isPrivate: boolean;
  };
}

export function GlobalSearch({ onClose }: GlobalSearchProps) {
  const { token, currentWorkspace, setCurrentChannel, channels } = useStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const search = useCallback(async (searchQuery: string, cursor?: string) => {
    if (!token || !currentWorkspace || searchQuery.length < 2) {
      setResults([]);
      setNextCursor(null);
      return;
    }

    if (cursor) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    
    try {
      const data = await api.messages.search(currentWorkspace.id, searchQuery, token, cursor);
      if (cursor) {
        setResults(prev => [...prev, ...data.messages]);
      } else {
        setResults(data.messages);
      }
      setNextCursor(data.nextCursor);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [token, currentWorkspace]);

  const loadMore = useCallback(() => {
    if (nextCursor && !loadingMore) {
      search(query, nextCursor);
    }
  }, [nextCursor, loadingMore, search, query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      search(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleResultClick = (result: SearchResult) => {
    const channel = channels.find(c => c.id === result.channel.id);
    if (channel) {
      setCurrentChannel(channel);
    }
    onClose();
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) => 
      regex.test(part) ? <mark key={i} className="bg-yellow-500/30 text-foreground">{part}</mark> : part
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50" onClick={onClose}>
      <div 
        className="bg-background rounded-lg shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="flex items-center gap-3 p-4 border-b">
          <Search className="h-5 w-5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages across all channels..."
            className="border-0 focus-visible:ring-0 text-lg"
            autoFocus
          />
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Results */}
        <ScrollArea className="max-h-[60vh]">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-2" />
              Searching...
            </div>
          ) : results.length > 0 ? (
            <div className="divide-y">
              {results.map((result) => (
                <button
                  key={result.id}
                  onClick={() => handleResultClick(result)}
                  className="w-full p-4 text-left hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={result.user.avatarUrl} />
                      <AvatarFallback className={cn(generateAvatarColor(result.user.displayName))}>
                        {getInitials(result.user.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{result.user.displayName}</span>
                        <span className="text-xs text-muted-foreground">
                          in {result.channel.isPrivate ? <Lock className="h-3 w-3 inline" /> : <Hash className="h-3 w-3 inline" />}
                          {result.channel.name}
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {formatRelativeTime(result.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {highlightMatch(result.content, query)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
              {/* Load More Button */}
              {nextCursor && (
                <div className="p-4 text-center">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="px-4 py-2 text-sm font-medium text-primary hover:text-primary/80 disabled:opacity-50"
                  >
                    {loadingMore ? (
                      <span className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        Loading more...
                      </span>
                    ) : (
                      'Load more results'
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : query.length >= 2 ? (
            <div className="p-8 text-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No messages found for &quot;{query}&quot;</p>
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Type at least 2 characters to search</p>
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="p-3 border-t bg-muted/30 text-xs text-muted-foreground flex items-center justify-between">
          <span>Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">ESC</kbd> to close</span>
          {results.length > 0 && <span>{results.length} results</span>}
        </div>
      </div>
    </div>
  );
}
