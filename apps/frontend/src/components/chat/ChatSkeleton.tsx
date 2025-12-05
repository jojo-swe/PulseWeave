'use client';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading skeleton for the chat area.
 * Displays placeholder content while messages are loading.
 */
export function ChatSkeleton() {
  return (
    <div className="flex-1 flex flex-col">
      {/* Header skeleton */}
      <div className="h-14 flex items-center justify-between px-4 border-b">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      </div>

      {/* Messages skeleton */}
      <div className="flex-1 p-4 space-y-6 overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <MessageSkeleton key={i} isOwn={i % 3 === 0} />
        ))}
      </div>

      {/* Input skeleton */}
      <div className="p-4 border-t">
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </div>
  );
}

/**
 * Single message skeleton.
 */
function MessageSkeleton({ isOwn }: { isOwn?: boolean }) {
  return (
    <div className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}>
      <Skeleton className="h-10 w-10 rounded-full shrink-0" />
      <div className={`space-y-2 ${isOwn ? 'items-end' : ''}`}>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="h-16 w-64 rounded-lg" />
      </div>
    </div>
  );
}

/**
 * Sidebar loading skeleton.
 */
export function SidebarSkeleton() {
  return (
    <div className="flex flex-col h-full p-4 space-y-6">
      {/* Workspace header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>

      {/* Channels section */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-20" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>

      {/* Members section */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
