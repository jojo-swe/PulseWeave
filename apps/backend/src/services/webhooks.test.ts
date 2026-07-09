import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@pulseweave/database', () => ({
  prisma: {
    workspace: {
      findUnique: vi.fn(),
    },
    webhook: {
      findMany: vi.fn(),
    },
    webhookDelivery: {
      create: vi.fn(),
    },
    incomingWebhook: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    message: {
      create: vi.fn(),
    },
  },
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
import {
  generateSignature,
  verifySignature,
  generateWebhookToken,
  dispatchWebhookEvent,
  processIncomingWebhook,
  WEBHOOK_EVENTS,
} from './webhooks';

describe('webhooks service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('WEBHOOK_EVENTS', () => {
    it('should export a non-empty object of events', () => {
      expect(Object.keys(WEBHOOK_EVENTS).length).toBeGreaterThan(0);
    });
  });

  describe('generateSignature', () => {
    it('should generate a hex HMAC signature', () => {
      const sig = generateSignature('test payload', 'secret');
      expect(sig).toHaveLength(64); // SHA-256 hex = 64 chars
    });

    it('should generate different signatures for different payloads', () => {
      const sig1 = generateSignature('payload1', 'secret');
      const sig2 = generateSignature('payload2', 'secret');
      expect(sig1).not.toBe(sig2);
    });

    it('should generate different signatures for different secrets', () => {
      const sig1 = generateSignature('payload', 'secret1');
      const sig2 = generateSignature('payload', 'secret2');
      expect(sig1).not.toBe(sig2);
    });
  });

  describe('verifySignature', () => {
    it('should return true for valid signature', () => {
      const payload = 'test payload';
      const secret = 'secret';
      const sig = generateSignature(payload, secret);
      expect(verifySignature(payload, sig, secret)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const sig = generateSignature('test payload', 'secret');
      // Flip a character to make it invalid but same length
      const invalidSig = sig.slice(0, -1) + (sig.slice(-1) === 'a' ? 'b' : 'a');
      expect(verifySignature('test payload', invalidSig, 'secret')).toBe(false);
    });
  });

  describe('generateWebhookToken', () => {
    it('should generate a 64-character hex token', () => {
      const token = generateWebhookToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should generate unique tokens', () => {
      const token1 = generateWebhookToken();
      const token2 = generateWebhookToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('dispatchWebhookEvent', () => {
    it('should return early if workspace not found', async () => {
      vi.mocked(prisma.workspace.findUnique).mockResolvedValue(null);

      await dispatchWebhookEvent('ws-1', 'message.created', { id: 'msg-1' });

      expect(prisma.webhook.findMany).not.toHaveBeenCalled();
    });

    it('should return early if no matching webhooks', async () => {
      vi.mocked(prisma.workspace.findUnique).mockResolvedValue({
        id: 'ws-1',
        name: 'Test Workspace',
      } as never);
      vi.mocked(prisma.webhook.findMany).mockResolvedValue([]);

      await dispatchWebhookEvent('ws-1', 'message.created', { id: 'msg-1' });

      expect(prisma.webhookDelivery.create).not.toHaveBeenCalled();
    });

    it('should return early if no webhooks match the event', async () => {
      vi.mocked(prisma.workspace.findUnique).mockResolvedValue({
        id: 'ws-1',
        name: 'Test Workspace',
      } as never);
      vi.mocked(prisma.webhook.findMany).mockResolvedValue([
        {
          id: 'wh-1',
          url: 'https://example.com/hook',
          secret: null,
          headers: null,
          timeoutMs: 5000,
          retryCount: 0,
          events: JSON.stringify(['channel.created']),
        } as never,
      ]);

      await dispatchWebhookEvent('ws-1', 'message.created', { id: 'msg-1' });

      expect(prisma.webhookDelivery.create).not.toHaveBeenCalled();
    });

    it('should dispatch to webhooks matching the event', async () => {
      vi.mocked(prisma.workspace.findUnique).mockResolvedValue({
        id: 'ws-1',
        name: 'Test Workspace',
      } as never);
      vi.mocked(prisma.webhook.findMany).mockResolvedValue([
        {
          id: 'wh-1',
          url: 'https://example.com/hook',
          secret: 'test-secret',
          headers: null,
          timeoutMs: 5000,
          retryCount: 0,
          events: JSON.stringify(['message.created']),
        } as never,
      ]);
      vi.mocked(prisma.webhookDelivery.create).mockResolvedValue({} as never);

      // Mock fetch
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('OK'),
      }) as never;

      await dispatchWebhookEvent('ws-1', 'message.created', { id: 'msg-1' });

      expect(prisma.webhookDelivery.create).toHaveBeenCalled();
      globalThis.fetch = originalFetch;
    });

    it('should dispatch to webhooks with wildcard event', async () => {
      vi.mocked(prisma.workspace.findUnique).mockResolvedValue({
        id: 'ws-1',
        name: 'Test Workspace',
      } as never);
      vi.mocked(prisma.webhook.findMany).mockResolvedValue([
        {
          id: 'wh-1',
          url: 'https://example.com/hook',
          secret: null,
          headers: null,
          timeoutMs: 5000,
          retryCount: 0,
          events: JSON.stringify(['*']),
        } as never,
      ]);
      vi.mocked(prisma.webhookDelivery.create).mockResolvedValue({} as never);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('OK'),
      }) as never;

      await dispatchWebhookEvent('ws-1', 'message.created', { id: 'msg-1' });

      expect(prisma.webhookDelivery.create).toHaveBeenCalled();
      globalThis.fetch = originalFetch;
    });
  });

  describe('processIncomingWebhook', () => {
    it('should return error for invalid token', async () => {
      vi.mocked(prisma.incomingWebhook.findUnique).mockResolvedValue(null);

      const result = await processIncomingWebhook('invalid-token', { text: 'hello' }, '127.0.0.1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid webhook token');
    });

    it('should return error for disabled webhook', async () => {
      vi.mocked(prisma.incomingWebhook.findUnique).mockResolvedValue({
        id: 'wh-1',
        isActive: false,
        channelId: 'ch-1',
        workspaceId: 'ws-1',
        userId: 'user-1',
        allowedIps: null,
        channel: { id: 'ch-1' },
      } as never);

      const result = await processIncomingWebhook('valid-token', { text: 'hello' }, '127.0.0.1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Webhook is disabled');
    });

    it('should return error for IP not in whitelist', async () => {
      vi.mocked(prisma.incomingWebhook.findUnique).mockResolvedValue({
        id: 'wh-1',
        isActive: true,
        channelId: 'ch-1',
        workspaceId: 'ws-1',
        userId: 'user-1',
        allowedIps: JSON.stringify(['10.0.0.1']),
        channel: { id: 'ch-1' },
      } as never);

      const result = await processIncomingWebhook('valid-token', { text: 'hello' }, '127.0.0.1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('IP not allowed');
    });

    it('should allow IP in whitelist', async () => {
      vi.mocked(prisma.incomingWebhook.findUnique).mockResolvedValue({
        id: 'wh-1',
        isActive: true,
        channelId: 'ch-1',
        workspaceId: 'ws-1',
        userId: 'user-1',
        allowedIps: JSON.stringify(['127.0.0.1']),
        channel: { id: 'ch-1' },
      } as never);
      vi.mocked(prisma.message.create).mockResolvedValue({
        id: 'msg-1',
        content: 'hello',
      } as never);
      vi.mocked(prisma.incomingWebhook.update).mockResolvedValue({} as never);

      const result = await processIncomingWebhook('valid-token', { text: 'hello' }, '127.0.0.1');

      expect(result.success).toBe(true);
    });

    it('should return error for no target channel', async () => {
      vi.mocked(prisma.incomingWebhook.findUnique).mockResolvedValue({
        id: 'wh-1',
        isActive: true,
        channelId: null,
        workspaceId: 'ws-1',
        userId: 'user-1',
        allowedIps: null,
        channel: null,
      } as never);

      const result = await processIncomingWebhook('valid-token', { text: 'hello' }, '127.0.0.1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No target channel configured');
    });

    it('should return error for no message content', async () => {
      vi.mocked(prisma.incomingWebhook.findUnique).mockResolvedValue({
        id: 'wh-1',
        isActive: true,
        channelId: 'ch-1',
        workspaceId: 'ws-1',
        userId: 'user-1',
        allowedIps: null,
        channel: { id: 'ch-1' },
      } as never);

      const result = await processIncomingWebhook('valid-token', {}, '127.0.0.1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No message content provided');
    });

    it('should accept content field as alternative to text', async () => {
      vi.mocked(prisma.incomingWebhook.findUnique).mockResolvedValue({
        id: 'wh-1',
        isActive: true,
        channelId: 'ch-1',
        workspaceId: 'ws-1',
        userId: 'user-1',
        allowedIps: null,
        channel: { id: 'ch-1' },
      } as never);
      vi.mocked(prisma.message.create).mockResolvedValue({
        id: 'msg-1',
        content: 'hello from content',
      } as never);
      vi.mocked(prisma.incomingWebhook.update).mockResolvedValue({} as never);

      const result = await processIncomingWebhook('valid-token', { content: 'hello from content' }, '127.0.0.1');

      expect(result.success).toBe(true);
      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ content: 'hello from content' }),
        })
      );
    });

    it('should create message and update webhook stats on success', async () => {
      vi.mocked(prisma.incomingWebhook.findUnique).mockResolvedValue({
        id: 'wh-1',
        isActive: true,
        channelId: 'ch-1',
        workspaceId: 'ws-1',
        userId: 'user-1',
        allowedIps: null,
        channel: { id: 'ch-1' },
      } as never);
      vi.mocked(prisma.message.create).mockResolvedValue({
        id: 'msg-1',
        content: 'hello',
      } as never);
      vi.mocked(prisma.incomingWebhook.update).mockResolvedValue({} as never);

      const result = await processIncomingWebhook('valid-token', { text: 'hello' }, '127.0.0.1');

      expect(result.success).toBe(true);
      expect(result.message).toEqual({ id: 'msg-1', content: 'hello' });
      expect(prisma.incomingWebhook.update).toHaveBeenCalledWith({
        where: { id: 'wh-1' },
        data: {
          lastUsedAt: expect.any(Date),
          usageCount: { increment: 1 },
        },
      });
    });
  });
});
