import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { ZodError } from 'zod';

vi.mock('@pulseweave/database', () => ({
  prisma: {
    pushSubscription: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
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

const { sendToUser } = vi.hoisted(() => ({ sendToUser: vi.fn() }));

vi.mock('../services/notifications', () => ({
  NotificationService: {
    sendToUser,
  },
}));

import { prisma } from '@pulseweave/database';
import { notificationRouter } from './notifications';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/notifications', notificationRouter);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: err.errors.map((e) => e.message).join(', ') });
    } else if (err instanceof Error) {
      const status = (err as Error & { statusCode?: number }).statusCode ?? 500;
      res.status(status).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Unknown error' });
    }
  });
  return app;
}

describe('notifications routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /notifications/vapid-key', () => {
    it('should return VAPID public key', async () => {
      const res = await request(createApp()).get('/notifications/vapid-key');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('publicKey');
      expect(typeof res.body.publicKey).toBe('string');
    });
  });

  describe('POST /notifications/subscribe', () => {
    it('should subscribe user to push notifications', async () => {
      vi.mocked(prisma.pushSubscription.upsert).mockResolvedValue({} as never);

      const res = await request(createApp())
        .post('/notifications/subscribe')
        .send({
          endpoint: 'https://fcm.googleapis.com/test',
          keys: { p256dh: 'key1', auth: 'auth1' },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { endpoint: 'https://fcm.googleapis.com/test' },
          create: expect.objectContaining({
            userId: 'test-user-id',
            endpoint: 'https://fcm.googleapis.com/test',
            p256dh: 'key1',
            auth: 'auth1',
          }),
        })
      );
    });

    it('should reject invalid endpoint (not URL)', async () => {
      const res = await request(createApp())
        .post('/notifications/subscribe')
        .send({
          endpoint: 'not-a-url',
          keys: { p256dh: 'key1', auth: 'auth1' },
        });

      expect(res.status).toBe(400);
    });

    it('should reject missing keys', async () => {
      const res = await request(createApp())
        .post('/notifications/subscribe')
        .send({
          endpoint: 'https://fcm.googleapis.com/test',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /notifications/unsubscribe', () => {
    it('should unsubscribe user', async () => {
      vi.mocked(prisma.pushSubscription.deleteMany).mockResolvedValue({ count: 1 } as never);

      const res = await request(createApp())
        .post('/notifications/unsubscribe')
        .send({ endpoint: 'https://fcm.googleapis.com/test' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: {
          endpoint: 'https://fcm.googleapis.com/test',
          userId: 'test-user-id',
        },
      });
    });

    it('should reject invalid endpoint', async () => {
      const res = await request(createApp())
        .post('/notifications/unsubscribe')
        .send({ endpoint: 'not-a-url' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /notifications/test', () => {
    it('should send a test notification', async () => {
      sendToUser.mockResolvedValue(undefined);

      const res = await request(createApp()).post('/notifications/test');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(sendToUser).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({
          title: 'Test Notification',
        })
      );
    });
  });
});
