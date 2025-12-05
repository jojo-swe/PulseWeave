'use client';

/**
 * VirtualizedMessageList - Wrapper around MessageList.
 * The Zap icon toggle in the header allows switching between modes.
 * Currently both modes use the same implementation until virtualization is properly configured.
 */

import { MessageList } from './MessageList';

interface VirtualizedMessageListProps {
  onReaction?: (messageId: string, emoji: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  onDelete?: (messageId: string) => void;
  onOpenThread?: (message: any) => void;
  onPin?: (messageId: string) => void;
}

/**
 * Virtualized message list component.
 * Uses MessageList under the hood with plans for react-window virtualization.
 */
export function VirtualizedMessageList(props: VirtualizedMessageListProps) {
  return <MessageList {...props} />;
}

export default VirtualizedMessageList;
