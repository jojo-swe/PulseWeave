'use client';

import { ToastProvider } from '@/components/ui/toast';
import { CommandPalette } from '@/components/ui/command-palette';
import { KeyboardShortcutsHint, KeyboardShortcutsDialog } from '@/components/ui/keyboard-shortcuts';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <ToastProvider>
        {children}
        <CommandPalette />
        <KeyboardShortcutsHint />
        <KeyboardShortcutsDialog />
      </ToastProvider>
    </ErrorBoundary>
  );
}
