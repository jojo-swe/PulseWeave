// User types
export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  status: UserStatus;
  statusMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type UserStatus = 'online' | 'away' | 'dnd' | 'offline';

// Workspace types
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  iconUrl?: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

// Channel types
export interface Channel {
  id: string;
  name: string;
  description?: string;
  workspaceId: string;
  isPrivate: boolean;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

// Message types
export interface Message {
  id: string;
  content: string;
  channelId: string;
  userId: string;
  user?: User;
  parentId?: string;
  threadCount?: number;
  reactions?: Reaction[];
  attachments?: Attachment[];
  isEdited: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Reaction {
  emoji: string;
  count: number;
  users: string[];
}

export interface Attachment {
  id: string;
  type: 'image' | 'file' | 'link';
  url: string;
  name: string;
  size?: number;
  mimeType?: string;
}

// Direct Message types
export interface DirectMessage {
  id: string;
  participants: User[];
  lastMessage?: Message;
  createdAt: Date;
  updatedAt: Date;
}

// WebSocket event types
export type SocketEvent =
  | 'message:new'
  | 'message:update'
  | 'message:delete'
  | 'message:reaction'
  | 'user:typing'
  | 'user:status'
  | 'channel:join'
  | 'channel:leave'
  | 'presence:update';

export interface TypingEvent {
  channelId: string;
  userId: string;
  username: string;
}

export interface PresenceEvent {
  userId: string;
  status: UserStatus;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
