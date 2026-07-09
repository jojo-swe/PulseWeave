import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('@pulseweave/database', () => ({
  prisma: {
    apiKey: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
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

vi.mock('../utils/workspace-access', () => ({
  hasAdminAccess: vi.fn(),
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { prisma } from '@pulseweave/database';
import { hasAdminAccess } from '../utils/workspace-access';
import apikeyRouter from './apikey';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api-keys', apikeyRouter);
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

describe('apikey routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api-keys/scopes', () => {
    it('should return available scopes', async () => {
      const res = await request(createApp()).get('/api-keys/scopes');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('messages:read');
      expect(res.body).toHaveProperty('*');
    });
  });

  describe('GET /api-keys/workspace/:workspaceId', () => {
    it('should list API keys for admin', async () => {
      vi.mocked(hasAdminAccess).mockResolvedValue(true);
      vi.mocked(prisma.apiKey.findMany).mockResolvedValue([
        {
          id: 'key-1', name: 'Test Key', keyPrefix: 'pw_abcde',
          scopes: '["messages:read"]', isActive: true,
          expiresAt: null, lastUsedAt: null, createdAt: new Date(),
          user: { id: 'u1', displayName: 'User', username: 'user' },
        },
      ] as never);

      const res = await request(createApp()).get('/api-keys/workspace/ws-1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].scopes).toEqual(['messages:read']);
    });

    it('should return 403 for non-admin', async () => {
      vi.mocked(hasAdminAccess).mockResolvedValue(false);

      const res = await request(createApp()).get('/api-keys/workspace/ws-1');

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api-keys/workspace/:workspaceId', () => {
    it('should create an API key', async () => {
      vi.mocked(hasAdminAccess).mockResolvedValue(true);
      vi.mocked(prisma.apiKey.create).mockResolvedValue({
        id: 'key-1', name: 'Test Key', keyPrefix: 'pw_abcde',
        scopes: '["messages:read"]', isActive: true,
        expiresAt: null, createdAt: new Date(),
      } as never);

      const res = await request(createApp())
        .post('/api-keys/workspace/ws-1')
        .send({ name: 'Test Key', scopes: ['messages:read'] });

      expect(res.status).toBe(201);
      expect(res.body.key).toBeDefined();
      expect(res.body.scopes).toEqual(['messages:read']);
    });

    it('should return 403 for non-admin', async () => {
      vi.mocked(hasAdminAccess).mockResolvedValue(false);

      const res = await request(createApp())
        .post('/api-keys/workspace/ws-1')
        .send({ name: 'Test', scopes: ['messages:read'] });

      expect(res.status).toBe(403);
    });

    it('should reject invalid scope', async () => {
      vi.mocked(hasAdminAccess).mockResolvedValue(true);

      const res = await request(createApp())
        .post('/api-keys/workspace/ws-1')
        .send({ name: 'Test', scopes: ['invalid:scope'] });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api-keys/:id', () => {
    it('should update an API key', async () => {
      vi.mocked(prisma.apiKey.findUnique).mockResolvedValue({
        id: 'key-1', workspaceId: 'ws-1',
      } as never);
      vi.mocked(hasAdminAccess).mockResolvedValue(true);
      vi.mocked(prisma.apiKey.update).mockResolvedValue({
        id: 'key-1', name: 'Updated', keyPrefix: 'pw_abcde',
        scopes: '["messages:write"]', isActive: true,
        expiresAt: null, lastUsedAt: null, createdAt: new Date(),
      } as never);

      const res = await request(createApp())
        .patch('/api-keys/key-1')
        .send({ name: 'Updated', scopes: ['messages:write'] });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated');
    });

    it('should return 404 if key not found', async () => {
      vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(null);

      const res = await request(createApp())
        .patch('/api-keys/nonexistent')
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api-keys/:id', () => {
    it('should delete an API key', async () => {
      vi.mocked(prisma.apiKey.findUnique).mockResolvedValue({
        id: 'key-1', workspaceId: 'ws-1',
      } as never);
      vi.mocked(hasAdminAccess).mockResolvedValue(true);
      vi.mocked(prisma.apiKey.delete).mockResolvedValue({} as never);

      const res = await request(createApp()).delete('/api-keys/key-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 if key not found', async () => {
      vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).delete('/api-keys/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api-keys/:id/regenerate', () => {
    it('should regenerate an API key', async () => {
      vi.mocked(prisma.apiKey.findUnique).mockResolvedValue({
        id: 'key-1', workspaceId: 'ws-1',
      } as never);
      vi.mocked(hasAdminAccess).mockResolvedValue(true);
      vi.mocked(prisma.apiKey.update).mockResolvedValue({
        id: 'key-1', name: 'Test', keyPrefix: 'pw_newab',
        scopes: '["messages:read"]', isActive: true,
        expiresAt: null, createdAt: new Date(),
      } as never);

      const res = await request(createApp()).post('/api-keys/key-1/regenerate');

      expect(res.status).toBe(200);
      expect(res.body.key).toBeDefined();
    });

    it('should return 404 if key not found', async () => {
      vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).post('/api-keys/nonexistent/regenerate');

      expect(res.status).toBe(404);
    });
  });
});
