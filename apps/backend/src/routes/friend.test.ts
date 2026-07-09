import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('@pulseweave/database', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    friendship: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
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
import { friendRouter } from './friend';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { userId: string }).userId = 'test-user-id';
    next();
  });
  app.use('/friends', friendRouter);
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

describe('friend routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /friends', () => {
    it('should return accepted friendships', async () => {
      vi.mocked(prisma.friendship.findMany).mockResolvedValue([
        {
          id: 'f-1', requesterId: 'test-user-id', addresseeId: 'u2', status: 'accepted',
          updatedAt: new Date(),
          requester: { id: 'test-user-id', username: 'me', displayName: 'Me', avatarUrl: null, status: 'online', statusMessage: null },
          addressee: { id: 'u2', username: 'friend', displayName: 'Friend', avatarUrl: null, status: 'offline', statusMessage: null },
        },
      ] as never);

      const res = await request(createApp()).get('/friends');

      expect(res.status).toBe(200);
      expect(res.body.friends).toHaveLength(1);
      expect(res.body.friends[0].user.id).toBe('u2');
    });
  });

  describe('GET /friends/requests', () => {
    it('should return pending received requests', async () => {
      vi.mocked(prisma.friendship.findMany).mockResolvedValue([
        {
          id: 'f-1', createdAt: new Date(),
          requester: { id: 'u2', username: 'user2', displayName: 'User 2', avatarUrl: null, status: 'online' },
        },
      ] as never);

      const res = await request(createApp()).get('/friends/requests');

      expect(res.status).toBe(200);
      expect(res.body.requests).toHaveLength(1);
      expect(res.body.requests[0].from.id).toBe('u2');
    });
  });

  describe('GET /friends/requests/sent', () => {
    it('should return pending sent requests', async () => {
      vi.mocked(prisma.friendship.findMany).mockResolvedValue([
        {
          id: 'f-1', createdAt: new Date(),
          addressee: { id: 'u2', username: 'user2', displayName: 'User 2', avatarUrl: null, status: 'offline' },
        },
      ] as never);

      const res = await request(createApp()).get('/friends/requests/sent');

      expect(res.status).toBe(200);
      expect(res.body.requests).toHaveLength(1);
      expect(res.body.requests[0].to.id).toBe('u2');
    });
  });

  describe('POST /friends/request', () => {
    it('should create a new friend request', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u2', username: 'user2', displayName: 'User 2',
      } as never);
      vi.mocked(prisma.friendship.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.friendship.create).mockResolvedValue({
        id: 'f-1', status: 'pending',
      } as never);

      const res = await request(createApp())
        .post('/friends/request')
        .send({ username: 'user2' });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Friend request sent');
    });

    it('should return 404 if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const res = await request(createApp())
        .post('/friends/request')
        .send({ username: 'nonexistent' });

      expect(res.status).toBe(404);
    });

    it('should return 400 if sending to self', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'test-user-id', username: 'me', displayName: 'Me',
      } as never);

      const res = await request(createApp())
        .post('/friends/request')
        .send({ username: 'me' });

      expect(res.status).toBe(400);
    });

    it('should auto-accept if they already sent us a request', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u2', username: 'user2', displayName: 'User 2',
      } as never);
      vi.mocked(prisma.friendship.findFirst).mockResolvedValue({
        id: 'f-1', status: 'pending', requesterId: 'u2', addresseeId: 'test-user-id',
      } as never);
      vi.mocked(prisma.friendship.update).mockResolvedValue({
        id: 'f-1', status: 'accepted',
      } as never);

      const res = await request(createApp())
        .post('/friends/request')
        .send({ username: 'user2' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Friend request accepted');
    });

    it('should return 400 if already friends', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u2', username: 'user2', displayName: 'User 2',
      } as never);
      vi.mocked(prisma.friendship.findFirst).mockResolvedValue({
        id: 'f-1', status: 'accepted', requesterId: 'test-user-id',
      } as never);

      const res = await request(createApp())
        .post('/friends/request')
        .send({ username: 'user2' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /friends/request/:id/accept', () => {
    it('should accept a friend request', async () => {
      vi.mocked(prisma.friendship.findUnique).mockResolvedValue({
        id: 'f-1', addresseeId: 'test-user-id', status: 'pending',
      } as never);
      vi.mocked(prisma.friendship.update).mockResolvedValue({
        id: 'f-1', status: 'accepted',
        requester: { id: 'u2', username: 'user2', displayName: 'User 2', avatarUrl: null },
      } as never);

      const res = await request(createApp()).post('/friends/request/f-1/accept');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Friend request accepted');
    });

    it('should return 403 if not the addressee', async () => {
      vi.mocked(prisma.friendship.findUnique).mockResolvedValue({
        id: 'f-1', addresseeId: 'other-user', status: 'pending',
      } as never);

      const res = await request(createApp()).post('/friends/request/f-1/accept');

      expect(res.status).toBe(403);
    });

    it('should return 400 if not pending', async () => {
      vi.mocked(prisma.friendship.findUnique).mockResolvedValue({
        id: 'f-1', addresseeId: 'test-user-id', status: 'accepted',
      } as never);

      const res = await request(createApp()).post('/friends/request/f-1/accept');

      expect(res.status).toBe(400);
    });
  });

  describe('POST /friends/request/:id/decline', () => {
    it('should decline a friend request', async () => {
      vi.mocked(prisma.friendship.findUnique).mockResolvedValue({
        id: 'f-1', addresseeId: 'test-user-id', status: 'pending',
      } as never);
      vi.mocked(prisma.friendship.update).mockResolvedValue({} as never);

      const res = await request(createApp()).post('/friends/request/f-1/decline');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Friend request declined');
    });
  });

  describe('DELETE /friends/request/:id', () => {
    it('should cancel a sent request', async () => {
      vi.mocked(prisma.friendship.findUnique).mockResolvedValue({
        id: 'f-1', requesterId: 'test-user-id', status: 'pending',
      } as never);
      vi.mocked(prisma.friendship.delete).mockResolvedValue({} as never);

      const res = await request(createApp()).delete('/friends/request/f-1');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Friend request cancelled');
    });

    it('should return 403 if not the requester', async () => {
      vi.mocked(prisma.friendship.findUnique).mockResolvedValue({
        id: 'f-1', requesterId: 'other-user', status: 'pending',
      } as never);

      const res = await request(createApp()).delete('/friends/request/f-1');

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /friends/:id', () => {
    it('should remove a friend', async () => {
      vi.mocked(prisma.friendship.findUnique).mockResolvedValue({
        id: 'f-1', requesterId: 'test-user-id', addresseeId: 'u2', status: 'accepted',
      } as never);
      vi.mocked(prisma.friendship.delete).mockResolvedValue({} as never);

      const res = await request(createApp()).delete('/friends/f-1');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Friend removed');
    });

    it('should return 400 if not accepted', async () => {
      vi.mocked(prisma.friendship.findUnique).mockResolvedValue({
        id: 'f-1', requesterId: 'test-user-id', addresseeId: 'u2', status: 'pending',
      } as never);

      const res = await request(createApp()).delete('/friends/f-1');

      expect(res.status).toBe(400);
    });
  });

  describe('POST /friends/block/:userId', () => {
    it('should block a user', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u2' } as never);
      vi.mocked(prisma.friendship.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.friendship.create).mockResolvedValue({} as never);

      const res = await request(createApp()).post('/friends/block/u2');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('User blocked');
    });

    it('should return 400 if blocking self', async () => {
      const res = await request(createApp()).post('/friends/block/test-user-id');

      expect(res.status).toBe(400);
    });

    it('should update existing friendship to blocked', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u2' } as never);
      vi.mocked(prisma.friendship.findFirst).mockResolvedValue({
        id: 'f-1', status: 'accepted',
      } as never);
      vi.mocked(prisma.friendship.update).mockResolvedValue({} as never);

      const res = await request(createApp()).post('/friends/block/u2');

      expect(res.status).toBe(200);
      expect(prisma.friendship.update).toHaveBeenCalled();
    });
  });

  describe('DELETE /friends/block/:userId', () => {
    it('should unblock a user', async () => {
      vi.mocked(prisma.friendship.findFirst).mockResolvedValue({
        id: 'f-1', status: 'blocked',
      } as never);
      vi.mocked(prisma.friendship.delete).mockResolvedValue({} as never);

      const res = await request(createApp()).delete('/friends/block/u2');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('User unblocked');
    });

    it('should return 404 if block record not found', async () => {
      vi.mocked(prisma.friendship.findFirst).mockResolvedValue(null);

      const res = await request(createApp()).delete('/friends/block/u2');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /friends/blocked', () => {
    it('should return blocked users', async () => {
      vi.mocked(prisma.friendship.findMany).mockResolvedValue([
        {
          id: 'f-1', updatedAt: new Date(),
          addressee: { id: 'u2', username: 'user2', displayName: 'User 2', avatarUrl: null },
        },
      ] as never);

      const res = await request(createApp()).get('/friends/blocked');

      expect(res.status).toBe(200);
      expect(res.body.blocked).toHaveLength(1);
      expect(res.body.blocked[0].user.id).toBe('u2');
    });
  });
});
