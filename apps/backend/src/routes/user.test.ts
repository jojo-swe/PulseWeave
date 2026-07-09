import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('@pulseweave/database', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
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
import bcrypt from 'bcryptjs';
import { userRouter } from './user';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/users', userRouter);
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

describe('user routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /users/me', () => {
    it('should return current user profile', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'test-user-id',
        email: 'test@test.com',
        username: 'testuser',
        displayName: 'Test User',
        avatarUrl: null,
        status: 'online',
        statusMessage: null,
        mfaEnabled: false,
        createdAt: new Date(),
      } as never);

      const res = await request(createApp()).get('/users/me');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('test-user-id');
      expect(res.body.email).toBe('test@test.com');
    });

    it('should return 404 if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).get('/users/me');

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /users/me', () => {
    it('should update user profile', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.user.update).mockResolvedValue({
        id: 'test-user-id',
        username: 'newuser',
        displayName: 'New Name',
        email: 'test@test.com',
        avatarUrl: null,
        status: 'online',
        statusMessage: null,
      } as never);

      const res = await request(createApp())
        .patch('/users/me')
        .send({ displayName: 'New Name', username: 'newuser' });

      expect(res.status).toBe(200);
      expect(res.body.displayName).toBe('New Name');
    });

    it('should return 409 if username already taken', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        id: 'other-user',
        username: 'taken',
      } as never);

      const res = await request(createApp())
        .patch('/users/me')
        .send({ username: 'taken' });

      expect(res.status).toBe(409);
    });

    it('should reject invalid username format', async () => {
      const res = await request(createApp())
        .patch('/users/me')
        .send({ username: 'invalid user!' });

      expect(res.status).toBe(400);
    });

    it('should reject invalid status enum', async () => {
      const res = await request(createApp())
        .patch('/users/me')
        .send({ status: 'invisible' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /users/me/password', () => {
    it('should change password with valid credentials', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'test-user-id',
        passwordHash: 'old-hash',
      } as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(bcrypt.hash).mockResolvedValue('new-hash' as never);
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);

      const res = await request(createApp())
        .post('/users/me/password')
        .send({ currentPassword: 'oldpass123', newPassword: 'newpass123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 401 if current password is wrong', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'test-user-id',
        passwordHash: 'old-hash',
      } as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      const res = await request(createApp())
        .post('/users/me/password')
        .send({ currentPassword: 'wrongpass', newPassword: 'newpass123' });

      expect(res.status).toBe(401);
    });

    it('should reject short new password', async () => {
      const res = await request(createApp())
        .post('/users/me/password')
        .send({ currentPassword: 'oldpass', newPassword: 'short' });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /users/me', () => {
    it('should delete account with valid password', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'test-user-id',
        passwordHash: 'hash',
      } as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);

      const res = await request(createApp())
        .delete('/users/me')
        .send({ password: 'correctpass' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 if password not provided', async () => {
      const res = await request(createApp())
        .delete('/users/me')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 401 if password is wrong', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'test-user-id',
        passwordHash: 'hash',
      } as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      const res = await request(createApp())
        .delete('/users/me')
        .send({ password: 'wrongpass' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /users/:id', () => {
    it('should return user by ID', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-123',
        username: 'otheruser',
        displayName: 'Other User',
        avatarUrl: null,
        status: 'online',
        createdAt: new Date(),
      } as never);

      const res = await request(createApp()).get('/users/user-123');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('user-123');
    });

    it('should return 404 if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).get('/users/nonexistent');

      expect(res.status).toBe(404);
    });
  });
});
