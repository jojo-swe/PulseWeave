import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('@pulseweave/database', () => ({
  prisma: {
    userPreferences: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: (req: express.Request, res: express.Response, next: express.NextFunction) => {
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
import preferencesRouter from './preferences';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/preferences', preferencesRouter);
  // Error handler
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof Error) {
      const status = (err as Error & { statusCode?: number }).statusCode ?? 500;
      res.status(status).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Unknown error' });
    }
  });
  return app;
}

describe('preferences routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /preferences', () => {
    it('should return existing preferences', async () => {
      const prefs = { id: 'pref-1', userId: 'test-user-id', theme: 'dark' };
      vi.mocked(prisma.userPreferences.findUnique).mockResolvedValue(prefs as never);

      const res = await request(createApp()).get('/preferences');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(prefs);
    });

    it('should create default preferences if none exist', async () => {
      vi.mocked(prisma.userPreferences.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.userPreferences.create).mockResolvedValue({
        id: 'pref-1',
        userId: 'test-user-id',
        theme: 'system',
      } as never);

      const res = await request(createApp()).get('/preferences');

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe('test-user-id');
      expect(prisma.userPreferences.create).toHaveBeenCalledWith({
        data: { userId: 'test-user-id' },
      });
    });
  });

  describe('PATCH /preferences', () => {
    it('should upsert preferences', async () => {
      const prefs = { id: 'pref-1', userId: 'test-user-id', theme: 'dark' };
      vi.mocked(prisma.userPreferences.upsert).mockResolvedValue(prefs as never);

      const res = await request(createApp())
        .patch('/preferences')
        .send({ theme: 'dark', soundEnabled: true });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(prefs);
      expect(prisma.userPreferences.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'test-user-id' },
          update: { theme: 'dark', soundEnabled: true },
        })
      );
    });

    it('should reject invalid theme value', async () => {
      const res = await request(createApp())
        .patch('/preferences')
        .send({ theme: 'invalid-theme' });

      expect(res.status).toBe(400);
    });

    it('should reject invalid quiet hours format', async () => {
      const res = await request(createApp())
        .patch('/preferences')
        .send({ quietHoursStart: '25:00' });

      expect(res.status).toBe(400);
    });

    it('should accept valid quiet hours format', async () => {
      vi.mocked(prisma.userPreferences.upsert).mockResolvedValue({
        id: 'pref-1',
        quietHoursStart: '22:00',
      } as never);

      const res = await request(createApp())
        .patch('/preferences')
        .send({ quietHoursStart: '22:00' });

      expect(res.status).toBe(200);
    });
  });

  describe('POST /preferences/reset', () => {
    it('should reset preferences to defaults', async () => {
      vi.mocked(prisma.userPreferences.deleteMany).mockResolvedValue({ count: 1 } as never);
      vi.mocked(prisma.userPreferences.create).mockResolvedValue({
        id: 'pref-new',
        userId: 'test-user-id',
        theme: 'system',
      } as never);

      const res = await request(createApp()).post('/preferences/reset');

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe('test-user-id');
      expect(prisma.userPreferences.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'test-user-id' },
      });
      expect(prisma.userPreferences.create).toHaveBeenCalled();
    });
  });
});
