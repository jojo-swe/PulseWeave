'use client';

import { useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ShortcutGroup {
  title: string;
  shortcuts: Array<{
    keys: string[];
    description: string;
  }>;
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['Ctrl', 'K'], description: 'Open command palette' },
      { keys: ['Ctrl', '/'], description: 'Open keyboard shortcuts' },
      { keys: ['Ctrl', 'Shift', 'F'], description: 'Search messages' },
      { keys: ['Alt', '↑'], description: 'Previous channel' },
      { keys: ['Alt', '↓'], description: 'Next channel' },
      { keys: ['Esc'], description: 'Close modal / Cancel' },
    ],
  },
  {
    title: 'Messages',
    shortcuts: [
      { keys: ['Enter'], description: 'Send message' },
      { keys: ['Shift', 'Enter'], description: 'New line' },
      { keys: ['↑'], description: 'Edit last message (when input empty)' },
      { keys: ['Ctrl', 'B'], description: 'Bold text' },
      { keys: ['Ctrl', 'I'], description: 'Italic text' },
      { keys: ['Ctrl', 'E'], description: 'Inline code' },
      { keys: ['Ctrl', 'K'], description: 'Add link' },
      { keys: ['Ctrl', 'Shift', 'X'], description: 'Strikethrough' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: ['Ctrl', 'N'], description: 'New channel' },
      { keys: ['Ctrl', ','], description: 'Open settings' },
      { keys: ['Ctrl', 'Shift', 'M'], description: 'Toggle mute' },
      { keys: ['Ctrl', 'Shift', 'D'], description: 'Toggle dark mode' },
    ],
  },
];

interface KeyboardShortcutsProps {
  onClose: () => void;
}

/**
 * Modal displaying all available keyboard shortcuts.
 * Opens with Ctrl+/ or from command palette.
 */
export function KeyboardShortcuts({ onClose }: KeyboardShortcutsProps) {
  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-xl border bg-popover shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Keyboard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
              <p className="text-sm text-muted-foreground">
                Speed up your workflow with these shortcuts
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {SHORTCUTS.map((group) => (
              <div key={group.title}>
                <h3 className="text-sm font-semibold text-primary mb-3">
                  {group.title}
                </h3>
                <div className="space-y-2">
                  {group.shortcuts.map((shortcut, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-1.5"
                    >
                      <span className="text-sm text-muted-foreground">
                        {shortcut.description}
                      </span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, keyIndex) => (
                          <span key={keyIndex} className="flex items-center">
                            <kbd className="px-2 py-1 text-xs font-medium bg-muted rounded border border-border shadow-sm">
                              {key}
                            </kbd>
                            {keyIndex < shortcut.keys.length - 1 && (
                              <span className="mx-1 text-muted-foreground text-xs">+</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-3 bg-muted/30">
          <p className="text-xs text-muted-foreground text-center">
            Press <kbd className="px-1.5 py-0.5 text-[10px] font-medium bg-muted rounded">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 text-[10px] font-medium bg-muted rounded">/</kbd> anytime to view shortcuts
          </p>
        </div>
      </div>
    </div>
  );
}

export default KeyboardShortcuts;
