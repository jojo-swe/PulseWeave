import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('@pulseweave/database', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

type ResDouble = {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  setHeader?: ReturnType<typeof vi.fn>;
};

function makeRes() {
  const res = {} as ResDouble;
  const json = vi.fn(() => res as unknown);
  const status = vi.fn(() => res as unknown);
  res.json = json;
  res.status = status;
  return { res, status, json };
}

describe('middleware/advanced-security', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...envBackup,
      MAX_FAILED_ATTEMPTS: '2',
      IP_BLOCK_DURATION_MINUTES: '30',
      ATTEMPT_WINDOW_MINUTES: '15',
      ACCOUNT_MAX_FAILED_ATTEMPTS: '2',
      ACCOUNT_LOCKOUT_DURATION_MINUTES: '15',
    };

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    process.env = { ...envBackup };
  });

  it('getClientIp prefers x-forwarded-for', async () => {
    vi.resetModules();
    const { getClientIp } = await import('./advanced-security');

    const req = {
      headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' },
      ip: '9.9.9.9',
      socket: { remoteAddress: '8.8.8.8' },
    } as unknown as Request;

    expect(getClientIp(req)).toBe('1.1.1.1');
  });

  it('recordFailedAttempt blocks IP after threshold', async () => {
    vi.resetModules();
    const { isIpBlocked, recordFailedAttempt } = await import('./advanced-security');

    const ip = '203.0.113.10';

    expect(isIpBlocked(ip).blocked).toBe(false);

    recordFailedAttempt(ip);
    expect(isIpBlocked(ip).blocked).toBe(false);

    recordFailedAttempt(ip);
    expect(isIpBlocked(ip).blocked).toBe(true);
  });

  it('ipBlockMiddleware returns 403 when blocked', async () => {
    vi.resetModules();
    const { blockIp, ipBlockMiddleware } = await import('./advanced-security');

    const ip = '203.0.113.11';
    blockIp(ip, 'test');

    const req = { headers: {}, ip } as unknown as Request;
    const { res, status, json } = makeRes();

    ipBlockMiddleware(req, res as unknown as Response, (() => undefined) as unknown as NextFunction);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalled();
  });

  it('generateRequestSignature is deterministic', async () => {
    vi.resetModules();
    const { generateRequestSignature } = await import('./advanced-security');

    const sig1 = generateRequestSignature('POST', '/x', { a: 1 }, 123, 'secret');
    const sig2 = generateRequestSignature('POST', '/x', { a: 1 }, 123, 'secret');

    expect(sig1).toBe(sig2);
    expect(sig1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('validateRequestSignature calls next when signature is valid', async () => {
    vi.resetModules();
    const { generateRequestSignature, validateRequestSignature } = await import('./advanced-security');

    const timestamp = Date.now();
    const secret = 'secret';
    const body = { ok: true };

    const signature = generateRequestSignature('POST', '/api/x', body, timestamp, secret);

    const middleware = validateRequestSignature(secret, 300);

    const req = {
      method: 'POST',
      path: '/api/x',
      body,
      headers: {
        'x-signature': signature,
        'x-timestamp': String(timestamp),
      },
    } as unknown as Request;

    const { res } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    middleware(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('validateRequestSignature rejects when timestamp is expired', async () => {
    vi.resetModules();
    const { generateRequestSignature, validateRequestSignature } = await import('./advanced-security');

    const now = Date.now();
    const oldTimestamp = now - 999_999;
    const secret = 'secret';

    const signature = generateRequestSignature('POST', '/api/x', {}, oldTimestamp, secret);
    const middleware = validateRequestSignature(secret, 1);

    const req = {
      method: 'POST',
      path: '/api/x',
      body: {},
      headers: {
        'x-signature': signature,
        'x-timestamp': String(oldTimestamp),
      },
    } as unknown as Request;

    const { res, status } = makeRes();

    middleware(req, res as unknown as Response, (() => undefined) as unknown as NextFunction);

    expect(status).toHaveBeenCalledWith(401);
  });

  it('generateCsrfToken + validateCsrfToken work', async () => {
    vi.resetModules();
    const { generateCsrfToken, validateCsrfToken } = await import('./advanced-security');

    const token = generateCsrfToken('s1');
    expect(validateCsrfToken('s1', token)).toBe(true);
    const wrongToken = token.slice(0, -1) + (token.slice(-1) === '0' ? '1' : '0');
    expect(validateCsrfToken('s1', wrongToken)).toBe(false);
  });

  it('csrfProtection skips safe methods and bearer auth', async () => {
    vi.resetModules();
    const { csrfProtection } = await import('./advanced-security');

    const next = vi.fn() as unknown as NextFunction;

    csrfProtection({ method: 'GET', headers: {} } as unknown as Request, {} as unknown as Response, next);
    expect(next).toHaveBeenCalledTimes(1);

    const next2 = vi.fn() as unknown as NextFunction;
    csrfProtection(
      { method: 'POST', headers: { authorization: 'Bearer x' } } as unknown as Request,
      {} as unknown as Response,
      next2
    );
    expect(next2).toHaveBeenCalledTimes(1);
  });

  it('csrfProtection rejects when missing token', async () => {
    vi.resetModules();
    const { csrfProtection } = await import('./advanced-security');

    const { res, status } = makeRes();

    csrfProtection(
      { method: 'POST', headers: {}, cookies: {}, body: {} } as unknown as Request,
      res as unknown as Response,
      (() => undefined) as unknown as NextFunction
    );

    expect(status).toHaveBeenCalledWith(403);
  });

  it('securityHeaders sets common security headers', async () => {
    vi.resetModules();
    const { securityHeaders } = await import('./advanced-security');

    const setHeader = vi.fn();
    const res = { setHeader } as unknown as Response;

    securityHeaders({ path: '/api/test' } as unknown as Request, res, (() => undefined) as unknown as NextFunction);

    expect(setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
  });

  it('securityHeaders sets cache-control for API paths', async () => {
    vi.resetModules();
    const { securityHeaders } = await import('./advanced-security');

    const setHeader = vi.fn();
    const res = { setHeader } as unknown as Response;

    securityHeaders({ path: '/api/data' } as unknown as Request, res, (() => undefined) as unknown as NextFunction);

    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    expect(setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
  });

  it('securityHeaders does not set cache-control for non-API paths', async () => {
    vi.resetModules();
    const { securityHeaders } = await import('./advanced-security');

    const setHeader = vi.fn();
    const res = { setHeader } as unknown as Response;

    securityHeaders({ path: '/public' } as unknown as Request, res, (() => undefined) as unknown as NextFunction);

    const calls = setHeader.mock.calls.map(c => c[0]);
    expect(calls).not.toContain('Cache-Control');
  });

  it('isIpBlocked returns false for expired blocks', async () => {
    vi.resetModules();
    const { blockIp, isIpBlocked } = await import('./advanced-security');

    const ip = '203.0.113.50';
    blockIp(ip, 'test', 0.001); // very short duration

    // Advance time past the block duration
    vi.setSystemTime(new Date('2025-01-01T00:01:00.000Z'));

    expect(isIpBlocked(ip).blocked).toBe(false);
  });

  it('clearFailedAttempts removes attempt history', async () => {
    vi.resetModules();
    const { recordFailedAttempt, clearFailedAttempts, isIpBlocked } = await import('./advanced-security');

    const ip = '203.0.113.60';
    recordFailedAttempt(ip);
    clearFailedAttempts(ip);
    recordFailedAttempt(ip);
    expect(isIpBlocked(ip).blocked).toBe(false);
  });

  it('isAccountLocked returns locked for inactive user', async () => {
    vi.resetModules();
    const { isAccountLocked } = await import('./advanced-security');
    const { prisma } = await import('@pulseweave/database');

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      lockedUntil: null,
      failedLoginAttempts: 3,
      isActive: false,
    } as never);

    const result = await isAccountLocked('user-1');
    expect(result.locked).toBe(true);
    expect(result.failedAttempts).toBe(3);
  });

  it('isAccountLocked returns locked when lockedUntil is in future', async () => {
    vi.resetModules();
    const { isAccountLocked } = await import('./advanced-security');
    const { prisma } = await import('@pulseweave/database');

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      lockedUntil: new Date('2025-01-01T01:00:00.000Z'),
      failedLoginAttempts: 5,
      isActive: true,
    } as never);

    const result = await isAccountLocked('user-1');
    expect(result.locked).toBe(true);
    expect(result.lockedUntil).toBeDefined();
  });

  it('isAccountLocked returns unlocked for active user without lock', async () => {
    vi.resetModules();
    const { isAccountLocked } = await import('./advanced-security');
    const { prisma } = await import('@pulseweave/database');

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      lockedUntil: null,
      failedLoginAttempts: 1,
      isActive: true,
    } as never);

    const result = await isAccountLocked('user-1');
    expect(result.locked).toBe(false);
    expect(result.failedAttempts).toBe(1);
  });

  it('isAccountLocked returns unlocked for non-existent user', async () => {
    vi.resetModules();
    const { isAccountLocked } = await import('./advanced-security');
    const { prisma } = await import('@pulseweave/database');

    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

    const result = await isAccountLocked('nonexistent');
    expect(result.locked).toBe(false);
  });

  it('recordFailedLogin locks account after threshold', async () => {
    vi.resetModules();
    const { recordFailedLogin } = await import('./advanced-security');
    const { prisma } = await import('@pulseweave/database');

    vi.mocked(prisma.user.findUnique).mockResolvedValue({ failedLoginAttempts: 1 } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);

    const result = await recordFailedLogin('user-1');
    expect(result.failedAttempts).toBe(2);
    expect(result.locked).toBe(true);
    expect(result.lockedUntil).toBeDefined();
  });

  it('recordFailedLogin does not lock before threshold', async () => {
    vi.resetModules();
    const { recordFailedLogin } = await import('./advanced-security');
    const { prisma } = await import('@pulseweave/database');

    vi.mocked(prisma.user.findUnique).mockResolvedValue({ failedLoginAttempts: 0 } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);

    const result = await recordFailedLogin('user-1');
    expect(result.failedAttempts).toBe(1);
    expect(result.locked).toBe(false);
  });

  it('clearFailedLogins resets attempts and lock', async () => {
    vi.resetModules();
    const { clearFailedLogins } = await import('./advanced-security');
    const { prisma } = await import('@pulseweave/database');

    vi.mocked(prisma.user.update).mockResolvedValue({} as never);

    await clearFailedLogins('user-1');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  });

  it('validateRequestSignature rejects missing signature', async () => {
    vi.resetModules();
    const { validateRequestSignature } = await import('./advanced-security');

    const middleware = validateRequestSignature('secret');
    const req = { headers: {} } as unknown as Request;
    const { res, status } = makeRes();

    middleware(req, res as unknown as Response, (() => undefined) as unknown as NextFunction);
    expect(status).toHaveBeenCalledWith(401);
  });

  it('validateRequestSignature rejects invalid signature', async () => {
    vi.resetModules();
    const { validateRequestSignature } = await import('./advanced-security');

    const timestamp = Date.now();
    const middleware = validateRequestSignature('secret', 300);
    const req = {
      method: 'POST',
      path: '/api/x',
      body: {},
      headers: { 'x-signature': 'invalid', 'x-timestamp': String(timestamp) },
    } as unknown as Request;
    const { res, status } = makeRes();

    middleware(req, res as unknown as Response, (() => undefined) as unknown as NextFunction);
    expect(status).toHaveBeenCalledWith(401);
  });

  it('csrfProtection accepts valid token', async () => {
    vi.resetModules();
    const { generateCsrfToken, csrfProtection } = await import('./advanced-security');

    const token = generateCsrfToken('session-1');
    const next = vi.fn() as unknown as NextFunction;
    const req = {
      method: 'POST',
      headers: { 'x-session-id': 'session-1', 'x-csrf-token': token },
      cookies: {},
      body: {},
    } as unknown as Request;

    csrfProtection(req, {} as unknown as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('csrfProtection rejects invalid token', async () => {
    vi.resetModules();
    const { csrfProtection } = await import('./advanced-security');

    const { res, status } = makeRes();
    const req = {
      method: 'POST',
      headers: { 'x-session-id': 's1', 'x-csrf-token': 'wrong' },
      cookies: {},
      body: {},
    } as unknown as Request;

    csrfProtection(req, res as unknown as Response, (() => undefined) as unknown as NextFunction);
    expect(status).toHaveBeenCalledWith(403);
  });

  it('logSecurityAudit creates audit log entry', async () => {
    vi.resetModules();
    const { logSecurityAudit } = await import('./advanced-security');
    const { prisma } = await import('@pulseweave/database');

    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    await logSecurityAudit('LOGIN_SUCCESS', {
      userId: 'user-1',
      ip: '1.2.3.4',
      userAgent: 'test',
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        action: 'LOGIN_SUCCESS',
        resource: 'system',
        resourceId: undefined,
        details: null,
        ipAddress: '1.2.3.4',
        userAgent: 'test',
      },
    });
  });

  it('logSecurityAudit handles errors gracefully', async () => {
    vi.resetModules();
    const { logSecurityAudit } = await import('./advanced-security');
    const { prisma } = await import('@pulseweave/database');

    vi.mocked(prisma.auditLog.create).mockRejectedValue(new Error('DB error') as never);

    await expect(logSecurityAudit('LOGIN_FAILED', { userId: 'user-1' })).resolves.toBeUndefined();
  });

  it('requestAuditMiddleware calls next and logs on finish', async () => {
    vi.resetModules();
    const { requestAuditMiddleware } = await import('./advanced-security');

    const next = vi.fn() as unknown as NextFunction;
    const res = {
      statusCode: 200,
      on: vi.fn((event: string, cb: () => void) => {
        if (event === 'finish') cb();
      }),
    } as unknown as Response;

    const req = {
      method: 'GET',
      path: '/api/test',
      headers: { 'user-agent': 'test' },
      socket: { remoteAddress: '1.2.3.4' },
    } as unknown as Request;

    requestAuditMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('validatePasswordStrength returns valid for strong password', async () => {
    vi.resetModules();
    const { validatePasswordStrength } = await import('./advanced-security');

    const result = validatePasswordStrength('StrongP@ssw0rd!2024');
    expect(result.valid).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(5);
    expect(result.feedback).toHaveLength(0);
  });

  it('validatePasswordStrength returns invalid for weak password', async () => {
    vi.resetModules();
    const { validatePasswordStrength } = await import('./advanced-security');

    const result = validatePasswordStrength('abc');
    expect(result.valid).toBe(false);
    expect(result.feedback).toContain('Password must be at least 8 characters');
  });

  it('validatePasswordStrength penalizes repeated characters', async () => {
    vi.resetModules();
    const { validatePasswordStrength } = await import('./advanced-security');

    const result = validatePasswordStrength('Aaaa1111!!!');
    expect(result.feedback).toContain('Avoid repeated characters');
  });

  it('validatePasswordStrength penalizes alpha-only passwords', async () => {
    vi.resetModules();
    const { validatePasswordStrength } = await import('./advanced-security');

    const result = validatePasswordStrength('OnlyLetters');
    expect(result.feedback).toContain('Add numbers');
    expect(result.feedback).toContain('Add special characters');
  });

  it('isPasswordCompromised returns false on API error (fail open)', async () => {
    vi.resetModules();
    const { isPasswordCompromised } = await import('./advanced-security');

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 } as never);

    const result = await isPasswordCompromised('testpassword');
    expect(result.compromised).toBe(false);

    global.fetch = originalFetch;
  });

  it('isPasswordCompromised returns false on network error (fail open)', async () => {
    vi.resetModules();
    const { isPasswordCompromised } = await import('./advanced-security');

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error') as never);

    const result = await isPasswordCompromised('testpassword');
    expect(result.compromised).toBe(false);

    global.fetch = originalFetch;
  });

  it('isPasswordCompromised returns true when password is found in breach database', async () => {
    vi.resetModules();
    const { isPasswordCompromised } = await import('./advanced-security');
    const crypto = await import('crypto');

    const password = 'testpass';
    const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = hash.substring(0, 5);
    const suffix = hash.substring(5);

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `${suffix}:5\nABCDEF:1`,
    } as never);

    const result = await isPasswordCompromised(password);
    expect(result.compromised).toBe(true);
    expect(result.count).toBe(5);

    global.fetch = originalFetch;
  });

  it('isPasswordCompromised returns false when password is not found', async () => {
    vi.resetModules();
    const { isPasswordCompromised } = await import('./advanced-security');

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: 'AAAAAA:1\nBBBBBB:2',
    } as never);

    const result = await isPasswordCompromised('uniquenotbreachedpass123!');
    expect(result.compromised).toBe(false);

    global.fetch = originalFetch;
  });
});
