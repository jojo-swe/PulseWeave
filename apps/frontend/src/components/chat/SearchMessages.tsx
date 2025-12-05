'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, X, Hash, MessageSquare, Calendar } from 'lucide-react';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { cn, formatMessageDate, formatMessageTime, getInitials, generateAvatarColor } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';

interface SearchResult {
  id: string;
  content: string;
  createdAt: string;
  channelId: string;
  channel?: { name: string };
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
}

interface SearchMessagesProps {
  onClose: () => void;
  onSelectMessage?: (message: SearchResult) => void;
}

export function SearchMessages({ onClose, onSelectMessage }: SearchMessagesProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  
  const { token, messages, channels, currentChannel, setCurrentChannel } = useStore();

  // Local search through loaded messages
  const searchMessages = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setSearched(true);

    const query = searchQuery.toLowerCase();
    const filtered = messages.filter(msg => 
      msg.content.toLowerCase().includes(query)
    ).map(msg => ({
      ...msg,
      channel: channels.find(c => c.id === msg.channelId),
    }));

    setResults(filtered);
    setLoading(false);
  }, [messages, channels]);

  // Debounced search
  useEffect(() => {
    const timeout = setTimeout(() => {
      searchMessages(query);
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, searchMessages]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [onClose]);

  const handleSelectResult = (result: SearchResult) => {
    // Find and switch to the channel
    const channel = channels.find(c => c.id === result.channelId);
    if (channel) {
      setCurrentChannel(channel);
    }
    onSelectMessage?.(result);
    onClose();
  };

  // Group results by date
  const groupedResults: { date: string; results: SearchResult[] }[] = [];
  let currentDate = '';

  results.forEach((result) => {
    const resultDate = formatMessageDate(result.createdAt);
    if (resultDate !== currentDate) {
      currentDate = resultDate;
      groupedResults.push({ date: resultDate, results: [result] });
    } else {
      groupedResults[groupedResults.length - 1].results.push(result);
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-gray-700 px-4 py-3">
          <Search className="h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search messages..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-base text-white placeholder-gray-400 outline-none"
            autoFocus
          />
          {query && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setQuery('')}>
              <X className="h-4 w-4" />
            </Button>
          )}
          <kbd className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-400">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
            </div>
          ) : !searched ? (
            <div className="px-4 py-12 text-center">
              <MessageSquare className="mx-auto h-12 w-12 text-gray-600" />
              <p className="mt-2 text-gray-400">Start typing to search messages</p>
              <p className="mt-1 text-sm text-gray-500">
                Search through all messages in this workspace
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-12 text-center text-gray-400">
              <p>No messages found for "{query}"</p>
              <p className="mt-1 text-sm text-gray-500">Try a different search term</p>
            </div>
          ) : (
            <div className="p-2">
              {groupedResults.map((group) => (
                <div key={group.date}>
                  <div className="flex items-center gap-2 px-2 py-2">
                    <Calendar className="h-3 w-3 text-gray-500" />
                    <span className="text-xs font-medium text-gray-500">{group.date}</span>
                  </div>
                  {group.results.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => handleSelectResult(result)}
                      className="w-full rounded-lg p-3 text-left hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarImage src={result.user.avatarUrl} />
                          <AvatarFallback className={cn('text-xs', generateAvatarColor(result.user.displayName))}>
                            {getInitials(result.user.displayName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-white">
                              {result.user.displayName}
                            </span>
                            {result.channel && (
                              <span className="flex items-center gap-1 text-xs text-gray-500">
                                <Hash className="h-3 w-3" />
                                {result.channel.name}
                              </span>
                            )}
                            <span className="text-xs text-gray-500">
                              {formatMessageTime(result.createdAt)}
                            </span>
                          </div>
                          <div className="mt-1 text-sm text-gray-300 line-clamp-2">
                            <HighlightText text={result.content} query={query} />
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700 px-4 py-2 text-xs text-gray-500">
          {results.length > 0 && (
            <span>{results.length} result{results.length !== 1 ? 's' : ''} found</span>
          )}
        </div>
      </div>
    </div>
  );
}

// Highlight search query in text
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;

  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  
  return (
    <>
      {parts.map((part, i) => (
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-yellow-500/30 text-yellow-200 rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      ))}
    </>
  );
}
