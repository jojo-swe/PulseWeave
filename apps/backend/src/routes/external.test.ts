import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('@pulseweave/database', () => ({
  prisma: {
    workspace: { findUnique: vi.fn() },
    channel: { findFirst: vi.fn(), findMany: vi.fn() },
    message: { findMany: vi.fn(), create: vi.fn() },
    workspaceMember: { findMany: vi.fn(), findUnique: vi.fn() },
  },
  Prisma: {},
}));

vi.mock('./apikey', () => ({
  authenticateApiKey: (_scope?: string) => (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'API key required' });
    }
    // Simulate successful auth
    (req as unknown as { apiKey: unknown }).apiKey = { id: 'key-1', name: 'test', scopes: '["*"]', workspaceId: 'ws-1', userId: 'test-user-id' };
    (req as unknown as { apiScopes: string[] }).apiScopes = ['*'];
    (req as unknown as { workspaceId: string }).workspaceId = 'ws-1';
    (req as unknown as { userId: string }).userId = 'test-user-id';
    next();
  },
  hasScope: (scopes: string[], required: string) => scopes.includes('*') || scopes.includes(required),
}));

const { dispatchWebhookEvent } = vi.hoisted(() => ({ dispatchWebhookEvent: vi.fn() }));
vi.mock('../services/webhooks', () => ({ dispatchWebhookEvent }));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { prisma } from '@pulseweave/database';
import externalRouter from './external';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/external', externalRouter);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof Error) {
      const status = (err as Error & { statusCode?: number }).statusCode ?? 500;
      res.status(status).json({ error: err.message, code: (err as Error & { code?: string }).code });
    } else {
      res.status(500).json({ error: 'Unknown error' });
    }
  });
  return app;
}

const authHeader = { Authorization: 'Bearer pw_testkey123' };

describe('external routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /external/workspace', () => {
    it('should return workspace info', async () => {
      vi.mocked(prisma.workspace.findUnique).mockResolvedValue({
        id: 'ws-1', name: 'Test', slug: 'test', iconUrl: null, createdAt: new Date(),
        _count: { members: 5, channels: 3 },
      } as never);

      const res = await request(createApp()).get('/external/workspace').set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('ws-1');
    });

    it('should return 401 without auth', async () => {
      const res = await request(createApp()).get('/external/workspace');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /external/channels', () => {
    it('should list channels', async () => {
      vi.mocked(prisma.channel.findMany).mockResolvedValue([
        { id: 'ch-1', name: 'general', description: 'General', isPrivate: false, createdAt: new Date(), _count: { members: 5, messages: 10 } },
      ] as never);

      const res = await request(createApp()).get('/external/channels').set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.channels).toHaveLength(1);
    });
  });

  describe('GET /external/channels/:channelId', () => {
    it('should return channel by ID', async () => {
      vi.mocked(prisma.channel.findFirst).mockResolvedValue({
        id: 'ch-1', name: 'general', description: 'General', isPrivate: false, createdAt: new Date(), _count: { members: 5, messages: 10 },
      } as never);

      const res = await request(createApp()).get('/external/channels/ch-1').set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('ch-1');
    });

    it('should return 404 if channel not found', async () => {
      vi.mocked(prisma.channel.findFirst).mockResolvedValue(null);

      const res = await request(createApp()).get('/external/channels/nonexistent').set(authHeader);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /external/channels/:channelId/messages', () => {
    it('should list messages in a channel', async () => {
      vi.mocked(prisma.channel.findFirst).mockResolvedValue({ id: 'ch-1' } as never);
      vi.mocked(prisma.message.findMany).mockResolvedValue([
        { id: 'msg-1', content: 'Hello', createdAt: new Date(), updatedAt: new Date(), isEdited: false, isPinned: false, user: { id: 'u1', username: 'user1', displayName: 'User 1', avatarUrl: null }, attachments: [], reactions: [] },
      ] as never);

      const res = await request(createApp()).get('/external/channels/ch-1/messages').set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(1);
    });

    it('should return 404 if channel not found', async () => {
      vi.mocked(prisma.channel.findFirst).mockResolvedValue(null);

      const res = await request(createApp()).get('/external/channels/nonexistent/messages').set(authHeader);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /external/channels/:channelId/messages', () => {
    it('should send a message', async () => {
      vi.mocked(prisma.channel.findFirst).mockResolvedValue({ id: 'ch-1', name: 'general' } as never);
      vi.mocked(prisma.message.create).mockResolvedValue({
        id: 'msg-new', content: 'Hello', channelId: 'ch-1', userId: 'test-user-id', createdAt: new Date(),
        user: { id: 'test-user-id', username: 'me', displayName: 'Me', avatarUrl: null },
        attachments: [], reactions: [],
      } as never);
      dispatchWebhookEvent.mockResolvedValue(undefined);

      const res = await request(createApp())
        .post('/external/channels/ch-1/messages')
        .set(authHeader)
        .send({ content: 'Hello' });

      expect(res.status).toBe(201);
      expect(res.body.content).toBe('Hello');
      expect(dispatchWebhookEvent).toHaveBeenCalled();
    });

    it('should return 404 if channel not found', async () => {
      vi.mocked(prisma.channel.findFirst).mockResolvedValue(null);

      const res = await request(createApp())
        .post('/external/channels/nonexistent/messages')
        .set(authHeader)
        .send({ content: 'Hello' });

      expect(res.status).toBe(404);
    });

    it('should reject empty content', async () => {
      const res = await request(createApp())
        .post('/external/channels/ch-1/messages')
        .set(authHeader)
        .send({ content: '' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /external/members', () => {
    it('should list workspace members', async () => {
      vi.mocked(prisma.workspaceMember.findMany).mockResolvedValue([
        {
          id: 'mem-1', roleName: 'member', joinedAt: new Date(),
          user: { id: 'u1', username: 'user1', displayName: 'User 1', avatarUrl: null, status: 'online' },
        },
      ] as never);

      const res = await request(createApp()).get('/external/members').set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.members).toHaveLength(1);
      expect(res.body.members[0].userId).toBe('u1');
    });
  });

  describe('GET /external/users/:userId', () => {
    it('should return user by ID', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        roleName: 'member', joinedAt: new Date(),
        user: { id: 'u1', username: 'user1', displayName: 'User 1', avatarUrl: null, status: 'online', statusMessage: null, createdAt: new Date() },
      } as never);

      const res = await request(createApp()).get('/external/users/u1').set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('u1');
    });

    it('should return 404 if user not in workspace', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).get('/external/users/nonexistent').set(authHeader);

      expect(res.status).toBe(404);
    });
  });
});
