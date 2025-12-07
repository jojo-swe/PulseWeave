const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface FetchOptions extends RequestInit {
  token?: string;
}

async function fetchApi<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { token, ...fetchOptions } = options;
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...fetchOptions,
      headers,
      credentials: 'include', // Ensure cookies are sent with requests
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error('Unable to connect to server. Please ensure the backend is running on http://localhost:3001');
    }
    throw error;
  }
}

/**
 * Gets the auth token from Zustand persisted storage.
 */
function getToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    const stored = localStorage.getItem('pulseweave-storage');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed?.state?.token || '';
    }
  } catch {
    // Ignore parse errors
  }
  return '';
}

export const api = {
  // Generic methods for new endpoints
  get: <T>(endpoint: string) =>
    fetchApi<T>(`/api${endpoint}`, { token: getToken() }),
  
  post: <T>(endpoint: string, data: any) =>
    fetchApi<T>(`/api${endpoint}`, {
      method: 'POST',
      body: JSON.stringify(data),
      token: getToken(),
    }),
  
  patch: <T>(endpoint: string, data: any) =>
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
      fetchApi<any>('/api/users/me', { token }),
    update: (data: { displayName?: string; status?: string; avatarUrl?: string }, token: string) =>
      fetchApi<any>('/api/users/me', {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),
    updateProfile: (data: { displayName?: string; username?: string; status?: string; statusMessage?: string | null; avatarUrl?: string | null }, token: string) =>
      fetchApi<any>('/api/users/me', {
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
      fetchApi<any>(`/api/users/${userId}`, { token }),
  },
  auth: {
    register: (data: { email: string; username: string; displayName: string; password: string }) =>
      fetchApi<{ user: any; token: string; workspace: any }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    login: (data: { email: string; password: string }) =>
      fetchApi<{ user: any; token: string; workspace: any }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    me: (token: string) =>
      fetchApi<any>('/api/auth/me', { token }),
  },
  workspaces: {
    list: (token: string) =>
      fetchApi<any[]>('/api/workspaces', { token }),
    get: (id: string, token: string) =>
      fetchApi<any>(`/api/workspaces/${id}`, { token }),
    create: (data: { name: string; slug: string }, token: string) =>
      fetchApi<any>('/api/workspaces', {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    update: (id: string, data: { name?: string; iconUrl?: string }, token: string) =>
      fetchApi<any>(`/api/workspaces/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),
  },
  channels: {
    get: (id: string, token: string) =>
      fetchApi<any>(`/api/channels/${id}`, { token }),
    create: (data: { workspaceId: string; name: string; description?: string; isPrivate?: boolean }, token: string) =>
      fetchApi<any>('/api/channels', {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    update: (id: string, data: { name?: string; description?: string; isPrivate?: boolean }, token: string) =>
      fetchApi<any>(`/api/channels/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),
    delete: (id: string, token: string) =>
      fetchApi<any>(`/api/channels/${id}`, {
        method: 'DELETE',
        token,
      }),
    join: (id: string, token: string) =>
      fetchApi<any>(`/api/channels/${id}/join`, {
        method: 'POST',
        token,
      }),
  },
  dm: {
    list: (workspaceId: string, token: string) =>
      fetchApi<any[]>(`/api/dm/workspace/${workspaceId}`, { token }),
    start: (workspaceId: string, userId: string, token: string) =>
      fetchApi<any>('/api/dm/start', {
        method: 'POST',
        body: JSON.stringify({ workspaceId, userId }),
        token,
      }),
    getMessages: (conversationId: string, token: string) =>
      fetchApi<{ messages: any[]; nextCursor: string | null }>(
        `/api/dm/${conversationId}/messages`,
        { token }
      ),
    sendMessage: (conversationId: string, content: string, token: string) =>
      fetchApi<any>(`/api/dm/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
        token,
      }),
    createGroup: (workspaceId: string, memberIds: string[], name: string | undefined, token: string) =>
      fetchApi<any>('/api/dm/group', {
        method: 'POST',
        body: JSON.stringify({ workspaceId, memberIds, name }),
        token,
      }),
  },
  messages: {
    list: (channelId: string, token: string, cursor?: string) =>
      fetchApi<{ messages: any[]; nextCursor: string | null }>(
        `/api/messages/channel/${channelId}${cursor ? `?cursor=${cursor}` : ''}`,
        { token }
      ),
    create: (data: { channelId: string; content: string; parentId?: string }, token: string) =>
      fetchApi<any>('/api/messages', {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    update: (id: string, content: string, token: string) =>
      fetchApi<any>(`/api/messages/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
        token,
      }),
    delete: (id: string, token: string) =>
      fetchApi<any>(`/api/messages/${id}`, {
        method: 'DELETE',
        token,
      }),
    addReaction: (id: string, emoji: string, token: string) =>
      fetchApi<any>(`/api/messages/${id}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
        token,
      }),
    removeReaction: (id: string, emoji: string, token: string) =>
      fetchApi<any>(`/api/messages/${id}/reactions/${emoji}`, {
        method: 'DELETE',
        token,
      }),
    pin: (id: string, token: string) =>
      fetchApi<any>(`/api/messages/${id}/pin`, {
        method: 'POST',
        token,
      }),
    unpin: (id: string, token: string) =>
      fetchApi<any>(`/api/messages/${id}/pin`, {
        method: 'DELETE',
        token,
      }),
    getPinned: (channelId: string, token: string) =>
      fetchApi<any[]>(`/api/messages/channel/${channelId}/pinned`, { token }),
    search: (workspaceId: string, query: string, token: string) =>
      fetchApi<any[]>(`/api/messages/search?workspaceId=${workspaceId}&q=${encodeURIComponent(query)}`, { token }),
  },
  upload: {
    single: async (file: File, token: string) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
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
      
      const response = await fetch(`${API_URL}/api/upload/multiple`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
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
      fetchApi<any[]>(`/api/categories/workspace/${workspaceId}`, { token }),
    create: (data: { name: string; workspaceId: string }, token: string) =>
      fetchApi<any>('/api/categories', {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    update: (id: string, data: { name?: string; position?: number; isCollapsed?: boolean }, token: string) =>
      fetchApi<any>(`/api/categories/${id}`, {
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
      fetchApi<any>(`/api/categories/${categoryId}/channels/${channelId}`, {
        method: 'POST',
        body: JSON.stringify({ position }),
        token,
      }),
  },
  scheduled: {
    list: (token: string) =>
      fetchApi<any[]>('/api/scheduled', { token }),
    listByChannel: (channelId: string, token: string) =>
      fetchApi<any[]>(`/api/scheduled/channel/${channelId}`, { token }),
    create: (data: { content: string; channelId: string; scheduledAt: string }, token: string) =>
      fetchApi<any>('/api/scheduled', {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    update: (id: string, data: { content?: string; scheduledAt?: string }, token: string) =>
      fetchApi<any>(`/api/scheduled/${id}`, {
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
      fetchApi<any>(`/api/scheduled/${id}/send-now`, {
        method: 'POST',
        token,
      }),
  },

  // Webhooks
  webhooks: {
    getEvents: (token: string) =>
      fetchApi<Record<string, string>>('/api/webhooks/events', { token }),
    list: (workspaceId: string, token: string) =>
      fetchApi<any[]>(`/api/webhooks/workspace/${workspaceId}`, { token }),
    create: (workspaceId: string, data: { name: string; url: string; events: string[]; secret?: string; headers?: Record<string, string> }, token: string) =>
      fetchApi<any>(`/api/webhooks/workspace/${workspaceId}`, {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    update: (id: string, data: { name?: string; url?: string; events?: string[]; isActive?: boolean }, token: string) =>
      fetchApi<any>(`/api/webhooks/${id}`, {
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
      fetchApi<{ deliveries: any[]; pagination: any }>(`/api/webhooks/${id}/deliveries?page=${page}`, { token }),
  },

  // Incoming Webhooks
  incomingWebhooks: {
    list: (workspaceId: string, token: string) =>
      fetchApi<any[]>(`/api/webhooks/incoming/workspace/${workspaceId}`, { token }),
    create: (workspaceId: string, data: { name: string; channelId?: string; allowedIps?: string[] }, token: string) =>
      fetchApi<any>(`/api/webhooks/incoming/workspace/${workspaceId}`, {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    update: (id: string, data: { name?: string; channelId?: string; allowedIps?: string[]; isActive?: boolean }, token: string) =>
      fetchApi<any>(`/api/webhooks/incoming/${id}`, {
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
      fetchApi<any>(`/api/webhooks/incoming/${id}/regenerate`, {
        method: 'POST',
        token,
      }),
  },

  // API Keys
  apiKeys: {
    getScopes: (token: string) =>
      fetchApi<Record<string, string>>('/api/apikeys/scopes', { token }),
    list: (workspaceId: string, token: string) =>
      fetchApi<any[]>(`/api/apikeys/workspace/${workspaceId}`, { token }),
    create: (workspaceId: string, data: { name: string; scopes: string[]; expiresAt?: string }, token: string) =>
      fetchApi<any>(`/api/apikeys/workspace/${workspaceId}`, {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    update: (id: string, data: { name?: string; scopes?: string[]; isActive?: boolean; expiresAt?: string | null }, token: string) =>
      fetchApi<any>(`/api/apikeys/${id}`, {
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
      fetchApi<any>(`/api/apikeys/${id}/regenerate`, {
        method: 'POST',
        token,
      }),
  },

  // Integrations
  integrations: {
    getTypes: (token: string) =>
      fetchApi<Record<string, any>>('/api/integrations/types', { token }),
    list: (workspaceId: string, token: string) =>
      fetchApi<any[]>(`/api/integrations/workspace/${workspaceId}`, { token }),
    get: (id: string, token: string) =>
      fetchApi<any>(`/api/integrations/${id}`, { token }),
    create: (workspaceId: string, data: { type: string; name: string; config: Record<string, any> }, token: string) =>
      fetchApi<any>(`/api/integrations/workspace/${workspaceId}`, {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    update: (id: string, data: { name?: string; config?: Record<string, any>; isActive?: boolean }, token: string) =>
      fetchApi<any>(`/api/integrations/${id}`, {
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
