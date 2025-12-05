'use client';

import { ToastProvider } from '@/components/ui/toast';
import { CommandPalette } from '@/components/ui/command-palette';
import { KeyboardShortcutsHint, KeyboardShortcutsDialog } from '@/components/ui/keyboard-shortcuts';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ThemeProvider } from '@/components/theme-provider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" storageKey="pulseweave-theme">
        <ToastProvider>
          {children}
          <CommandPalette />
          <KeyboardShortcutsHint />
          <KeyboardShortcutsDialog />
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
