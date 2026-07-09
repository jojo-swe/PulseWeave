import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('@pulseweave/database', () => ({
  prisma: {
    integration: {
      findMany: vi.fn(),
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
import integrationRouter from './integration';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/integrations', integrationRouter);
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

describe('integration routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasAdminAccess).mockResolvedValue(true);
    vi.mocked(validateWebhookUrl).mockReturnValue({ isValid: true });
  });

  describe('GET /integrations/types', () => {
    it('should return available integration types', async () => {
      const res = await request(createApp()).get('/integrations/types');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('n8n');
      expect(res.body).toHaveProperty('slack');
      expect(res.body).toHaveProperty('custom');
    });
  });

  describe('GET /integrations/workspace/:workspaceId', () => {
    it('should list integrations for admin', async () => {
      vi.mocked(prisma.integration.findMany).mockResolvedValue([
        {
          id: 'int-1', type: 'slack', name: 'Slack', config: '{"webhookUrl":"https://hooks.slack.com/x"}',
          user: { id: 'u1', displayName: 'User', username: 'user' },
        },
      ] as never);

      const res = await request(createApp()).get('/integrations/workspace/ws-1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].config).toEqual({ webhookUrl: 'https://hooks.slack.com/x' });
    });

    it('should return 403 for non-admin', async () => {
      vi.mocked(hasAdminAccess).mockResolvedValue(false);

      const res = await request(createApp()).get('/integrations/workspace/ws-1');

      expect(res.status).toBe(403);
    });
  });

  describe('GET /integrations/:id', () => {
    it('should return a single integration', async () => {
      vi.mocked(prisma.integration.findUnique).mockResolvedValue({
        id: 'int-1', type: 'slack', name: 'Slack', config: '{"webhookUrl":"https://hooks.slack.com/x"}',
        workspaceId: 'ws-1',
        user: { id: 'u1', displayName: 'User', username: 'user' },
      } as never);

      const res = await request(createApp()).get('/integrations/int-1');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('int-1');
    });

    it('should return 404 if not found', async () => {
      vi.mocked(prisma.integration.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).get('/integrations/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /integrations/workspace/:workspaceId', () => {
    it('should create an integration', async () => {
      vi.mocked(prisma.integration.create).mockResolvedValue({
        id: 'int-1', type: 'slack', name: 'Slack', config: '{"webhookUrl":"https://example.com"}',
        status: 'pending',
        user: { id: 'u1', displayName: 'User', username: 'user' },
      } as never);
      vi.mocked(prisma.integration.update).mockResolvedValue({
        id: 'int-1', type: 'slack', name: 'Slack', config: '{"webhookUrl":"https://example.com"}',
        status: 'connected',
      } as never);

      // Mock fetch
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      const res = await request(createApp())
        .post('/integrations/workspace/ws-1')
        .send({ type: 'slack', name: 'Slack', config: { webhookUrl: 'https://example.com' } });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('connected');

      global.fetch = originalFetch;
    });

    it('should return 403 for non-admin', async () => {
      vi.mocked(hasAdminAccess).mockResolvedValue(false);

      const res = await request(createApp())
        .post('/integrations/workspace/ws-1')
        .send({ type: 'slack', name: 'Slack', config: { webhookUrl: 'https://example.com' } });

      expect(res.status).toBe(403);
    });

    it('should return 400 for missing required field', async () => {
      const res = await request(createApp())
        .post('/integrations/workspace/ws-1')
        .send({ type: 'slack', name: 'Slack', config: {} });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /integrations/:id', () => {
    it('should update an integration', async () => {
      vi.mocked(prisma.integration.findUnique).mockResolvedValue({
        id: 'int-1', workspaceId: 'ws-1',
      } as never);
      vi.mocked(prisma.integration.update).mockResolvedValue({
        id: 'int-1', type: 'slack', name: 'Updated', config: '{"webhookUrl":"https://new.com"}',
        user: { id: 'u1', displayName: 'User', username: 'user' },
      } as never);

      const res = await request(createApp())
        .patch('/integrations/int-1')
        .send({ name: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated');
    });

    it('should return 404 if not found', async () => {
      vi.mocked(prisma.integration.findUnique).mockResolvedValue(null);

      const res = await request(createApp())
        .patch('/integrations/nonexistent')
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /integrations/:id', () => {
    it('should delete an integration', async () => {
      vi.mocked(prisma.integration.findUnique).mockResolvedValue({
        id: 'int-1', workspaceId: 'ws-1',
      } as never);
      vi.mocked(prisma.integration.delete).mockResolvedValue({} as never);

      const res = await request(createApp()).delete('/integrations/int-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 if not found', async () => {
      vi.mocked(prisma.integration.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).delete('/integrations/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /integrations/:id/test', () => {
    it('should test an integration', async () => {
      vi.mocked(prisma.integration.findUnique).mockResolvedValue({
        id: 'int-1', type: 'slack', name: 'Slack', workspaceId: 'ws-1',
        config: '{"webhookUrl":"https://example.com"}',
      } as never);
      vi.mocked(prisma.integration.update).mockResolvedValue({} as never);

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('OK'),
      } as unknown as Response);

      const res = await request(createApp()).post('/integrations/int-1/test');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      global.fetch = originalFetch;
    });

    it('should return 400 if no webhook URL', async () => {
      vi.mocked(prisma.integration.findUnique).mockResolvedValue({
        id: 'int-1', type: 'email', name: 'Email', workspaceId: 'ws-1',
        config: '{"recipients":"a@b.com"}',
      } as never);

      const res = await request(createApp()).post('/integrations/int-1/test');

      expect(res.status).toBe(400);
    });
  });
});
