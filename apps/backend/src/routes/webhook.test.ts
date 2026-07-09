import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('@pulseweave/database', () => ({
  prisma: {
    webhook: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    webhookDelivery: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    incomingWebhook: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    channel: {
      findFirst: vi.fn(),
    },
    workspace: {
      findUnique: vi.fn(),
    },
  },
}));

const { WEBHOOK_EVENTS, generateWebhookToken, processIncomingWebhook } = vi.hoisted(() => ({
  WEBHOOK_EVENTS: { 'message.created': 'Message Created', 'message.updated': 'Message Updated' },
  generateWebhookToken: vi.fn(() => 'webhook-token-123'),
  processIncomingWebhook: vi.fn(),
}));
vi.mock('../services/webhooks', () => ({ WEBHOOK_EVENTS, generateWebhookToken, processIncomingWebhook }));

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

vi.mock('../utils/url-validator', () => ({
  validateWebhookUrl: vi.fn(() => ({ isValid: true })),
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { prisma } from '@pulseweave/database';
import { hasAdminAccess } from '../utils/workspace-access';
import { validateWebhookUrl } from '../utils/url-validator';
import webhookRouter from './webhook';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/webhooks', webhookRouter);
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

describe('webhook routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasAdminAccess).mockResolvedValue(true);
    vi.mocked(validateWebhookUrl).mockReturnValue({ isValid: true });
  });

  describe('GET /webhooks/events', () => {
    it('should return available webhook events', async () => {
      const res = await request(createApp()).get('/webhooks/events');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message.created');
    });
  });

  describe('GET /webhooks/workspace/:workspaceId', () => {
    it('should list webhooks for admin', async () => {
      vi.mocked(prisma.webhook.findMany).mockResolvedValue([
        {
          id: 'wh-1', name: 'Test', url: 'https://example.com/hook',
          events: '["message.created"]', headers: null, secret: null,
          user: { id: 'u1', displayName: 'User', username: 'user' },
          _count: { deliveries: 5 },
        },
      ] as never);

      const res = await request(createApp()).get('/webhooks/workspace/ws-1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].events).toEqual(['message.created']);
    });

    it('should return 403 for non-admin', async () => {
      vi.mocked(hasAdminAccess).mockResolvedValue(false);

      const res = await request(createApp()).get('/webhooks/workspace/ws-1');

      expect(res.status).toBe(403);
    });
  });

  describe('POST /webhooks/workspace/:workspaceId', () => {
    it('should create a webhook', async () => {
      vi.mocked(prisma.webhook.create).mockResolvedValue({
        id: 'wh-1', name: 'Test', url: 'https://example.com/hook',
        events: '["message.created"]', headers: null, secret: null,
      } as never);

      const res = await request(createApp())
        .post('/webhooks/workspace/ws-1')
        .send({ name: 'Test', url: 'https://example.com/hook', events: ['message.created'] });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('wh-1');
    });

    it('should return 403 for non-admin', async () => {
      vi.mocked(hasAdminAccess).mockResolvedValue(false);

      const res = await request(createApp())
        .post('/webhooks/workspace/ws-1')
        .send({ name: 'Test', url: 'https://example.com/hook', events: ['message.created'] });

      expect(res.status).toBe(403);
    });

    it('should return 400 for invalid URL', async () => {
      vi.mocked(validateWebhookUrl).mockReturnValue({ isValid: false, error: 'Blocked IP' });

      const res = await request(createApp())
        .post('/webhooks/workspace/ws-1')
        .send({ name: 'Test', url: 'http://127.0.0.1/hook', events: ['message.created'] });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid event', async () => {
      const res = await request(createApp())
        .post('/webhooks/workspace/ws-1')
        .send({ name: 'Test', url: 'https://example.com/hook', events: ['invalid.event'] });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /webhooks/:id', () => {
    it('should update a webhook', async () => {
      vi.mocked(prisma.webhook.findUnique).mockResolvedValue({
        id: 'wh-1', workspaceId: 'ws-1',
      } as never);
      vi.mocked(prisma.webhook.update).mockResolvedValue({
        id: 'wh-1', name: 'Updated', url: 'https://example.com/hook',
        events: '["message.created"]', headers: null, secret: null,
      } as never);

      const res = await request(createApp())
        .patch('/webhooks/wh-1')
        .send({ name: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated');
    });

    it('should return 404 if webhook not found', async () => {
      vi.mocked(prisma.webhook.findUnique).mockResolvedValue(null);

      const res = await request(createApp())
        .patch('/webhooks/nonexistent')
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /webhooks/:id', () => {
    it('should delete a webhook', async () => {
      vi.mocked(prisma.webhook.findUnique).mockResolvedValue({
        id: 'wh-1', workspaceId: 'ws-1',
      } as never);
      vi.mocked(prisma.webhook.delete).mockResolvedValue({} as never);

      const res = await request(createApp()).delete('/webhooks/wh-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 if webhook not found', async () => {
      vi.mocked(prisma.webhook.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).delete('/webhooks/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /webhooks/:id/deliveries', () => {
    it('should return delivery history', async () => {
      vi.mocked(prisma.webhook.findUnique).mockResolvedValue({
        id: 'wh-1', workspaceId: 'ws-1',
      } as never);
      vi.mocked(prisma.webhookDelivery.findMany).mockResolvedValue([
        { id: 'del-1', event: 'message.created', payload: '{"test":true}', statusCode: 200, success: true },
      ] as never);
      vi.mocked(prisma.webhookDelivery.count).mockResolvedValue(1);

      const res = await request(createApp()).get('/webhooks/wh-1/deliveries');

      expect(res.status).toBe(200);
      expect(res.body.deliveries).toHaveLength(1);
      expect(res.body.pagination.total).toBe(1);
    });
  });

  describe('Incoming webhooks', () => {
    describe('GET /webhooks/incoming/workspace/:workspaceId', () => {
      it('should list incoming webhooks', async () => {
        vi.mocked(prisma.incomingWebhook.findMany).mockResolvedValue([
          {
            id: 'iw-1', name: 'Incoming', token: 'tok-1', allowedIps: null,
            user: { id: 'u1', displayName: 'User', username: 'user' },
            channel: { id: 'ch-1', name: 'general' },
          },
        ] as never);

        const res = await request(createApp()).get('/webhooks/incoming/workspace/ws-1');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].webhookUrl).toContain('/api/hooks/tok-1');
      });
    });

    describe('POST /webhooks/incoming/workspace/:workspaceId', () => {
      it('should create an incoming webhook', async () => {
        vi.mocked(prisma.incomingWebhook.create).mockResolvedValue({
          id: 'iw-1', name: 'Incoming', token: 'webhook-token-123', allowedIps: null,
          channel: { id: 'ch-1', name: 'general' },
        } as never);

        const res = await request(createApp())
          .post('/webhooks/incoming/workspace/ws-1')
          .send({ name: 'Incoming' });

        expect(res.status).toBe(201);
        expect(res.body.token).toBe('webhook-token-123');
      });

      it('should return 404 if channel not found', async () => {
        vi.mocked(prisma.channel.findFirst).mockResolvedValue(null);

        const res = await request(createApp())
          .post('/webhooks/incoming/workspace/ws-1')
          .send({ name: 'Incoming', channelId: 'nonexistent' });

        expect(res.status).toBe(404);
      });
    });

    describe('PATCH /webhooks/incoming/:id', () => {
      it('should update an incoming webhook', async () => {
        vi.mocked(prisma.incomingWebhook.findUnique).mockResolvedValue({
          id: 'iw-1', workspaceId: 'ws-1',
        } as never);
        vi.mocked(prisma.incomingWebhook.update).mockResolvedValue({
          id: 'iw-1', name: 'Updated', token: 'tok-1', allowedIps: '["10.0.0.1"]',
          channel: { id: 'ch-1', name: 'general' },
        } as never);

        const res = await request(createApp())
          .patch('/webhooks/incoming/iw-1')
          .send({ name: 'Updated' });

        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Updated');
      });
    });

    describe('DELETE /webhooks/incoming/:id', () => {
      it('should delete an incoming webhook', async () => {
        vi.mocked(prisma.incomingWebhook.findUnique).mockResolvedValue({
          id: 'iw-1', workspaceId: 'ws-1',
        } as never);
        vi.mocked(prisma.incomingWebhook.delete).mockResolvedValue({} as never);

        const res = await request(createApp()).delete('/webhooks/incoming/iw-1');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });
    });

    describe('POST /webhooks/incoming/:id/regenerate', () => {
      it('should regenerate token', async () => {
        vi.mocked(prisma.incomingWebhook.findUnique).mockResolvedValue({
          id: 'iw-1', workspaceId: 'ws-1',
        } as never);
        vi.mocked(prisma.incomingWebhook.update).mockResolvedValue({
          id: 'iw-1', name: 'Test', token: 'new-token', allowedIps: null,
          channel: { id: 'ch-1', name: 'general' },
        } as never);

        const res = await request(createApp()).post('/webhooks/incoming/iw-1/regenerate');

        expect(res.status).toBe(200);
        expect(res.body.token).toBe('new-token');
      });
    });

    describe('POST /webhooks/hooks/:token', () => {
      it('should process incoming webhook payload', async () => {
        processIncomingWebhook.mockResolvedValue({
          success: true,
          message: { id: 'msg-1', channelId: 'ch-1', content: 'Hello' },
        });

        const res = await request(createApp())
          .post('/webhooks/hooks/webhook-token-123')
          .send({ text: 'Hello from external service' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });

      it('should return 400 if processing fails', async () => {
        processIncomingWebhook.mockResolvedValue({
          success: false,
          error: 'Invalid token',
        });

        const res = await request(createApp())
          .post('/webhooks/hooks/invalid-token')
          .send({ text: 'Hello' });

        expect(res.status).toBe(400);
      });
    });
  });
});
