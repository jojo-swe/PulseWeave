import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('@pulseweave/database', () => ({
  prisma: {
    workspace: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    workspaceMember: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    channel: {
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
    },
    channelMember: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    message: { deleteMany: vi.fn() },
    auditLog: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
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
import { workspaceRouter } from './workspace';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { userId: string }).userId = 'test-user-id';
    next();
  });
  app.use('/workspaces', workspaceRouter);
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

describe('workspace routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /workspaces', () => {
    it('should return user workspaces', async () => {
      vi.mocked(prisma.workspaceMember.findMany).mockResolvedValue([
        {
          roleName: 'owner',
          workspace: {
            id: 'ws-1', name: 'My Workspace', slug: 'my-ws',
            _count: { members: 5, channels: 3 },
          },
        },
      ] as never);

      const res = await request(createApp()).get('/workspaces');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('ws-1');
      expect(res.body[0].role).toBe('owner');
      expect(res.body[0].memberCount).toBe(5);
    });
  });

  describe('GET /workspaces/:id', () => {
    it('should return workspace for member', async () => {
      vi.mocked(prisma.workspace.findFirst).mockResolvedValue({
        id: 'ws-1', name: 'Test', channels: [], members: [],
      } as never);

      const res = await request(createApp()).get('/workspaces/ws-1');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('ws-1');
    });

    it('should return 404 if workspace not found or not member', async () => {
      vi.mocked(prisma.workspace.findFirst).mockResolvedValue(null);

      const res = await request(createApp()).get('/workspaces/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /workspaces', () => {
    it('should create a workspace', async () => {
      vi.mocked(prisma.workspace.create).mockResolvedValue({
        id: 'ws-new', name: 'New WS', slug: 'new-ws',
      } as never);

      const res = await request(createApp())
        .post('/workspaces')
        .send({ name: 'New WS', slug: 'new-ws' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('ws-new');
    });

    it('should reject invalid slug', async () => {
      const res = await request(createApp())
        .post('/workspaces')
        .send({ name: 'Test', slug: 'Invalid Slug!' });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /workspaces/:id', () => {
    it('should update workspace as admin', async () => {
      vi.mocked(prisma.workspaceMember.findFirst).mockResolvedValue({
        roleName: 'admin',
      } as never);
      vi.mocked(prisma.workspace.update).mockResolvedValue({
        id: 'ws-1', name: 'Updated',
      } as never);

      const res = await request(createApp())
        .patch('/workspaces/ws-1')
        .send({ name: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated');
    });

    it('should return 403 for non-admin member', async () => {
      vi.mocked(prisma.workspaceMember.findFirst).mockResolvedValue({
        roleName: 'member',
      } as never);

      const res = await request(createApp())
        .patch('/workspaces/ws-1')
        .send({ name: 'Updated' });

      expect(res.status).toBe(403);
    });

    it('should return 404 if not a member', async () => {
      vi.mocked(prisma.workspaceMember.findFirst).mockResolvedValue(null);

      const res = await request(createApp())
        .patch('/workspaces/ws-1')
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /workspaces/:id', () => {
    it('should delete workspace as owner', async () => {
      vi.mocked(prisma.workspace.findFirst).mockResolvedValue({ id: 'ws-1' } as never);
      vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
        const tx = {
          message: { deleteMany: vi.fn() },
          channelMember: { deleteMany: vi.fn() },
          channel: { deleteMany: vi.fn() },
          workspaceMember: { deleteMany: vi.fn() },
          auditLog: { deleteMany: vi.fn() },
          workspace: { delete: vi.fn() },
        };
        return fn(tx);
      });

      const res = await request(createApp()).delete('/workspaces/ws-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should return 403 if not owner', async () => {
      vi.mocked(prisma.workspace.findFirst).mockResolvedValue(null);

      const res = await request(createApp()).delete('/workspaces/ws-1');

      expect(res.status).toBe(403);
    });
  });

  describe('POST /workspaces/:id/leave', () => {
    it('should leave workspace as non-owner', async () => {
      vi.mocked(prisma.workspaceMember.findFirst).mockResolvedValue({
        id: 'mem-1', roleName: 'member', workspace: { id: 'ws-1' },
      } as never);
      vi.mocked(prisma.channelMember.deleteMany).mockResolvedValue({ count: 2 } as never);
      vi.mocked(prisma.workspaceMember.delete).mockResolvedValue({} as never);

      const res = await request(createApp()).post('/workspaces/ws-1/leave');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 403 for owner', async () => {
      vi.mocked(prisma.workspaceMember.findFirst).mockResolvedValue({
        id: 'mem-1', roleName: 'owner', workspace: { id: 'ws-1' },
      } as never);

      const res = await request(createApp()).post('/workspaces/ws-1/leave');

      expect(res.status).toBe(403);
    });

    it('should return 404 if not a member', async () => {
      vi.mocked(prisma.workspaceMember.findFirst).mockResolvedValue(null);

      const res = await request(createApp()).post('/workspaces/ws-1/leave');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /workspaces/join/:slug', () => {
    it('should return workspace info by slug', async () => {
      vi.mocked(prisma.workspace.findUnique).mockResolvedValue({
        id: 'ws-1', name: 'Test', slug: 'test-ws', iconUrl: null,
        _count: { members: 10 },
      } as never);
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).get('/workspaces/join/test-ws');

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Test');
      expect(res.body.isMember).toBe(false);
    });

    it('should return 404 if workspace not found', async () => {
      vi.mocked(prisma.workspace.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).get('/workspaces/join/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /workspaces/join/:slug', () => {
    it('should join workspace by slug', async () => {
      vi.mocked(prisma.workspace.findUnique).mockResolvedValue({
        id: 'ws-1', name: 'Test', slug: 'test-ws',
      } as never);
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.workspaceMember.create).mockResolvedValue({} as never);
      vi.mocked(prisma.channel.findFirst).mockResolvedValue({ id: 'ch-general' } as never);
      vi.mocked(prisma.channelMember.create).mockResolvedValue({} as never);

      const res = await request(createApp()).post('/workspaces/join/test-ws');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.alreadyMember).toBe(false);
    });

    it('should return already member response', async () => {
      vi.mocked(prisma.workspace.findUnique).mockResolvedValue({
        id: 'ws-1', name: 'Test', slug: 'test-ws',
      } as never);
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        userId: 'test-user-id', workspaceId: 'ws-1',
      } as never);

      const res = await request(createApp()).post('/workspaces/join/test-ws');

      expect(res.status).toBe(200);
      expect(res.body.alreadyMember).toBe(true);
    });

    it('should return 404 if workspace not found', async () => {
      vi.mocked(prisma.workspace.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).post('/workspaces/join/nonexistent');

      expect(res.status).toBe(404);
    });
  });
});
