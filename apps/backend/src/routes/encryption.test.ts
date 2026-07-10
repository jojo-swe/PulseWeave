import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('@pulseweave/database', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    channel: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    channelMember: {
      findMany: vi.fn(),
    },
    workspaceMember: {
      findMany: vi.fn(),
    },
    conversation: {
      findFirst: vi.fn(),
    },
  },
}));

const { isValidPublicKey, generateKeyId, checkEncryptionReadiness } = vi.hoisted(() => ({
  isValidPublicKey: vi.fn(() => true),
  generateKeyId: vi.fn(() => 'key-id-123'),
  checkEncryptionReadiness: vi.fn(() => ({
    allMembersHaveKeys: true,
    membersWithoutKeys: [],
    totalMembers: 2,
    membersWithKeys: 2,
  })),
}));

const { publicKeySchema } = vi.hoisted(() => ({
  publicKeySchema: {
    parse: (data: unknown) => {
      const obj = data as Record<string, unknown>;
      if (!obj || typeof obj.publicKey !== 'string' || !obj.publicKey) {
        throw { errors: [{ message: 'Invalid' }] };
      }
      return obj;
    },
  },
}));

vi.mock('../services/encryption', () => {
  return {
    publicKeySchema,
    generateKeyId,
    isValidPublicKey,
    checkEncryptionReadiness,
    EncryptionAuditEvents: {
      KEY_REGISTERED: 'KEY_REGISTERED',
      CHANNEL_ENCRYPTION_ENABLED: 'CHANNEL_ENCRYPTION_ENABLED',
      CHANNEL_ENCRYPTION_DISABLED: 'CHANNEL_ENCRYPTION_DISABLED',
    },
  };
});

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
import { encryptionRouter } from './encryption';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { userId: string }).userId = 'test-user-id';
    next();
  });
  app.use('/encryption', encryptionRouter);
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

describe('encryption routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isValidPublicKey.mockReturnValue(true);
    generateKeyId.mockReturnValue('key-id-123');
    checkEncryptionReadiness.mockReturnValue({
      allMembersHaveKeys: true,
      membersWithoutKeys: [],
      totalMembers: 2,
      membersWithKeys: 2,
    });
  });

  describe('POST /encryption/keys', () => {
    it('should register a public key', async () => {
      vi.mocked(prisma.user.update).mockResolvedValue({
        id: 'test-user-id', username: 'me', publicKey: 'pub-key', publicKeyId: 'key-id-123', keyUpdatedAt: new Date(),
      } as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const res = await request(createApp())
        .post('/encryption/keys')
        .send({ publicKey: 'valid-base64-key' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.keyId).toBe('key-id-123');
    });

    it('should return 400 for invalid public key', async () => {
      isValidPublicKey.mockReturnValue(false);

      const res = await request(createApp())
        .post('/encryption/keys')
        .send({ publicKey: 'invalid' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /encryption/keys/me', () => {
    it('should return user key info', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'test-user-id', username: 'me', publicKey: 'pub-key', publicKeyId: 'key-1', keyUpdatedAt: new Date(),
      } as never);

      const res = await request(createApp()).get('/encryption/keys/me');

      expect(res.status).toBe(200);
      expect(res.body.hasKey).toBe(true);
      expect(res.body.keyId).toBe('key-1');
    });

    it('should return hasKey false if no key', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'test-user-id', username: 'me', publicKey: null, publicKeyId: null, keyUpdatedAt: null,
      } as never);

      const res = await request(createApp()).get('/encryption/keys/me');

      expect(res.status).toBe(200);
      expect(res.body.hasKey).toBe(false);
    });

    it('should return 404 if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).get('/encryption/keys/me');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /encryption/keys/batch', () => {
    it('should return keys for multiple users', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: 'u1', username: 'user1', publicKey: 'key1', publicKeyId: 'kid1' },
        { id: 'u2', username: 'user2', publicKey: null, publicKeyId: null },
      ] as never);

      const res = await request(createApp())
        .post('/encryption/keys/batch')
        .send({ userIds: ['u1', 'u2'] });

      expect(res.status).toBe(200);
      expect(res.body.keys).toHaveLength(1);
      expect(res.body.keys[0].userId).toBe('u1');
      expect(res.body.missingKeys).toContain('u2');
    });
  });

  describe('GET /encryption/channel/:channelId/keys', () => {
    it('should return channel member keys', async () => {
      vi.mocked(prisma.channel.findFirst).mockResolvedValue({
        id: 'ch-1', isPrivate: false, isEncrypted: false,
        members: [],
        workspace: {
          members: [
            { user: { id: 'u1', username: 'user1', publicKey: 'key1', publicKeyId: 'kid1' } },
          ],
        },
      } as never);

      const res = await request(createApp()).get('/encryption/channel/ch-1/keys');

      expect(res.status).toBe(200);
      expect(res.body.channelId).toBe('ch-1');
      expect(res.body.keys).toHaveLength(1);
    });

    it('should return 404 if channel not found', async () => {
      vi.mocked(prisma.channel.findFirst).mockResolvedValue(null);

      const res = await request(createApp()).get('/encryption/channel/nonexistent/keys');

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /encryption/channel/:channelId', () => {
    it('should enable encryption as owner', async () => {
      vi.mocked(prisma.channel.findUnique).mockResolvedValue({
        id: 'ch-1', isPrivate: false, workspaceId: 'ws-1',
        workspace: { ownerId: 'test-user-id', members: [] },
      } as never);
      vi.mocked(prisma.workspaceMember.findMany).mockResolvedValue([
        { user: { id: 'u1', username: 'user1', publicKey: 'key1' } },
      ] as never);
      vi.mocked(prisma.channel.update).mockResolvedValue({
        id: 'ch-1', isEncrypted: true,
      } as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const res = await request(createApp())
        .patch('/encryption/channel/ch-1')
        .send({ enabled: true });

      expect(res.status).toBe(200);
      expect(res.body.isEncrypted).toBe(true);
    });

    it('should disable encryption', async () => {
      vi.mocked(prisma.channel.findUnique).mockResolvedValue({
        id: 'ch-1', isPrivate: false, workspaceId: 'ws-1',
        workspace: { ownerId: 'test-user-id', members: [] },
      } as never);
      vi.mocked(prisma.channel.update).mockResolvedValue({
        id: 'ch-1', isEncrypted: false,
      } as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const res = await request(createApp())
        .patch('/encryption/channel/ch-1')
        .send({ enabled: false });

      expect(res.status).toBe(200);
      expect(res.body.isEncrypted).toBe(false);
    });

    it('should return 403 for non-admin/owner', async () => {
      vi.mocked(prisma.channel.findUnique).mockResolvedValue({
        id: 'ch-1', workspaceId: 'ws-1',
        workspace: { ownerId: 'other-user', members: [{ role: { name: 'member' }, roleName: 'member' }] },
      } as never);

      const res = await request(createApp())
        .patch('/encryption/channel/ch-1')
        .send({ enabled: true });

      expect(res.status).toBe(403);
    });

    it('should return 400 if enabling but members lack keys', async () => {
      vi.mocked(prisma.channel.findUnique).mockResolvedValue({
        id: 'ch-1', isPrivate: false, workspaceId: 'ws-1',
        workspace: { ownerId: 'test-user-id', members: [] },
      } as never);
      vi.mocked(prisma.workspaceMember.findMany).mockResolvedValue([
        { user: { id: 'u1', username: 'user1', publicKey: null } },
      ] as never);
      checkEncryptionReadiness.mockReturnValue({
        allMembersHaveKeys: false,
        membersWithoutKeys: ['user1'],
        totalMembers: 1,
        membersWithKeys: 0,
      });

      const res = await request(createApp())
        .patch('/encryption/channel/ch-1')
        .send({ enabled: true });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /encryption/conversation/:conversationId/status', () => {
    it('should return conversation encryption status', async () => {
      vi.mocked(prisma.conversation.findFirst).mockResolvedValue({
        id: 'conv-1',
        members: [
          { user: { id: 'u1', username: 'user1', publicKey: 'key1', publicKeyId: 'kid1' } },
        ],
      } as never);

      const res = await request(createApp()).get('/encryption/conversation/conv-1/status');

      expect(res.status).toBe(200);
      expect(res.body.conversationId).toBe('conv-1');
      expect(res.body.keys).toHaveLength(1);
    });

    it('should return 404 if conversation not found', async () => {
      vi.mocked(prisma.conversation.findFirst).mockResolvedValue(null);

      const res = await request(createApp()).get('/encryption/conversation/nonexistent/status');

      expect(res.status).toBe(404);
    });
  });
});
