import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('@pulseweave/database', () => ({
  prisma: {
    scheduledMessage: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    channel: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    message: {
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
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { prisma } from '@pulseweave/database';
import scheduledRouter from './scheduled';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { userId: string }).userId = 'test-user-id';
    next();
  });
  app.use('/scheduled', scheduledRouter);
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

const futureDate = new Date(Date.now() + 86400000).toISOString();

describe('scheduled routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /scheduled', () => {
    it('should return pending scheduled messages for user', async () => {
      vi.mocked(prisma.scheduledMessage.findMany).mockResolvedValue([
        { id: 'sm-1', content: 'Hello', scheduledAt: new Date() },
      ] as never);

      const res = await request(createApp()).get('/scheduled');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('GET /scheduled/channel/:channelId', () => {
    it('should return scheduled messages for a channel', async () => {
      vi.mocked(prisma.channel.findFirst).mockResolvedValue({ id: 'ch-1' } as never);
      vi.mocked(prisma.scheduledMessage.findMany).mockResolvedValue([
        { id: 'sm-1', content: 'Hello' },
      ] as never);

      const res = await request(createApp()).get('/scheduled/channel/ch-1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('should return 404 if channel not found', async () => {
      vi.mocked(prisma.channel.findFirst).mockResolvedValue(null);

      const res = await request(createApp()).get('/scheduled/channel/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /scheduled', () => {
    it('should create a scheduled message', async () => {
      vi.mocked(prisma.channel.findFirst).mockResolvedValue({ id: 'ch-1' } as never);
      vi.mocked(prisma.scheduledMessage.create).mockResolvedValue({
        id: 'sm-1', content: 'Hello', channelId: 'ch-1',
      } as never);

      const res = await request(createApp())
        .post('/scheduled')
        .send({ content: 'Hello', channelId: 'ch-1', scheduledAt: futureDate });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('sm-1');
    });

    it('should return 404 if channel not found', async () => {
      vi.mocked(prisma.channel.findFirst).mockResolvedValue(null);

      const res = await request(createApp())
        .post('/scheduled')
        .send({ content: 'Hello', channelId: 'nonexistent', scheduledAt: futureDate });

      expect(res.status).toBe(404);
    });

    it('should return 400 if scheduled time is in the past', async () => {
      vi.mocked(prisma.channel.findFirst).mockResolvedValue({ id: 'ch-1' } as never);

      const res = await request(createApp())
        .post('/scheduled')
        .send({ content: 'Hello', channelId: 'ch-1', scheduledAt: '2020-01-01T00:00:00.000Z' });

      expect(res.status).toBe(400);
    });

    it('should reject empty content', async () => {
      const res = await request(createApp())
        .post('/scheduled')
        .send({ content: '', channelId: 'ch-1', scheduledAt: futureDate });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /scheduled/:id', () => {
    it('should update a scheduled message', async () => {
      vi.mocked(prisma.scheduledMessage.findUnique).mockResolvedValue({
        id: 'sm-1', userId: 'test-user-id', status: 'pending',
      } as never);
      vi.mocked(prisma.scheduledMessage.update).mockResolvedValue({
        id: 'sm-1', content: 'Updated',
      } as never);

      const res = await request(createApp())
        .patch('/scheduled/sm-1')
        .send({ content: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.content).toBe('Updated');
    });

    it('should return 404 if message not found', async () => {
      vi.mocked(prisma.scheduledMessage.findUnique).mockResolvedValue(null);

      const res = await request(createApp())
        .patch('/scheduled/nonexistent')
        .send({ content: 'Updated' });

      expect(res.status).toBe(404);
    });

    it('should return 403 if not owner', async () => {
      vi.mocked(prisma.scheduledMessage.findUnique).mockResolvedValue({
        id: 'sm-1', userId: 'other-user', status: 'pending',
      } as never);

      const res = await request(createApp())
        .patch('/scheduled/sm-1')
        .send({ content: 'Updated' });

      expect(res.status).toBe(403);
    });

    it('should return 400 if already sent', async () => {
      vi.mocked(prisma.scheduledMessage.findUnique).mockResolvedValue({
        id: 'sm-1', userId: 'test-user-id', status: 'sent',
      } as never);

      const res = await request(createApp())
        .patch('/scheduled/sm-1')
        .send({ content: 'Updated' });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /scheduled/:id', () => {
    it('should cancel a scheduled message', async () => {
      vi.mocked(prisma.scheduledMessage.findUnique).mockResolvedValue({
        id: 'sm-1', userId: 'test-user-id', status: 'pending',
      } as never);
      vi.mocked(prisma.scheduledMessage.update).mockResolvedValue({} as never);

      const res = await request(createApp()).delete('/scheduled/sm-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 403 if not owner', async () => {
      vi.mocked(prisma.scheduledMessage.findUnique).mockResolvedValue({
        id: 'sm-1', userId: 'other-user', status: 'pending',
      } as never);

      const res = await request(createApp()).delete('/scheduled/sm-1');

      expect(res.status).toBe(403);
    });
  });

  describe('POST /scheduled/:id/send-now', () => {
    it('should send a scheduled message immediately', async () => {
      vi.mocked(prisma.scheduledMessage.findUnique).mockResolvedValue({
        id: 'sm-1', userId: 'test-user-id', status: 'pending', content: 'Hello', channelId: 'ch-1',
      } as never);
      vi.mocked(prisma.channel.findUnique).mockResolvedValue({
        id: 'ch-1', workspaceId: 'ws-1',
      } as never);
      vi.mocked(prisma.message.create).mockResolvedValue({
        id: 'msg-1', content: 'Hello',
        user: { id: 'test-user-id', username: 'me', displayName: 'Me', avatarUrl: null },
        reactions: [], attachments: [],
      } as never);
      vi.mocked(prisma.scheduledMessage.update).mockResolvedValue({} as never);

      const res = await request(createApp()).post('/scheduled/sm-1/send-now');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('msg-1');
    });

    it('should return 404 if message not found', async () => {
      vi.mocked(prisma.scheduledMessage.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).post('/scheduled/nonexistent/send-now');

      expect(res.status).toBe(404);
    });

    it('should return 400 if already sent', async () => {
      vi.mocked(prisma.scheduledMessage.findUnique).mockResolvedValue({
        id: 'sm-1', userId: 'test-user-id', status: 'sent',
      } as never);

      const res = await request(createApp()).post('/scheduled/sm-1/send-now');

      expect(res.status).toBe(400);
    });
  });
});
