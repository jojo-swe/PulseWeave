'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import { X, Command } from 'lucide-react';

export function KeyboardShortcutsHint() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if user has seen this before
    const seen = localStorage.getItem('shortcuts-hint-seen');
    if (!seen) {
      const timer = setTimeout(() => setShow(true), 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem('shortcuts-hint-seen', 'true');
    setTimeout(() => setShow(false), 300);
  };

  if (!show) return null;

  return (
    <div
      className={`fixed bottom-4 left-4 z-40 transition-all duration-300 ${
        dismissed ? 'opacity-0 translate-y-2' : 'opacity-100'
      }`}
    >
      <div className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-900/95 px-4 py-3 shadow-xl backdrop-blur-sm">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-purple-600">
          <Command className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-medium text-white">Pro tip</p>
          <p className="text-xs text-gray-400">
            Press{' '}
            <kbd className="rounded bg-gray-700 px-1.5 py-0.5 text-xs">⌘K</kbd> or{' '}
            <kbd className="rounded bg-gray-700 px-1.5 py-0.5 text-xs">Ctrl+K</kbd>{' '}
            to open command palette
          </p>
        </div>
        <button
          onClick={dismiss}
          className="ml-2 text-gray-400 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === '?' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  if (!open) return null;

  const shortcuts = [
    { category: 'Navigation', items: [
      { keys: ['⌘', 'K'], description: 'Open command palette' },
      { keys: ['⌘', '?'], description: 'Show keyboard shortcuts' },
      { keys: ['↑', '↓'], description: 'Navigate in lists' },
      { keys: ['Enter'], description: 'Select / Submit' },
      { keys: ['Esc'], description: 'Close / Cancel' },
    ]},
    { category: 'Messages', items: [
      { keys: ['⌘', 'Enter'], description: 'Send message' },
      { keys: ['⌘', 'B'], description: 'Bold text' },
      { keys: ['⌘', 'I'], description: 'Italic text' },
      { keys: ['⌘', '`'], description: 'Inline code' },
    ]},
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Keyboard Shortcuts</h2>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6">
          {shortcuts.map((section) => (
            <div key={section.category}>
              <h3 className="mb-3 text-sm font-medium text-gray-400">{section.category}</h3>
              <div className="space-y-2">
                {section.items.map((shortcut, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">{shortcut.description}</span>
                    <div className="flex gap-1">
                      {shortcut.keys.map((key, j) => (
                        <kbd
                          key={j}
                          className="min-w-[24px] rounded bg-gray-700 px-2 py-1 text-center text-xs font-medium text-gray-300"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 border-t border-gray-700 pt-4 text-center text-xs text-gray-500">
          Press <kbd className="rounded bg-gray-700 px-1.5 py-0.5">⌘?</kbd> to toggle this dialog
        </div>
      </div>
    </div>
  );
}
