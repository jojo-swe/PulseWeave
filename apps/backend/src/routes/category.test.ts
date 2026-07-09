import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('@pulseweave/database', () => ({
  prisma: {
    channelCategory: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      aggregate: vi.fn(),
    },
    channel: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    workspaceMember: {
      findUnique: vi.fn(),
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
import categoryRouter from './category';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { userId: string }).userId = 'test-user-id';
    next();
  });
  app.use('/categories', categoryRouter);
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

describe('category routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /categories/workspace/:workspaceId', () => {
    it('should return categories for workspace member', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        userId: 'test-user-id',
        workspaceId: 'ws-1',
      } as never);
      vi.mocked(prisma.channelCategory.findMany).mockResolvedValue([
        { id: 'cat-1', name: 'General', channels: [] },
      ] as never);

      const res = await request(createApp()).get('/categories/workspace/ws-1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('should return 403 if not workspace member', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).get('/categories/workspace/ws-1');

      expect(res.status).toBe(403);
    });
  });

  describe('POST /categories', () => {
    it('should create category as admin', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        userId: 'test-user-id',
        workspaceId: 'ws-1',
        roleName: 'admin',
      } as never);
      vi.mocked(prisma.channelCategory.aggregate).mockResolvedValue({
        _max: { position: 5 },
      } as never);
      vi.mocked(prisma.channelCategory.create).mockResolvedValue({
        id: 'cat-1',
        name: 'New Category',
        position: 6,
        channels: [],
      } as never);

      const res = await request(createApp())
        .post('/categories')
        .send({ name: 'New Category', workspaceId: 'ws-1' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('cat-1');
    });

    it('should return 403 for non-admin member', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        userId: 'test-user-id',
        workspaceId: 'ws-1',
        roleName: 'member',
      } as never);

      const res = await request(createApp())
        .post('/categories')
        .send({ name: 'New', workspaceId: 'ws-1' });

      expect(res.status).toBe(403);
    });

    it('should return 403 if not workspace member', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue(null);

      const res = await request(createApp())
        .post('/categories')
        .send({ name: 'New', workspaceId: 'ws-1' });

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /categories/:id', () => {
    it('should update category as admin', async () => {
      vi.mocked(prisma.channelCategory.findUnique).mockResolvedValue({
        id: 'cat-1',
        name: 'Old',
        workspaceId: 'ws-1',
      } as never);
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        roleName: 'admin',
      } as never);
      vi.mocked(prisma.channelCategory.update).mockResolvedValue({
        id: 'cat-1',
        name: 'New Name',
        channels: [],
      } as never);

      const res = await request(createApp())
        .patch('/categories/cat-1')
        .send({ name: 'New Name' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('New Name');
    });

    it('should return 404 if category not found', async () => {
      vi.mocked(prisma.channelCategory.findUnique).mockResolvedValue(null);

      const res = await request(createApp())
        .patch('/categories/nonexistent')
        .send({ name: 'New' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /categories/:id', () => {
    it('should delete category as admin', async () => {
      vi.mocked(prisma.channelCategory.findUnique).mockResolvedValue({
        id: 'cat-1',
        workspaceId: 'ws-1',
      } as never);
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        roleName: 'admin',
      } as never);
      vi.mocked(prisma.channel.updateMany).mockResolvedValue({ count: 2 } as never);
      vi.mocked(prisma.channelCategory.delete).mockResolvedValue({} as never);

      const res = await request(createApp()).delete('/categories/cat-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(prisma.channel.updateMany).toHaveBeenCalledWith({
        where: { categoryId: 'cat-1' },
        data: { categoryId: null },
      });
    });

    it('should return 404 if category not found', async () => {
      vi.mocked(prisma.channelCategory.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).delete('/categories/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /categories/:id/channels/:channelId', () => {
    it('should move channel to category as admin', async () => {
      vi.mocked(prisma.channelCategory.findUnique).mockResolvedValue({
        id: 'cat-1',
        workspaceId: 'ws-1',
      } as never);
      vi.mocked(prisma.channel.findUnique).mockResolvedValue({
        id: 'ch-1',
        workspaceId: 'ws-1',
      } as never);
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        roleName: 'admin',
      } as never);
      vi.mocked(prisma.channel.update).mockResolvedValue({
        id: 'ch-1',
        categoryId: 'cat-1',
      } as never);

      const res = await request(createApp())
        .post('/categories/cat-1/channels/ch-1')
        .send({ position: 2 });

      expect(res.status).toBe(200);
      expect(res.body.categoryId).toBe('cat-1');
    });

    it('should return 404 if channel not found', async () => {
      vi.mocked(prisma.channelCategory.findUnique).mockResolvedValue({
        id: 'cat-1',
        workspaceId: 'ws-1',
      } as never);
      vi.mocked(prisma.channel.findUnique).mockResolvedValue(null);

      const res = await request(createApp())
        .post('/categories/cat-1/channels/nonexistent')
        .send({});

      expect(res.status).toBe(404);
    });

    it('should return 404 if channel is in different workspace', async () => {
      vi.mocked(prisma.channelCategory.findUnique).mockResolvedValue({
        id: 'cat-1',
        workspaceId: 'ws-1',
      } as never);
      vi.mocked(prisma.channel.findUnique).mockResolvedValue({
        id: 'ch-1',
        workspaceId: 'ws-2',
      } as never);

      const res = await request(createApp())
        .post('/categories/cat-1/channels/ch-1')
        .send({});

      expect(res.status).toBe(404);
    });
  });
});
