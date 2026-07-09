import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('@pulseweave/database', () => ({
  prisma: {
    message: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    channel: {
      findFirst: vi.fn(),
    },
    workspaceMember: {
      findUnique: vi.fn(),
    },
    channelMember: {
      findUnique: vi.fn(),
    },
    reaction: {
      upsert: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

const { NotificationService } = vi.hoisted(() => ({
  NotificationService: { notifyNewMessage: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../services/notifications', () => ({ NotificationService }));

vi.mock('../middleware/auth', () => ({
  authenticateToken: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { userId: string }).userId = 'test-user-id';
    next();
  },
  AuthRequest: class AuthRequest {},
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { prisma } from '@pulseweave/database';
import { messageRouter } from './message';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { userId: string }).userId = 'test-user-id';
    next();
  });
  app.use('/messages', messageRouter);
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

describe('message routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /messages/search', () => {
    it('should return empty results for short query', async () => {
      const res = await request(createApp()).get('/messages/search?workspaceId=ws-1&q=a');

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(0);
    });

    it('should search messages', async () => {
      vi.mocked(prisma.message.findMany).mockResolvedValue([
        {
          id: 'msg-1', content: 'Hello world',
          user: { id: 'u1', username: 'user1', displayName: 'User 1', avatarUrl: null },
          channel: { id: 'ch-1', name: 'general', isPrivate: false },
        },
      ] as never);

      const res = await request(createApp()).get('/messages/search?workspaceId=ws-1&q=hello');

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(1);
    });

    it('should return 400 if workspaceId missing', async () => {
      const res = await request(createApp()).get('/messages/search?q=hello');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /messages/channel/:channelId', () => {
    it('should return messages for a channel', async () => {
      vi.mocked(prisma.channel.findFirst).mockResolvedValue({ id: 'ch-1' } as never);
      vi.mocked(prisma.message.findMany).mockResolvedValue([
        { id: 'msg-1', content: 'Hello', user: { id: 'u1', username: 'user1', displayName: 'User 1', avatarUrl: null }, reactions: [], _count: { replies: 0 } },
      ] as never);

      const res = await request(createApp()).get('/messages/channel/ch-1');

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(1);
    });

    it('should return 404 if channel not found', async () => {
      vi.mocked(prisma.channel.findFirst).mockResolvedValue(null);

      const res = await request(createApp()).get('/messages/channel/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /messages/:id/replies', () => {
    it('should return thread replies', async () => {
      vi.mocked(prisma.message.findUnique).mockResolvedValue({
        id: 'msg-1', channel: { id: 'ch-1', workspaceId: 'ws-1', isPrivate: false },
      } as never);
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        userId: 'test-user-id', workspaceId: 'ws-1',
      } as never);
      vi.mocked(prisma.message.findMany).mockResolvedValue([
        { id: 'reply-1', content: 'Reply', user: { id: 'u2', username: 'user2', displayName: 'User 2', avatarUrl: null }, reactions: [] },
      ] as never);

      const res = await request(createApp()).get('/messages/msg-1/replies');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('should return 404 if parent message not found', async () => {
      vi.mocked(prisma.message.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).get('/messages/nonexistent/replies');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /messages', () => {
    it('should create a message', async () => {
      vi.mocked(prisma.channel.findFirst).mockResolvedValue({
        id: 'ch-1', workspaceId: 'ws-1', name: 'general',
      } as never);
      vi.mocked(prisma.message.create).mockResolvedValue({
        id: 'msg-new', content: 'Hello', channelId: 'ch-1', userId: 'test-user-id',
        user: { id: 'test-user-id', username: 'me', displayName: 'Me', avatarUrl: null },
      } as never);

      const res = await request(createApp())
        .post('/messages')
        .send({ channelId: 'ch-1', content: 'Hello' });

      expect(res.status).toBe(201);
      expect(res.body.content).toBe('Hello');
    });

    it('should return 403 if no channel access', async () => {
      vi.mocked(prisma.channel.findFirst).mockResolvedValue(null);

      const res = await request(createApp())
        .post('/messages')
        .send({ channelId: 'private-ch', content: 'Hello' });

      expect(res.status).toBe(403);
    });

    it('should reject empty content', async () => {
      const res = await request(createApp())
        .post('/messages')
        .send({ channelId: 'ch-1', content: '' });

      expect(res.status).toBe(400);
    });

    it('should return 404 if parent message not found', async () => {
      vi.mocked(prisma.channel.findFirst).mockResolvedValue({
        id: 'ch-1', workspaceId: 'ws-1',
      } as never);
      vi.mocked(prisma.message.findUnique).mockResolvedValue(null);

      const res = await request(createApp())
        .post('/messages')
        .send({ channelId: 'ch-1', content: 'Reply', parentId: 'nonexistent' });

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /messages/:id', () => {
    it('should update own message', async () => {
      vi.mocked(prisma.message.findUnique).mockResolvedValue({
        id: 'msg-1', userId: 'test-user-id',
      } as never);
      vi.mocked(prisma.message.update).mockResolvedValue({
        id: 'msg-1', content: 'Updated', isEdited: true,
        user: { id: 'test-user-id', username: 'me', displayName: 'Me', avatarUrl: null },
      } as never);

      const res = await request(createApp())
        .patch('/messages/msg-1')
        .send({ content: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.content).toBe('Updated');
    });

    it('should return 403 if not message owner', async () => {
      vi.mocked(prisma.message.findUnique).mockResolvedValue({
        id: 'msg-1', userId: 'other-user',
      } as never);

      const res = await request(createApp())
        .patch('/messages/msg-1')
        .send({ content: 'Updated' });

      expect(res.status).toBe(403);
    });

    it('should return 404 if message not found', async () => {
      vi.mocked(prisma.message.findUnique).mockResolvedValue(null);

      const res = await request(createApp())
        .patch('/messages/nonexistent')
        .send({ content: 'Updated' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /messages/:id', () => {
    it('should delete own message', async () => {
      vi.mocked(prisma.message.findUnique).mockResolvedValue({
        id: 'msg-1', userId: 'test-user-id',
        channel: { workspace: { ownerId: 'other-user' } },
      } as never);
      vi.mocked(prisma.message.delete).mockResolvedValue({} as never);

      const res = await request(createApp()).delete('/messages/msg-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should allow workspace owner to delete any message', async () => {
      vi.mocked(prisma.message.findUnique).mockResolvedValue({
        id: 'msg-1', userId: 'other-user',
        channel: { workspace: { ownerId: 'test-user-id' } },
      } as never);
      vi.mocked(prisma.message.delete).mockResolvedValue({} as never);

      const res = await request(createApp()).delete('/messages/msg-1');

      expect(res.status).toBe(200);
    });

    it('should return 403 if not owner or workspace owner', async () => {
      vi.mocked(prisma.message.findUnique).mockResolvedValue({
        id: 'msg-1', userId: 'other-user',
        channel: { workspace: { ownerId: 'another-user' } },
      } as never);

      const res = await request(createApp()).delete('/messages/msg-1');

      expect(res.status).toBe(403);
    });
  });

  describe('POST /messages/:id/reactions', () => {
    it('should add a reaction', async () => {
      vi.mocked(prisma.message.findUnique).mockResolvedValue({
        id: 'msg-1', channelId: 'ch-1',
        channel: { id: 'ch-1', isPrivate: false, workspaceId: 'ws-1' },
      } as never);
      vi.mocked(prisma.reaction.upsert).mockResolvedValue({
        id: 'r-1', emoji: '👍', userId: 'test-user-id', messageId: 'msg-1',
      } as never);

      const res = await request(createApp())
        .post('/messages/msg-1/reactions')
        .send({ emoji: '👍' });

      expect(res.status).toBe(200);
      expect(res.body.emoji).toBe('👍');
    });

    it('should return 404 if message not found', async () => {
      vi.mocked(prisma.message.findUnique).mockResolvedValue(null);

      const res = await request(createApp())
        .post('/messages/nonexistent/reactions')
        .send({ emoji: '👍' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /messages/:id/reactions/:emoji', () => {
    it('should remove a reaction', async () => {
      vi.mocked(prisma.message.findUnique).mockResolvedValue({
        id: 'msg-1', channelId: 'ch-1',
        channel: { id: 'ch-1', isPrivate: false, workspaceId: 'ws-1' },
      } as never);
      vi.mocked(prisma.reaction.delete).mockResolvedValue({} as never);

      const res = await request(createApp()).delete('/messages/msg-1/reactions/👍');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /messages/:id/pin', () => {
    it('should pin a message', async () => {
      vi.mocked(prisma.message.findUnique).mockResolvedValue({
        id: 'msg-1', channelId: 'ch-1',
        channel: { id: 'ch-1', isPrivate: false },
      } as never);
      vi.mocked(prisma.message.update).mockResolvedValue({
        id: 'msg-1', isPinned: true,
        user: { id: 'u1', username: 'user1', displayName: 'User 1', avatarUrl: null },
      } as never);

      const res = await request(createApp()).post('/messages/msg-1/pin');

      expect(res.status).toBe(200);
      expect(res.body.isPinned).toBe(true);
    });

    it('should return 404 if message not found', async () => {
      vi.mocked(prisma.message.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).post('/messages/nonexistent/pin');

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /messages/:id/pin', () => {
    it('should unpin a message', async () => {
      vi.mocked(prisma.message.findUnique).mockResolvedValue({
        id: 'msg-1', channelId: 'ch-1',
        channel: { id: 'ch-1', isPrivate: false },
      } as never);
      vi.mocked(prisma.message.update).mockResolvedValue({
        id: 'msg-1', isPinned: false,
        user: { id: 'u1', username: 'user1', displayName: 'User 1', avatarUrl: null },
      } as never);

      const res = await request(createApp()).delete('/messages/msg-1/pin');

      expect(res.status).toBe(200);
      expect(res.body.isPinned).toBe(false);
    });
  });

  describe('GET /messages/channel/:channelId/pinned', () => {
    it('should return pinned messages', async () => {
      vi.mocked(prisma.channel.findFirst).mockResolvedValue({ id: 'ch-1' } as never);
      vi.mocked(prisma.message.findMany).mockResolvedValue([
        { id: 'msg-1', content: 'Pinned', isPinned: true, user: { id: 'u1', username: 'user1', displayName: 'User 1', avatarUrl: null } },
      ] as never);

      const res = await request(createApp()).get('/messages/channel/ch-1/pinned');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('should return 404 if channel not found', async () => {
      vi.mocked(prisma.channel.findFirst).mockResolvedValue(null);

      const res = await request(createApp()).get('/messages/channel/nonexistent/pinned');

      expect(res.status).toBe(404);
    });
  });
});
