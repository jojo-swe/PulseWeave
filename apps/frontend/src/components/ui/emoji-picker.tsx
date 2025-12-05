'use client';

import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

const EMOJI_CATEGORIES = {
  'Smileys': ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥'],
  'Gestures': ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏'],
  'Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️'],
  'Objects': ['💼', '📁', '📂', '📅', '📆', '📌', '📍', '📎', '🖇️', '📏', '📐', '✂️', '🗃️', '🗄️', '🗑️', '🔒', '🔓', '🔑', '🔨', '⚙️', '💡', '📱', '💻', '🖥️', '⌨️', '🖱️', '🖨️', '📷', '🎥', '📺'],
  'Symbols': ['✅', '❌', '⭕', '❗', '❓', '💯', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '⬛', '⬜', '◼️', '◻️', '🔶', '🔷', '🔸', '🔹', '🔺', '🔻', '💠', '🔘', '🔳', '🔲'],
};

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  position?: { top?: number; bottom?: number; left?: number; right?: number };
}

export function EmojiPicker({ onSelect, onClose, position }: EmojiPickerProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('Smileys');
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const filteredEmojis = React.useMemo(() => {
    if (!search) return EMOJI_CATEGORIES;
    
    const query = search.toLowerCase();
    const result: Record<string, string[]> = {};
    
    Object.entries(EMOJI_CATEGORIES).forEach(([category, emojis]) => {
      const filtered = emojis.filter(() => 
        category.toLowerCase().includes(query)
      );
      if (filtered.length > 0) {
        result[category] = filtered;
      }
    });
    
    // If no category matches, show all emojis
    if (Object.keys(result).length === 0) {
      return EMOJI_CATEGORIES;
    }
    
    return result;
  }, [search]);

  const style: React.CSSProperties = position
    ? { position: 'absolute', ...position }
    : {};

  return (
    <div
      ref={ref}
      style={style}
      className="z-50 w-80 rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
    >
      {/* Search */}
      <div className="border-b border-gray-700 p-2">
        <input
          type="text"
          placeholder="Search emoji..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-purple-500"
          autoFocus
        />
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-gray-700 p-2">
        {Object.keys(EMOJI_CATEGORIES).map((category) => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={cn(
              'whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition-colors',
              activeCategory === category
                ? 'bg-purple-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            )}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Emoji grid */}
      <div className="h-48 overflow-y-auto p-2">
        {Object.entries(filteredEmojis).map(([category, emojis]) => (
          <div key={category} className={cn(activeCategory !== category && !search && 'hidden')}>
            <div className="mb-2 text-xs font-medium text-gray-500">{category}</div>
            <div className="grid grid-cols-8 gap-1">
              {emojis.map((emoji, index) => (
                <button
                  key={`${emoji}-${index}`}
                  onClick={() => {
                    onSelect(emoji);
                    onClose();
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-gray-700"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Quick reactions */}
      <div className="flex items-center gap-1 border-t border-gray-700 p-2">
        <span className="mr-2 text-xs text-gray-500">Quick:</span>
        {['👍', '❤️', '😂', '🎉', '🤔', '👀', '🚀', '✅'].map((emoji) => (
          <button
            key={emoji}
            onClick={() => {
              onSelect(emoji);
              onClose();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-base transition-colors hover:bg-gray-700"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
