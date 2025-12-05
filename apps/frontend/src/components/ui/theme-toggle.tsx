'use client';

import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
  variant?: 'icon' | 'dropdown' | 'buttons';
}

/**
 * Theme toggle component with multiple display variants.
 */
export function ThemeToggle({ className, showLabel = false, variant = 'icon' }: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();

  // Simple icon toggle between light and dark
  if (variant === 'icon') {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn('h-8 w-8', className)}
        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
      >
        <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">Toggle theme</span>
      </Button>
    );
  }

  // Button group for all three options
  if (variant === 'buttons') {
    return (
      <div className={cn('flex items-center gap-1 p-1 rounded-lg bg-muted', className)}>
        <button
          onClick={() => setTheme('light')}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
            theme === 'light'
              ? 'bg-background shadow-sm'
              : 'hover:bg-background/50'
          )}
        >
          <Sun className="h-4 w-4" />
          {showLabel && <span>Light</span>}
        </button>
        <button
          onClick={() => setTheme('dark')}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
            theme === 'dark'
              ? 'bg-background shadow-sm'
              : 'hover:bg-background/50'
          )}
        >
          <Moon className="h-4 w-4" />
          {showLabel && <span>Dark</span>}
        </button>
        <button
          onClick={() => setTheme('system')}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
            theme === 'system'
              ? 'bg-background shadow-sm'
              : 'hover:bg-background/50'
          )}
        >
          <Monitor className="h-4 w-4" />
          {showLabel && <span>System</span>}
        </button>
      </div>
    );
  }

  // Dropdown variant (simplified as a cycle through options)
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('gap-2', className)}
      onClick={() => {
        if (theme === 'light') setTheme('dark');
        else if (theme === 'dark') setTheme('system');
        else setTheme('light');
      }}
    >
      {theme === 'light' && <Sun className="h-4 w-4" />}
      {theme === 'dark' && <Moon className="h-4 w-4" />}
      {theme === 'system' && <Monitor className="h-4 w-4" />}
      {showLabel && (
        <span className="capitalize">{theme}</span>
      )}
    </Button>
  );
}

export default ThemeToggle;
