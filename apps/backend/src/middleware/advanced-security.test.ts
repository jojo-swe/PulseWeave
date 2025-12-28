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
});
