'use client';

import { ToastProvider } from '@/components/ui/toast';
import { KeyboardShortcutsHint, KeyboardShortcutsDialog } from '@/components/ui/keyboard-shortcuts';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ThemeProvider } from '@/components/theme-provider';
import { ConnectionToast } from '@/components/ui/network-status';
import { CookieConsent } from '@/components/ui/cookie-consent';
import { StatusBanner } from '@/components/ui/status-banner';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" storageKey="pulseweave-theme">
        <ToastProvider>
          <StatusBanner />
          {children}
          <KeyboardShortcutsHint />
          <KeyboardShortcutsDialog />
          <ConnectionToast />
          <CookieConsent />
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
