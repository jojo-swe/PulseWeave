import { API_URL } from '@/config/env';
import type {
  User,
  Workspace,
  Channel,
  Message,
  Conversation,
  DirectMessage,
  ChannelCategory,
  ScheduledMessage,
  AuthResponse,
  WorkspaceDetail,
  WorkspaceJoinInfo,
  WorkspaceJoinResult,
  PaginatedMessages,
  PaginatedSearchResults,
  PaginatedDmMessages,
  SuccessResponse,
  UploadResult,
  WebhookTestResult,
  PaginatedUsers,
  PaginatedAuditLog,
  PaginatedDeliveries,
  Webhook,
  IncomingWebhook,
  ApiKey,
  Integration,
  IntegrationTypes,
  InviteLink,
  InviteInfo,
} from './api-types';

interface FetchOptions extends RequestInit {
  token?: string;
  retry?: boolean;
  maxRetries?: number;
}

/**
 * Custom API error with additional context
 */
export class ApiError extends Error {
  status: number;
  code?: string;
  isNetworkError: boolean;
  isRetryable: boolean;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.isNetworkError = status === 0;
    this.isRetryable = this.isNetworkError || status >= 500 || status === 429;
  }
}

/**
 * Sleep helper for retry delays
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calculate exponential backoff delay
 */
const getRetryDelay = (attempt: number, baseDelay = 1000): number => {
  return Math.min(baseDelay * Math.pow(2, attempt), 10000); // Max 10 seconds
};

async function fetchApi<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { token: paramToken, retry = true, maxRetries = 3, ...fetchOptions } = options;
  
  // If token is passed explicitly, use it. Otherwise get from storage.
  // Also get workspaceId from storage to attach to every request.
  const context = getAuthContext();
  const token = paramToken || context.token;
  const workspaceId = context.workspaceId;
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(workspaceId && { 'X-Workspace-ID': workspaceId }),
    ...options.headers,
  };

  let lastError: Error | null = null;
  const isIdempotent = !fetchOptions.method || fetchOptions.method === 'GET' || fetchOptions.method === 'HEAD';

  for (let attempt = 0; attempt <= (retry && isIdempotent ? maxRetries : 0); attempt++) {
    try {
      if (attempt > 0) {
        const delay = getRetryDelay(attempt - 1);
        console.log(`[API] Retry attempt ${attempt}/${maxRetries} after ${delay}ms`);
        await sleep(delay);
      }

      const response = await fetch(`${API_URL}${endpoint}`, {
        ...fetchOptions,
        headers,
        credentials: 'include', // Ensure cookies are sent with requests
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
        const error = new ApiError(
          errorData.error || 'Request failed',
          response.status,
          errorData.code
        );

        // Don't retry client errors (except 429 rate limit)
        if (!error.isRetryable) {
          throw error;
        }

        lastError = error;
        continue;
      }

      return response.json();
    } catch (error) {
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        lastError = new ApiError(
          'Unable to connect to server. Please check your internet connection.',
          0
        );
        continue;
      }
      
      if (error instanceof ApiError && !error.isRetryable) {
        throw error;
      }

      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  // All retries exhausted
  throw lastError || new ApiError('Request failed after retries', 0);
}

interface AuthContext {
  token: string;
  workspaceId: string;
}

/**
 * Gets the auth context (token and workspaceId) from Zustand persisted storage.
 */
function getAuthContext(): AuthContext {
  if (typeof window === 'undefined') return { token: '', workspaceId: '' };
  try {
    const stored = localStorage.getItem('pulseweave-storage');
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        token: parsed?.state?.token || '',
        workspaceId: parsed?.state?.currentWorkspace?.id || '',
      };
    }
  } catch {
    // Ignore parse errors
  }
  return { token: '', workspaceId: '' };
}

// Keep backward compatibility for now if needed, or just remove usage
function getToken(): string {
  return getAuthContext().token;
}

export const api = {
  // Generic methods for new endpoints
  get: <T>(endpoint: string) =>
    fetchApi<T>(`/api${endpoint}`, { token: getToken() }),
  
  post: <T>(endpoint: string, data: unknown) =>
    fetchApi<T>(`/api${endpoint}`, {
      method: 'POST',
      body: JSON.stringify(data),
      token: getToken(),
    }),
  
  patch: <T>(endpoint: string, data: unknown) =>
    fetchApi<T>(`/api${endpoint}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      token: getToken(),
    }),
  
  delete: <T>(endpoint: string) =>
    fetchApi<T>(`/api${endpoint}`, {
      method: 'DELETE',
      token: getToken(),
    }),

  users: {
    getMe: (token: string) =>
      fetchApi<User>('/api/users/me', { token }),
    update: (data: { displayName?: string; status?: string; avatarUrl?: string }, token: string) =>
      fetchApi<User>('/api/users/me', {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),
    updateProfile: (data: { displayName?: string; username?: string; status?: string; statusMessage?: string | null; avatarUrl?: string | null }, token: string) =>
      fetchApi<User>('/api/users/me', {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),
    changePassword: (currentPassword: string, newPassword: string, token: string) =>
      fetchApi<{ success: boolean }>('/api/users/me/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
        token,
      }),
    deleteAccount: (password: string, token: string) =>
      fetchApi<{ success: boolean }>('/api/users/me', {
        method: 'DELETE',
        body: JSON.stringify({ password }),
        token,
      }),
    get: (userId: string, token: string) =>
      fetchApi<User>(`/api/users/${userId}`, { token }),
  },
  auth: {
    register: (data: { email: string; username: string; displayName: string; password: string }) =>
      fetchApi<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    login: (data: { email: string; password: string }) =>
      fetchApi<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    me: (token: string) =>
      fetchApi<User>('/api/auth/me', { token }),
  },
  invites: {
    create: (data: { workspaceId: string; maxUses?: number; expiresInHours?: number }, token: string) =>
      fetchApi<InviteLink>('/api/invites', {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    list: (workspaceId: string, token: string) =>
      fetchApi<InviteLink[]>(`/api/invites/workspace/${workspaceId}`, { token }),
    revoke: (inviteId: string, token: string) =>
      fetchApi<SuccessResponse>(`/api/invites/${inviteId}`, {
        method: 'DELETE',
        token,
      }),
    getInfo: (code: string, token?: string) =>
      fetchApi<InviteInfo>(`/api/invites/info/${code}`, { token }),
    use: (code: string, token: string) =>
      fetchApi<WorkspaceJoinResult>(`/api/invites/use/${code}`, {
        method: 'POST',
        token,
      }),
  },
  workspaces: {
    list: (token: string) =>
      fetchApi<Workspace[]>('/api/workspaces', { token }),
    get: (id: string, token: string) =>
      fetchApi<WorkspaceDetail>(`/api/workspaces/${id}`, { token }),
    create: (data: { name: string; slug: string }, token: string) =>
      fetchApi<Workspace>('/api/workspaces', {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    update: (id: string, data: { name?: string; iconUrl?: string }, token: string) =>
      fetchApi<Workspace>(`/api/workspaces/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),
    delete: (id: string, token: string) =>
      fetchApi<{ success: boolean; message: string }>(`/api/workspaces/${id}`, {
        method: 'DELETE',
        token,
      }),
    leave: (id: string, token: string) =>
      fetchApi<{ success: boolean; message: string }>(`/api/workspaces/${id}/leave`, {
        method: 'POST',
        token,
      }),
    getBySlug: (slug: string, token?: string) =>
      fetchApi<WorkspaceJoinInfo>(
        `/api/workspaces/join/${slug}`,
        { token }
      ),
    joinBySlug: (slug: string, token: string) =>
      fetchApi<WorkspaceJoinResult>(
        `/api/workspaces/join/${slug}`,
        {
          method: 'POST',
          token,
        }
      ),
  },
  channels: {
    get: (id: string, token: string) =>
      fetchApi<Channel>(`/api/channels/${id}`, { token }),
    create: (data: { workspaceId: string; name: string; description?: string; isPrivate?: boolean }, token: string) =>
      fetchApi<Channel>('/api/channels', {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    update: (id: string, data: { name?: string; description?: string; isPrivate?: boolean }, token: string) =>
      fetchApi<Channel>(`/api/channels/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),
    delete: (id: string, token: string) =>
      fetchApi<SuccessResponse>(`/api/channels/${id}`, {
        method: 'DELETE',
        token,
      }),
    join: (id: string, token: string) =>
      fetchApi<SuccessResponse>(`/api/channels/${id}/join`, {
        method: 'POST',
        token,
      }),
    leave: (id: string, token: string) =>
      fetchApi<{ success: boolean; message: string }>(`/api/channels/${id}/leave`, {
        method: 'POST',
        token,
      }),
  },
  dm: {
    list: (workspaceId: string, token: string) =>
      fetchApi<Conversation[]>(`/api/dm/workspace/${workspaceId}`, { token }),
    start: (workspaceId: string, userId: string, token: string) =>
      fetchApi<Conversation>('/api/dm/start', {
        method: 'POST',
        body: JSON.stringify({ workspaceId, userId }),
        token,
      }),
    getMessages: (conversationId: string, token: string) =>
      fetchApi<PaginatedDmMessages>(
        `/api/dm/${conversationId}/messages`,
        { token }
      ),
    sendMessage: (conversationId: string, content: string, token: string) =>
      fetchApi<DirectMessage>(`/api/dm/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
        token,
      }),
    createGroup: (workspaceId: string, memberIds: string[], name: string | undefined, token: string) =>
      fetchApi<Conversation>('/api/dm/group', {
        method: 'POST',
        body: JSON.stringify({ workspaceId, memberIds, name }),
        token,
      }),
  },
  messages: {
    search: (workspaceId: string, query: string, token: string, cursor?: string) =>
      fetchApi<PaginatedSearchResults>(
        `/api/messages/search?workspaceId=${workspaceId}&q=${encodeURIComponent(query)}${cursor ? `&cursor=${cursor}` : ''}`,
        { token }
      ),
    list: (channelId: string, token: string, cursor?: string) =>
      fetchApi<PaginatedMessages>(
        `/api/messages/channel/${channelId}${cursor ? `?cursor=${cursor}` : ''}`,
        { token }
      ),
    create: (data: { channelId: string; content: string; parentId?: string }, token: string) =>
      fetchApi<Message>('/api/messages', {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    update: (id: string, content: string, token: string) =>
      fetchApi<Message>(`/api/messages/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
        token,
      }),
    delete: (id: string, token: string) =>
      fetchApi<SuccessResponse>(`/api/messages/${id}`, {
        method: 'DELETE',
        token,
      }),
    addReaction: (id: string, emoji: string, token: string) =>
      fetchApi<SuccessResponse>(`/api/messages/${id}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
        token,
      }),
    removeReaction: (id: string, emoji: string, token: string) =>
      fetchApi<SuccessResponse>(`/api/messages/${id}/reactions/${emoji}`, {
        method: 'DELETE',
        token,
      }),
    pin: (id: string, token: string) =>
      fetchApi<SuccessResponse>(`/api/messages/${id}/pin`, {
        method: 'POST',
        token,
      }),
    unpin: (id: string, token: string) =>
      fetchApi<SuccessResponse>(`/api/messages/${id}/pin`, {
        method: 'DELETE',
        token,
      }),
    getPinned: (channelId: string, token: string) =>
      fetchApi<Message[]>(`/api/messages/channel/${channelId}/pinned`, { token }),

  },
  upload: {
    single: async (file: File, token: string) => {
      const formData = new FormData();
      formData.append('file', file);
      const { workspaceId } = getAuthContext();
      
      const response = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(workspaceId && { 'X-Workspace-ID': workspaceId }),
        },
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(error.error || 'Upload failed');
      }
      
      return response.json();
    },
    multiple: async (files: File[], token: string) => {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      const { workspaceId } = getAuthContext();
      
      const response = await fetch(`${API_URL}/api/upload/multiple`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(workspaceId && { 'X-Workspace-ID': workspaceId }),
        },
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(error.error || 'Upload failed');
      }
      
      return response.json();
    },
    delete: (filename: string, token: string) =>
      fetchApi<{ success: boolean }>(`/api/upload/${filename}`, {
        method: 'DELETE',
        token,
      }),
    getUrl: (filename: string) => `${API_URL}/uploads/${filename}`,
  },
  categories: {
    list: (workspaceId: string, token: string) =>
      fetchApi<ChannelCategory[]>(`/api/categories/workspace/${workspaceId}`, { token }),
    create: (data: { name: string; workspaceId: string }, token: string) =>
      fetchApi<ChannelCategory>('/api/categories', {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    update: (id: string, data: { name?: string; position?: number; isCollapsed?: boolean }, token: string) =>
      fetchApi<ChannelCategory>(`/api/categories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),
    delete: (id: string, token: string) =>
      fetchApi<{ success: boolean }>(`/api/categories/${id}`, {
        method: 'DELETE',
        token,
      }),
    moveChannel: (categoryId: string, channelId: string, position: number, token: string) =>
      fetchApi<SuccessResponse>(`/api/categories/${categoryId}/channels/${channelId}`, {
        method: 'POST',
        body: JSON.stringify({ position }),
        token,
      }),
  },
  scheduled: {
    list: (token: string) =>
      fetchApi<ScheduledMessage[]>('/api/scheduled', { token }),
    listByChannel: (channelId: string, token: string) =>
      fetchApi<ScheduledMessage[]>(`/api/scheduled/channel/${channelId}`, { token }),
    create: (data: { content: string; channelId: string; scheduledAt: string }, token: string) =>
      fetchApi<ScheduledMessage>('/api/scheduled', {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    update: (id: string, data: { content?: string; scheduledAt?: string }, token: string) =>
      fetchApi<ScheduledMessage>(`/api/scheduled/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),
    cancel: (id: string, token: string) =>
      fetchApi<{ success: boolean }>(`/api/scheduled/${id}`, {
        method: 'DELETE',
        token,
      }),
    sendNow: (id: string, token: string) =>
      fetchApi<Message>(`/api/scheduled/${id}/send-now`, {
        method: 'POST',
        token,
      }),
  },

  // Webhooks
  webhooks: {
    getEvents: (token: string) =>
      fetchApi<Record<string, string>>('/api/webhooks/events', { token }),
    list: (workspaceId: string, token: string) =>
      fetchApi<Webhook[]>(`/api/webhooks/workspace/${workspaceId}`, { token }),
    create: (workspaceId: string, data: { name: string; url: string; events: string[]; secret?: string; headers?: Record<string, string> }, token: string) =>
      fetchApi<Webhook>(`/api/webhooks/workspace/${workspaceId}`, {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    update: (id: string, data: { name?: string; url?: string; events?: string[]; isActive?: boolean }, token: string) =>
      fetchApi<Webhook>(`/api/webhooks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),
    delete: (id: string, token: string) =>
      fetchApi<{ success: boolean }>(`/api/webhooks/${id}`, {
        method: 'DELETE',
        token,
      }),
    test: (id: string, token: string) =>
      fetchApi<{ success: boolean; statusCode?: number; response?: string; error?: string }>(`/api/webhooks/${id}/test`, {
        method: 'POST',
        token,
      }),
    getDeliveries: (id: string, token: string, page = 1) =>
      fetchApi<PaginatedDeliveries>(`/api/webhooks/${id}/deliveries?page=${page}`, { token }),
  },

  // Incoming Webhooks
  incomingWebhooks: {
    list: (workspaceId: string, token: string) =>
      fetchApi<IncomingWebhook[]>(`/api/webhooks/incoming/workspace/${workspaceId}`, { token }),
    create: (workspaceId: string, data: { name: string; channelId?: string; allowedIps?: string[] }, token: string) =>
      fetchApi<IncomingWebhook>(`/api/webhooks/incoming/workspace/${workspaceId}`, {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    update: (id: string, data: { name?: string; channelId?: string; allowedIps?: string[]; isActive?: boolean }, token: string) =>
      fetchApi<IncomingWebhook>(`/api/webhooks/incoming/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),
    delete: (id: string, token: string) =>
      fetchApi<{ success: boolean }>(`/api/webhooks/incoming/${id}`, {
        method: 'DELETE',
        token,
      }),
    regenerate: (id: string, token: string) =>
      fetchApi<IncomingWebhook>(`/api/webhooks/incoming/${id}/regenerate`, {
        method: 'POST',
        token,
      }),
  },

  // API Keys
  apiKeys: {
    getScopes: (token: string) =>
      fetchApi<Record<string, string>>('/api/apikeys/scopes', { token }),
    list: (workspaceId: string, token: string) =>
      fetchApi<ApiKey[]>(`/api/apikeys/workspace/${workspaceId}`, { token }),
    create: (workspaceId: string, data: { name: string; scopes: string[]; expiresAt?: string }, token: string) =>
      fetchApi<ApiKey>(`/api/apikeys/workspace/${workspaceId}`, {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    update: (id: string, data: { name?: string; scopes?: string[]; isActive?: boolean; expiresAt?: string | null }, token: string) =>
      fetchApi<ApiKey>(`/api/apikeys/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),
    delete: (id: string, token: string) =>
      fetchApi<{ success: boolean }>(`/api/apikeys/${id}`, {
        method: 'DELETE',
        token,
      }),
    regenerate: (id: string, token: string) =>
      fetchApi<ApiKey>(`/api/apikeys/${id}/regenerate`, {
        method: 'POST',
        token,
      }),
  },

  // Integrations
  integrations: {
    getTypes: (token: string) =>
      fetchApi<IntegrationTypes>('/api/integrations/types', { token }),
    list: (workspaceId: string, token: string) =>
      fetchApi<Integration[]>(`/api/integrations/workspace/${workspaceId}`, { token }),
    get: (id: string, token: string) =>
      fetchApi<Integration>(`/api/integrations/${id}`, { token }),
    create: (workspaceId: string, data: { type: string; name: string; config: Record<string, unknown> }, token: string) =>
      fetchApi<Integration>(`/api/integrations/workspace/${workspaceId}`, {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    update: (id: string, data: { name?: string; config?: Record<string, unknown>; isActive?: boolean }, token: string) =>
      fetchApi<Integration>(`/api/integrations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),
    delete: (id: string, token: string) =>
      fetchApi<{ success: boolean }>(`/api/integrations/${id}`, {
        method: 'DELETE',
        token,
      }),
    test: (id: string, token: string) =>
      fetchApi<{ success: boolean; statusCode?: number; response?: string; error?: string }>(`/api/integrations/${id}/test`, {
        method: 'POST',
        token,
      }),
  },
  preferences: {
    get: () =>
      fetchApi<UserPreferences>('/api/preferences', { token: getToken() }),
    update: (data: Partial<UserPreferences>) =>
      fetchApi<UserPreferences>('/api/preferences', {
        method: 'PATCH',
        body: JSON.stringify(data),
        token: getToken(),
      }),
    reset: () =>
      fetchApi<UserPreferences>('/api/preferences/reset', {
        method: 'POST',
        token: getToken(),
      }),
  },
  admin: {
    getWorkspaceUsers: (workspaceId: string, token: string, params?: { page?: number; limit?: number; search?: string; role?: string }) => {
      const queryParams = new URLSearchParams();
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.search) queryParams.append('search', params.search);
      if (params?.role) queryParams.append('role', params.role);
      
      return fetchApi<PaginatedUsers>(
        `/api/admin/workspaces/${workspaceId}/users?${queryParams.toString()}`,
        { token }
      );
    },
    updateUserRole: (workspaceId: string, userId: string, roleName: string, token: string) =>
      fetchApi<{ success: boolean; message: string }>(
        `/api/admin/workspaces/${workspaceId}/users/${userId}/role`,
        {
          method: 'PATCH',
          body: JSON.stringify({ roleName }),
          token,
        }
      ),
    removeUser: (workspaceId: string, userId: string, token: string) =>
      fetchApi<{ success: boolean; message: string }>(
        `/api/admin/workspaces/${workspaceId}/users/${userId}`,
        {
          method: 'DELETE',
          token,
        }
      ),
    banUser: (workspaceId: string, userId: string, data: { reason?: string; duration?: number }, token: string) =>
      fetchApi<{ success: boolean; message: string }>(
        `/api/admin/workspaces/${workspaceId}/users/${userId}/ban`,
        {
          method: 'POST',
          body: JSON.stringify(data),
          token,
        }
      ),
    unbanUser: (workspaceId: string, userId: string, token: string) =>
      fetchApi<{ success: boolean; message: string }>(
        `/api/admin/workspaces/${workspaceId}/users/${userId}/unban`,
        {
          method: 'POST',
          token,
        }
      ),
    getAuditLog: (workspaceId: string, token: string, params?: { page?: number; limit?: number; action?: string; userId?: string }) => {
      const queryParams = new URLSearchParams();
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.action) queryParams.append('action', params.action);
      if (params?.userId) queryParams.append('userId', params.userId);

      return fetchApi<PaginatedAuditLog>(
        `/api/admin/workspaces/${workspaceId}/audit-log?${queryParams.toString()}`,
        { token }
      );
    },
  },
  notifications: {
    subscribe: (data: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
      fetchApi<{ success: boolean }>('/api/notifications/subscribe', {
        method: 'POST',
        body: JSON.stringify(data),
        token: getToken(),
      }),
    unsubscribe: (endpoint: string) =>
      fetchApi<{ success: boolean }>('/api/notifications/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint }),
        token: getToken(),
      }),
    test: () =>
      fetchApi<{ success: boolean }>('/api/notifications/test', {
        method: 'POST',
        token: getToken(),
      }),
  },
};

export interface UserPreferences {
  id: string;
  userId: string;
  theme: 'dark' | 'light' | 'corporate' | 'midnight' | 'system';
  desktopNotifications: boolean;
  soundEnabled: boolean;
  notificationPreview: boolean;
  mentionNotifications: boolean;
  dmNotifications: boolean;
  channelNotifications: boolean;
  threadReplies: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  idleTimeout: number;
  awayTimeout: number;
}
