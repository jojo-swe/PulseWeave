export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  status: string;
  statusMessage?: string | null;
  role?: 'user' | 'admin' | 'owner';
  isActive: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  iconUrl?: string;
}

export interface ChannelCategory {
  id: string;
  name: string;
  position: number;
  isCollapsed: boolean;
  channels: Channel[];
}

export interface Channel {
  id: string;
  name: string;
  description?: string;
  isPrivate: boolean;
  categoryId?: string;
  position?: number;
}

export interface ScheduledMessage {
  id: string;
  content: string;
  channelId: string;
  scheduledAt: string;
  status: 'pending' | 'sent' | 'cancelled';
}

export interface Message {
  id: string;
  content: string;
  channelId: string;
  userId: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
  parentId?: string;
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { replies: number };
  reactions?: Array<{
    emoji: string;
    user: { id: string; username: string };
  }>;
}

export interface Conversation {
  id: string;
  isGroup: boolean;
  name?: string;
  members: Array<{
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    status?: string;
  }>;
  lastMessage?: {
    id: string;
    content: string;
    createdAt: string;
    user: { id: string; displayName: string };
  };
  updatedAt: string;
}

export interface DirectMessage {
  id: string;
  content: string;
  conversationId: string;
  userId: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
  createdAt: string;
}
