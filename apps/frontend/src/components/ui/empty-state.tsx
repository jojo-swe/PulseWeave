'use client';

import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import { Button } from './button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

/**
 * Empty state component for when there's no content to display.
 * Features a subtle animation and optional action button.
 */
export function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  action,
  className 
}: EmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center text-center p-8',
      className
    )}>
      <div className="relative mb-6">
        {/* Glow effect */}
        <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
        
        {/* Icon container */}
        <div className="relative h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
          <Icon className="h-8 w-8 text-primary" />
        </div>
      </div>
      
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm max-w-xs mb-6">{description}</p>
      
      {action && (
        <Button onClick={action.onClick} size="sm">
          {action.label}
        </Button>
      )}
    </div>
  );
}

/**
 * Inline empty state for smaller areas.
 */
export function EmptyStateInline({ 
  icon: Icon, 
  message,
  className 
}: { 
  icon: LucideIcon; 
  message: string;
  className?: string;
}) {
  return (
    <div className={cn(
      'flex items-center justify-center gap-3 py-8 text-muted-foreground',
      className
    )}>
      <Icon className="h-5 w-5" />
      <span className="text-sm">{message}</span>
    </div>
  );
}
