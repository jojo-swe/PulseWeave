import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('@pulseweave/database', () => ({
  prisma: {
    channel: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    channelMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    workspaceMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { userId: string }).userId = 'test-user-id';
    (req as unknown as { tokenId: string }).tokenId = 'test-token-id';
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
import { channelRouter } from './channel';

function createApp() {
  const app = express();
  app.use(express.json());
  // Channel routes don't use authenticateToken, so inject userId manually
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { userId: string }).userId = 'test-user-id';
    next();
  });
  app.use('/channels', channelRouter);
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

describe('channel routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /channels/:id', () => {
    it('should return channel for workspace member', async () => {
      vi.mocked(prisma.channel.findUnique).mockResolvedValue({
        id: 'ch-1',
        name: 'general',
        workspaceId: 'ws-1',
        isPrivate: false,
        workspace: { id: 'ws-1' },
        members: [],
        _count: { messages: 10 },
      } as never);
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        userId: 'test-user-id',
        workspaceId: 'ws-1',
      } as never);

      const res = await request(createApp()).get('/channels/ch-1');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('ch-1');
      expect(res.body).not.toHaveProperty('workspace');
    });

    it('should return 404 if channel not found', async () => {
      vi.mocked(prisma.channel.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).get('/channels/nonexistent');

      expect(res.status).toBe(404);
    });

    it('should return 403 if not workspace member', async () => {
      vi.mocked(prisma.channel.findUnique).mockResolvedValue({
        id: 'ch-1',
        name: 'general',
        workspaceId: 'ws-1',
        isPrivate: false,
        workspace: { id: 'ws-1' },
        members: [],
        _count: { messages: 0 },
      } as never);
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).get('/channels/ch-1');

      expect(res.status).toBe(403);
    });

    it('should return 403 for private channel if not channel member', async () => {
      vi.mocked(prisma.channel.findUnique).mockResolvedValue({
        id: 'ch-1',
        name: 'private',
        workspaceId: 'ws-1',
        isPrivate: true,
        workspace: { id: 'ws-1' },
        members: [],
        _count: { messages: 0 },
      } as never);
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        userId: 'test-user-id',
        workspaceId: 'ws-1',
      } as never);
      vi.mocked(prisma.channelMember.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).get('/channels/ch-1');

      expect(res.status).toBe(403);
    });
  });

  describe('POST /channels', () => {
    it('should create a channel', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        userId: 'test-user-id',
        workspaceId: 'ws-1',
      } as never);
      vi.mocked(prisma.channel.create).mockResolvedValue({
        id: 'ch-new',
        name: 'new-channel',
        workspaceId: 'ws-1',
      } as never);

      const res = await request(createApp())
        .post('/channels')
        .send({ workspaceId: 'ws-1', name: 'new-channel', isPrivate: false });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('ch-new');
    });

    it('should return 403 if not workspace member', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue(null);

      const res = await request(createApp())
        .post('/channels')
        .send({ workspaceId: 'ws-1', name: 'new-channel' });

      expect(res.status).toBe(403);
    });

    it('should reject invalid channel name (uppercase)', async () => {
      const res = await request(createApp())
        .post('/channels')
        .send({ workspaceId: 'ws-1', name: 'InvalidName' });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /channels/:id', () => {
    it('should update channel as creator', async () => {
      vi.mocked(prisma.channel.findUnique).mockResolvedValue({
        id: 'ch-1',
        name: 'old-name',
        workspaceId: 'ws-1',
        createdById: 'test-user-id',
        workspace: { id: 'ws-1', ownerId: 'other-user' },
      } as never);
      vi.mocked(prisma.channel.update).mockResolvedValue({
        id: 'ch-1',
        name: 'new-name',
      } as never);

      const res = await request(createApp())
        .patch('/channels/ch-1')
        .send({ name: 'new-name' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('new-name');
    });

    it('should update channel as workspace owner', async () => {
      vi.mocked(prisma.channel.findUnique).mockResolvedValue({
        id: 'ch-1',
        name: 'old-name',
        workspaceId: 'ws-1',
        createdById: 'other-user',
        workspace: { id: 'ws-1', ownerId: 'test-user-id' },
      } as never);
      vi.mocked(prisma.channel.update).mockResolvedValue({
        id: 'ch-1',
        name: 'new-name',
      } as never);

      const res = await request(createApp())
        .patch('/channels/ch-1')
        .send({ name: 'new-name' });

      expect(res.status).toBe(200);
    });

    it('should return 403 if not creator or owner', async () => {
      vi.mocked(prisma.channel.findUnique).mockResolvedValue({
        id: 'ch-1',
        name: 'old-name',
        workspaceId: 'ws-1',
        createdById: 'other-user',
        workspace: { id: 'ws-1', ownerId: 'another-user' },
      } as never);

      const res = await request(createApp())
        .patch('/channels/ch-1')
        .send({ name: 'new-name' });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /channels/:id', () => {
    it('should delete channel as creator', async () => {
      vi.mocked(prisma.channel.findUnique).mockResolvedValue({
        id: 'ch-1',
        workspaceId: 'ws-1',
        createdById: 'test-user-id',
        workspace: { id: 'ws-1', ownerId: 'other' },
      } as never);
      vi.mocked(prisma.channel.delete).mockResolvedValue({} as never);

      const res = await request(createApp()).delete('/channels/ch-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 403 if not creator or owner', async () => {
      vi.mocked(prisma.channel.findUnique).mockResolvedValue({
        id: 'ch-1',
        workspaceId: 'ws-1',
        createdById: 'other-user',
        workspace: { id: 'ws-1', ownerId: 'another-user' },
      } as never);

      const res = await request(createApp()).delete('/channels/ch-1');

      expect(res.status).toBe(403);
    });
  });

  describe('POST /channels/:id/join', () => {
    it('should join a public channel', async () => {
      vi.mocked(prisma.channel.findUnique).mockResolvedValue({
        id: 'ch-1',
        workspaceId: 'ws-1',
        isPrivate: false,
      } as never);
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        userId: 'test-user-id',
        workspaceId: 'ws-1',
      } as never);
      vi.mocked(prisma.channelMember.upsert).mockResolvedValue({} as never);

      const res = await request(createApp()).post('/channels/ch-1/join');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 403 for private channel', async () => {
      vi.mocked(prisma.channel.findUnique).mockResolvedValue({
        id: 'ch-1',
        workspaceId: 'ws-1',
        isPrivate: true,
      } as never);
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        userId: 'test-user-id',
        workspaceId: 'ws-1',
      } as never);

      const res = await request(createApp()).post('/channels/ch-1/join');

      expect(res.status).toBe(403);
    });
  });

  describe('POST /channels/:id/leave', () => {
    it('should leave a channel', async () => {
      vi.mocked(prisma.channel.findUnique).mockResolvedValue({
        id: 'ch-1',
        name: 'random',
        workspaceId: 'ws-1',
        workspace: { id: 'ws-1' },
      } as never);
      vi.mocked(prisma.channelMember.findUnique).mockResolvedValue({
        userId: 'test-user-id',
        channelId: 'ch-1',
      } as never);
      vi.mocked(prisma.channelMember.delete).mockResolvedValue({} as never);

      const res = await request(createApp()).post('/channels/ch-1/leave');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 403 for general channel', async () => {
      vi.mocked(prisma.channel.findUnique).mockResolvedValue({
        id: 'ch-1',
        name: 'general',
        workspaceId: 'ws-1',
        workspace: { id: 'ws-1' },
      } as never);
      vi.mocked(prisma.channelMember.findUnique).mockResolvedValue({
        userId: 'test-user-id',
        channelId: 'ch-1',
      } as never);

      const res = await request(createApp()).post('/channels/ch-1/leave');

      expect(res.status).toBe(403);
    });

    it('should return 404 if not a member', async () => {
      vi.mocked(prisma.channel.findUnique).mockResolvedValue({
        id: 'ch-1',
        name: 'random',
        workspaceId: 'ws-1',
        workspace: { id: 'ws-1' },
      } as never);
      vi.mocked(prisma.channelMember.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).post('/channels/ch-1/leave');

      expect(res.status).toBe(404);
    });
  });
});
