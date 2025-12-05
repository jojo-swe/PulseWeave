'use client';

import { ToastProvider } from '@/components/ui/toast';
import { KeyboardShortcutsHint, KeyboardShortcutsDialog } from '@/components/ui/keyboard-shortcuts';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ThemeProvider } from '@/components/theme-provider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" storageKey="pulseweave-theme">
        <ToastProvider>
          {children}
          <KeyboardShortcutsHint />
          <KeyboardShortcutsDialog />
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
