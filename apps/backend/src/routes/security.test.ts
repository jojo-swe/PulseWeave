import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('@pulseweave/database', () => ({
  prisma: {
    auditLog: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  },
  Prisma: {},
}));

const { isIpBlocked, blockIp, getClientIp } = vi.hoisted(() => ({
  isIpBlocked: vi.fn(() => ({ blocked: false, reason: null, until: null })),
  blockIp: vi.fn(),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('../middleware/advanced-security', () => ({ isIpBlocked, blockIp, getClientIp }));

vi.mock('../middleware/ssl', () => ({
  getSslConfig: vi.fn(() => ({ enabled: true, minVersion: 'TLSv1.2' })),
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { userId: string }).userId = 'test-user-id';
    next();
  },
  AuthRequest: class AuthRequest {},
}));

vi.mock('../middleware/rbac', () => ({
  requireAdmin: (...args: unknown[]) => {
    // When called as factory: requireAdmin(getWorkspaceId) -> returns middleware
    if (typeof args[0] === 'function') {
      return (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();
    }
    // When called directly as middleware: requireAdmin(req, res, next)
    if (args.length >= 3 && typeof args[2] === 'function') {
      (args[2] as express.NextFunction)();
      return;
    }
    // Fallback: return pass-through middleware
    return (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();
  },
  requirePermission: (_perm: string) => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock('../services/rbac', () => ({
  PERMISSIONS: { workspace: { viewAuditLog: 'workspace.viewAuditLog' } },
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { prisma } from '@pulseweave/database';
import { securityRouter } from './security';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/security', securityRouter);
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

describe('security routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /security/status', () => {
    it('should return security status', async () => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([] as never);
      vi.mocked(prisma.auditLog.count).mockResolvedValue(0 as never);
      vi.mocked(prisma.user.count).mockResolvedValue(10 as never);

      const res = await request(createApp()).get('/security/status?workspaceId=ws-1');

      expect(res.status).toBe(200);
      expect(res.body.ssl.enabled).toBe(true);
      expect(res.body.stats.totalUsers).toBe(10);
    });
  });

  describe('POST /security/block-ip', () => {
    it('should block an IP', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const res = await request(createApp())
        .post('/security/block-ip')
        .send({ ip: '192.168.1.100', reason: 'Malicious activity' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(blockIp).toHaveBeenCalledWith('192.168.1.100', 'Malicious activity', undefined);
    });

    it('should return 400 for invalid IP', async () => {
      const res = await request(createApp())
        .post('/security/block-ip')
        .send({ ip: 'not-an-ip', reason: 'test' });

      expect(res.status).toBe(400);
    });

    it('should return 400 when blocking localhost in dev', async () => {
      const res = await request(createApp())
        .post('/security/block-ip')
        .send({ ip: '127.0.0.1', reason: 'test' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /security/check-ip/:ip', () => {
    it('should check if IP is blocked', async () => {
      isIpBlocked.mockReturnValue({ blocked: true, reason: 'spam', until: new Date('2099-12-31') });

      const res = await request(createApp()).get('/security/check-ip/192.168.1.100');

      expect(res.status).toBe(200);
      expect(res.body.blocked).toBe(true);
      expect(res.body.reason).toBe('spam');
    });

    it('should return not blocked for clean IP', async () => {
      isIpBlocked.mockReturnValue({ blocked: false, reason: null, until: null });

      const res = await request(createApp()).get('/security/check-ip/10.0.0.1');

      expect(res.status).toBe(200);
      expect(res.body.blocked).toBe(false);
    });
  });

  describe('GET /security/locked-accounts', () => {
    it('should return locked accounts', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        {
          id: 'u1', email: 'u1@test.com', username: 'user1', displayName: 'User 1',
          lockedUntil: new Date(), isActive: false, failedLoginAttempts: 5,
          lastLoginAt: null, lastLoginIp: null,
        },
      ] as never);

      const res = await request(createApp()).get('/security/locked-accounts?workspaceId=ws-1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('POST /security/unlock-account/:userId', () => {
    it('should unlock an account', async () => {
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const res = await request(createApp()).post('/security/unlock-account/u1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /security/audit', () => {
    it('should return audit logs with pagination', async () => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
        {
          id: 'log-1', action: 'LOGIN_FAILED',
          user: { id: 'u1', displayName: 'User', username: 'user', email: 'u@test.com' },
        },
      ] as never);
      vi.mocked(prisma.auditLog.count).mockResolvedValue(1 as never);

      const res = await request(createApp()).get('/security/audit');

      expect(res.status).toBe(200);
      expect(res.body.logs).toHaveLength(1);
      expect(res.body.pagination.total).toBe(1);
    });
  });

  describe('GET /security/summary', () => {
    it('should return security event summary', async () => {
      vi.mocked(prisma.auditLog.count).mockResolvedValue(5 as never);

      const res = await request(createApp()).get('/security/summary');

      expect(res.status).toBe(200);
      expect(res.body.last24Hours.successfulLogins).toBe(5);
      expect(res.body.last7Days.failedLogins).toBe(5);
      expect(res.body.last30Days.successfulLogins).toBe(5);
    });
  });
});
