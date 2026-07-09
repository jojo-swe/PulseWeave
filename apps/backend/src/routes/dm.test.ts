import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('@pulseweave/database', () => ({
  prisma: {
    conversation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    conversationMember: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    directMessage: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { userId: string }).userId = 'test-user-id';
    next();
  },
  AuthRequest: class AuthRequest {},
}));

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { prisma } from '@pulseweave/database';
import { dmRouter } from './dm';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { userId: string }).userId = 'test-user-id';
    next();
  });
  app.use('/dm', dmRouter);
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

describe('dm routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /dm/workspace/:workspaceId', () => {
    it('should return conversations for current user', async () => {
      vi.mocked(prisma.conversation.findMany).mockResolvedValue([
        {
          id: 'conv-1',
          isGroup: false,
          name: null,
          members: [{ user: { id: 'u1', username: 'user1', displayName: 'User One', avatarUrl: null, status: 'online' } }],
          messages: [],
          updatedAt: new Date(),
        },
      ] as never);

      const res = await request(createApp()).get('/dm/workspace/ws-1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('conv-1');
    });
  });

  describe('POST /dm/start', () => {
    it('should return existing conversation if found', async () => {
      vi.mocked(prisma.conversation.findFirst).mockResolvedValue({
        id: 'conv-1',
        isGroup: false,
        name: null,
        members: [
          { user: { id: 'test-user-id', username: 'me', displayName: 'Me', avatarUrl: null, status: 'online' } },
          { user: { id: 'u2', username: 'user2', displayName: 'User Two', avatarUrl: null, status: 'offline' } },
        ],
      } as never);

      const res = await request(createApp())
        .post('/dm/start')
        .send({ workspaceId: 'ws-1', userId: 'u2' });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('conv-1');
    });

    it('should create new conversation if not found', async () => {
      vi.mocked(prisma.conversation.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.conversation.create).mockResolvedValue({
        id: 'conv-new',
        isGroup: false,
        name: null,
        members: [
          { user: { id: 'test-user-id', username: 'me', displayName: 'Me', avatarUrl: null, status: 'online' } },
          { user: { id: 'u2', username: 'user2', displayName: 'User Two', avatarUrl: null, status: 'offline' } },
        ],
      } as never);

      const res = await request(createApp())
        .post('/dm/start')
        .send({ workspaceId: 'ws-1', userId: 'u2' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('conv-new');
    });

    it('should reject missing workspaceId', async () => {
      const res = await request(createApp())
        .post('/dm/start')
        .send({ userId: 'u2' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /dm/:id/messages', () => {
    it('should return messages for conversation member', async () => {
      vi.mocked(prisma.conversationMember.findUnique).mockResolvedValue({
        userId: 'test-user-id',
        conversationId: 'conv-1',
      } as never);
      vi.mocked(prisma.directMessage.findMany).mockResolvedValue([
        { id: 'msg-1', content: 'Hello', user: { id: 'u1', username: 'user1', displayName: 'User One', avatarUrl: null } },
      ] as never);
      vi.mocked(prisma.conversationMember.update).mockResolvedValue({} as never);

      const res = await request(createApp()).get('/dm/conv-1/messages');

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(1);
      expect(res.body.messages[0].content).toBe('Hello');
    });

    it('should return 403 if not conversation member', async () => {
      vi.mocked(prisma.conversationMember.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).get('/dm/conv-1/messages');

      expect(res.status).toBe(403);
    });

    it('should support cursor pagination', async () => {
      vi.mocked(prisma.conversationMember.findUnique).mockResolvedValue({
        userId: 'test-user-id',
        conversationId: 'conv-1',
      } as never);
      vi.mocked(prisma.directMessage.findMany).mockResolvedValue([] as never);
      vi.mocked(prisma.conversationMember.update).mockResolvedValue({} as never);

      const res = await request(createApp()).get('/dm/conv-1/messages?cursor=msg-5&limit=10');

      expect(res.status).toBe(200);
      expect(prisma.directMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'msg-5' },
          skip: 1,
          take: 10,
        })
      );
    });
  });

  describe('POST /dm/:id/messages', () => {
    it('should send a message', async () => {
      vi.mocked(prisma.conversationMember.findUnique).mockResolvedValue({
        userId: 'test-user-id',
        conversationId: 'conv-1',
      } as never);
      vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
        id: 'conv-1',
        workspaceId: 'ws-1',
      } as never);
      vi.mocked(prisma.directMessage.create).mockResolvedValue({
        id: 'msg-new',
        content: 'Hello world',
        user: { id: 'test-user-id', username: 'me', displayName: 'Me', avatarUrl: null },
      } as never);
      vi.mocked(prisma.conversation.update).mockResolvedValue({} as never);

      const res = await request(createApp())
        .post('/dm/conv-1/messages')
        .send({ content: 'Hello world' });

      expect(res.status).toBe(201);
      expect(res.body.content).toBe('Hello world');
    });

    it('should return 403 if not conversation member', async () => {
      vi.mocked(prisma.conversationMember.findUnique).mockResolvedValue(null);

      const res = await request(createApp())
        .post('/dm/conv-1/messages')
        .send({ content: 'Hello' });

      expect(res.status).toBe(403);
    });

    it('should reject empty content', async () => {
      const res = await request(createApp())
        .post('/dm/conv-1/messages')
        .send({ content: '' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /dm/group', () => {
    it('should create a group DM', async () => {
      vi.mocked(prisma.conversation.create).mockResolvedValue({
        id: 'grp-1',
        isGroup: true,
        name: 'Group Chat',
        members: [
          { user: { id: 'test-user-id', username: 'me', displayName: 'Me', avatarUrl: null, status: 'online' } },
          { user: { id: 'u2', username: 'user2', displayName: 'User Two', avatarUrl: null, status: 'online' } },
          { user: { id: 'u3', username: 'user3', displayName: 'User Three', avatarUrl: null, status: 'offline' } },
        ],
      } as never);

      const res = await request(createApp())
        .post('/dm/group')
        .send({ workspaceId: 'ws-1', name: 'Group Chat', memberIds: ['u2', 'u3'] });

      expect(res.status).toBe(201);
      expect(res.body.isGroup).toBe(true);
      expect(res.body.name).toBe('Group Chat');
    });

    it('should reject less than 2 member IDs', async () => {
      const res = await request(createApp())
        .post('/dm/group')
        .send({ workspaceId: 'ws-1', memberIds: ['u2'] });

      expect(res.status).toBe(400);
    });
  });
});
