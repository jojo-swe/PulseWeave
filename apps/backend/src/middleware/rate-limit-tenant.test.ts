import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Request } from 'express';

const { mockPrisma, capturedOptions } = vi.hoisted(() => ({
  mockPrisma: {
    subscription: {
      findUnique: vi.fn(),
    },
  },
  capturedOptions: {} as {
    max?: (req: Request) => Promise<number>;
    keyGenerator?: (req: Request) => string;
    handler?: (req: Request, res: unknown, next: unknown, options: { statusCode: number; windowMs: number }) => void;
  },
}));

vi.mock('@pulseweave/database', () => ({ prisma: mockPrisma }));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('express-rate-limit', () => ({
  default: vi.fn((opts) => {
    Object.assign(capturedOptions, opts);
    return vi.fn();
  }),
}));

import { tenantRateLimiter } from './rate-limit-tenant';

describe('middleware/rate-limit-tenant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.subscription.findUnique.mockResolvedValue(null);
  });

  it('should export tenantRateLimiter middleware', () => {
    expect(tenantRateLimiter).toBeDefined();
    expect(typeof tenantRateLimiter).toBe('function');
  });

  describe('max function', () => {
    it('should return free tier limit for unauthenticated requests', async () => {
      const req = { ip: '127.0.0.1', headers: {} } as unknown as Request;
      const limit = await capturedOptions.max!(req);
      expect(limit).toBe(100);
    });

    it('should return pro tier limit for active pro subscription', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({
        plan: 'pro',
        status: 'active',
      });

      const req = { ip: '127.0.0.1', headers: {}, userId: 'user-pro' } as unknown as Request;
      const limit = await capturedOptions.max!(req);
      expect(limit).toBe(1000);
    });

    it('should return enterprise tier limit for active enterprise subscription', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({
        plan: 'enterprise',
        status: 'active',
      });

      const req = { ip: '127.0.0.1', headers: {}, userId: 'user-ent' } as unknown as Request;
      const limit = await capturedOptions.max!(req);
      expect(limit).toBe(5000);
    });

    it('should return pro tier limit for trialing pro subscription', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({
        plan: 'pro',
        status: 'trialing',
      });

      const req = { ip: '127.0.0.1', headers: {}, userId: 'user-trial' } as unknown as Request;
      const limit = await capturedOptions.max!(req);
      expect(limit).toBe(1000);
    });

    it('should return free tier for canceled subscription', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({
        plan: 'pro',
        status: 'canceled',
      });

      const req = { ip: '127.0.0.1', headers: {}, userId: 'user-canceled' } as unknown as Request;
      const limit = await capturedOptions.max!(req);
      expect(limit).toBe(100);
    });

    it('should return free tier on DB error', async () => {
      mockPrisma.subscription.findUnique.mockRejectedValue(new Error('DB error'));

      const req = { ip: '127.0.0.1', headers: {}, userId: 'user-err' } as unknown as Request;
      const limit = await capturedOptions.max!(req);
      expect(limit).toBe(100);
    });

    it('should return free tier when no subscription found', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(null);

      const req = { ip: '127.0.0.1', headers: {}, userId: 'user-nosub' } as unknown as Request;
      const limit = await capturedOptions.max!(req);
      expect(limit).toBe(100);
    });
  });

  describe('keyGenerator', () => {
    it('should use workspace-based key when workspaceId is present', () => {
      const req = { ip: '127.0.0.1', headers: {}, workspaceId: 'ws-123' } as unknown as Request;
      const key = capturedOptions.keyGenerator!(req);
      expect(key).toBe('workspace:ws-123');
    });

    it('should use IP-based key when no workspaceId', () => {
      const req = { ip: '192.168.1.1', headers: {} } as unknown as Request;
      const key = capturedOptions.keyGenerator!(req);
      expect(key).toContain('ip:');
      expect(key).toContain('192.168.1.1');
    });

    it('should normalize IPv4-mapped IPv6 addresses', () => {
      const req = { ip: '::ffff:127.0.0.1', headers: {} } as unknown as Request;
      const key = capturedOptions.keyGenerator!(req);
      expect(key).toContain('127.0.0.1');
      expect(key).not.toContain('::ffff:');
    });

    it('should normalize IPv6 addresses using /64 prefix', () => {
      const req = { ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334', headers: {} } as unknown as Request;
      const key = capturedOptions.keyGenerator!(req);
      expect(key).toContain('2001:0db8:85a3:0000::');
    });

    it('should handle unknown IP', () => {
      const req = { ip: undefined, headers: {} } as unknown as Request;
      const key = capturedOptions.keyGenerator!(req);
      expect(key).toContain('ip:unknown');
    });
  });

  describe('handler', () => {
    it('should respond with rate limit exceeded error', () => {
      const res = {
        status: vi.fn(() => res),
        json: vi.fn(),
      };
      const next = vi.fn();

      capturedOptions.handler!(
        {} as Request,
        res as unknown,
        next,
        { statusCode: 429, windowMs: 60000 }
      );

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Rate limit exceeded',
          retryAfter: 60,
        })
      );
    });
  });
});
