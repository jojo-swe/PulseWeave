import type { User, Workspace, Channel, Message, Conversation, DirectMessage, ChannelCategory, ScheduledMessage } from '@/store/types';

export interface AuthResponse {
  user: User;
  token: string;
  workspace: Workspace;
}

export interface WorkspaceDetail extends Workspace {
  channels: Channel[];
  members: Array<{ user: User; role: string }>;
}

export interface WorkspaceJoinInfo {
  id: string;
  name: string;
  slug: string;
  iconUrl?: string;
  memberCount: number;
  isMember: boolean;
}

export interface WorkspaceJoinResult {
  success: boolean;
  message: string;
  workspace: Workspace;
  alreadyMember: boolean;
}

export interface PaginatedMessages {
  messages: Message[];
  nextCursor: string | null;
}

export interface SearchResultMessage extends Message {
  channel: {
    id: string;
    name: string;
    isPrivate: boolean;
  };
}

export interface PaginatedSearchResults {
  messages: SearchResultMessage[];
  nextCursor: string | null;
}

export interface PaginatedDmMessages {
  messages: DirectMessage[];
  nextCursor: string | null;
}

export interface SuccessResponse {
  success: boolean;
  message?: string;
}

export interface UploadResult {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface WebhookTestResult {
  success: boolean;
  statusCode?: number;
  response?: string;
  error?: string;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedUsers {
  users: User[];
  pagination: PaginationInfo;
}

export interface PaginatedAuditLog {
  logs: AuditLogEntry[];
  pagination: PaginationInfo;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  userId: string;
  targetId?: string;
  details?: Record<string, unknown>;
  createdAt: string;
  user?: { id: string; username: string; displayName: string };
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  statusCode?: number;
  success: boolean;
  error?: string;
  createdAt: string;
}

export interface PaginatedDeliveries {
  deliveries: WebhookDelivery[];
  pagination: PaginationInfo;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  secret: string | null;
  headers?: Record<string, string>;
  createdAt: string;
  _count?: { deliveries: number };
}

export interface IncomingWebhook {
  id: string;
  name: string;
  token: string;
  webhookUrl: string;
  channelId: string | null;
  channel: { id: string; name: string } | null;
  allowedIps?: string[];
  isActive: boolean;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  key?: string;
  scopes: string[];
  isActive: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface Integration {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  isActive: boolean;
  status: string;
  lastSyncAt: string | null;
  typeInfo: unknown;
  createdAt?: string;
}

export interface IntegrationTypes {
  [key: string]: {
    name: string;
    description: string;
    configSchema: Record<string, unknown>;
  };
}

export interface InviteLink {
  id: string;
  code: string;
  workspaceId: string;
  createdById: string;
  maxUses: number | null;
  useCount: number;
  expiresAt: string | null;
  isRevoked: boolean;
  createdAt: string;
  createdBy: {
    id: string;
    username: string;
    displayName: string;
  };
}

export interface InviteInfo {
  code: string;
  workspace: {
    id: string;
    name: string;
    slug: string;
    iconUrl?: string;
    memberCount: number;
  };
  isMember: boolean;
}

export type {
  User,
  Workspace,
  Channel,
  Message,
  Conversation,
  DirectMessage,
  ChannelCategory,
  ScheduledMessage,
};
