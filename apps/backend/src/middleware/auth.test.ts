import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Response } from 'express';
import type { AuthRequest } from './auth';

const jwtVerify = vi.fn();
const jwtSign = vi.fn();

class TokenExpiredError extends Error {}
class JsonWebTokenError extends Error {}

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: jwtVerify,
    sign: jwtSign,
    TokenExpiredError,
    JsonWebTokenError,
  },
  verify: jwtVerify,
  sign: jwtSign,
  TokenExpiredError,
  JsonWebTokenError,
}));

vi.mock('@pulseweave/database', () => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    workspaceMember: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '@pulseweave/database';

type PrismaMock = {
  session: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  workspaceMember: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

type ResDouble = {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
};

function makeRes() {
  const res = {} as ResDouble;
  const json = vi.fn(() => res);
  const status = vi.fn(() => res);
  res.json = json;
  res.status = status;
  return { res, status, json };
}

async function importAuth() {
  vi.resetModules();
  process.env.NODE_ENV = 'development';
  process.env.JWT_SECRET = 'x'.repeat(64);

  return import('./auth');
}

describe('middleware/auth', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('authenticateToken returns 401 when token is missing', async () => {
    const { authenticateToken } = await importAuth();

    const { res, status, json } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    const req = {
      headers: {},
      cookies: {},
    } as unknown as AuthRequest;

    await authenticateToken(req, res as unknown as Response, next);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'Access token required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('authenticateToken returns 403 on invalid token', async () => {
    const { authenticateToken } = await importAuth();

    jwtVerify.mockImplementationOnce(() => {
      throw new JsonWebTokenError('bad');
    });

    const { res, status, json } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    const req = {
      headers: { authorization: 'Bearer token' },
      cookies: {},
    } as unknown as AuthRequest;

    await authenticateToken(req, res as unknown as Response, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: 'Invalid token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('authenticateToken returns 401 on expired token', async () => {
    const { authenticateToken } = await importAuth();

    jwtVerify.mockImplementationOnce(() => {
      throw new TokenExpiredError('expired');
    });

    const { res, status, json } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    const req = {
      headers: { authorization: 'Bearer token' },
      cookies: {},
    } as unknown as AuthRequest;

    await authenticateToken(req, res as unknown as Response, next);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    expect(next).not.toHaveBeenCalled();
  });

  it('authenticateToken returns 403 when session is revoked', async () => {
    const { authenticateToken } = await importAuth();

    const prismaMock = prisma as unknown as PrismaMock;

    jwtVerify.mockReturnValueOnce({
      userId: 'u1',
      jti: 't1',
      type: 'access',
      iat: 0,
      exp: 1,
      iss: 'pulseweave',
      aud: 'pulseweave-api',
    });
    prismaMock.session.findUnique.mockResolvedValueOnce({ isValid: false });

    const { res, status, json } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    const req = {
      headers: { authorization: 'Bearer token' },
      cookies: {},
    } as unknown as AuthRequest;

    await authenticateToken(req, res as unknown as Response, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: 'Token has been revoked' });
    expect(next).not.toHaveBeenCalled();
  });

  it('authenticateToken sets workspace context when membership exists', async () => {
    const { authenticateToken } = await importAuth();

    const prismaMock = prisma as unknown as PrismaMock;

    jwtVerify.mockReturnValueOnce({
      userId: 'u1',
      jti: 't1',
      type: 'access',
      iat: 0,
      exp: 1,
      iss: 'pulseweave',
      aud: 'pulseweave-api',
    });
    prismaMock.session.findUnique.mockResolvedValueOnce({ isValid: true });
    prismaMock.workspaceMember.findUnique.mockResolvedValueOnce({ roleName: 'admin' });

    const { res } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    const req = {
      headers: {
        authorization: 'Bearer token',
        'x-workspace-id': 'w1',
      },
      cookies: {},
    } as unknown as AuthRequest;

    await authenticateToken(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.userId).toBe('u1');
    expect(req.tokenId).toBe('t1');
    expect(req.workspaceId).toBe('w1');
    expect(req.workspaceRole).toBe('admin');
  });

  it('authenticateToken returns 403 when workspace membership is missing', async () => {
    const { authenticateToken } = await importAuth();

    const prismaMock = prisma as unknown as PrismaMock;

    jwtVerify.mockReturnValueOnce({
      userId: 'u1',
      jti: 't1',
      type: 'access',
      iat: 0,
      exp: 1,
      iss: 'pulseweave',
      aud: 'pulseweave-api',
    });
    prismaMock.session.findUnique.mockResolvedValueOnce({ isValid: true });
    prismaMock.workspaceMember.findUnique.mockResolvedValueOnce(null);

    const { res, status, json } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    const req = {
      headers: {
        authorization: 'Bearer token',
        'x-workspace-id': 'w1',
      },
      cookies: {},
    } as unknown as AuthRequest;

    await authenticateToken(req, res as unknown as Response, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      error: 'Access denied to this workspace',
      code: 'WORKSPACE_ACCESS_DENIED',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('generateToken and generateRefreshToken return token and jti', async () => {
    const { generateRefreshToken, generateToken } = await importAuth();

    jwtSign.mockReturnValue('signed');

    expect(generateToken('u1', '5m', 'j1')).toEqual({ token: 'signed', jti: 'j1' });
    expect(generateRefreshToken('u1', 'j2')).toEqual({ token: 'signed', jti: 'j2' });
  });

  it('revokeToken swallows errors', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { revokeToken } = await importAuth();

    const prismaMock = prisma as unknown as PrismaMock;
    prismaMock.session.update.mockRejectedValueOnce(new Error('missing'));

    await expect(revokeToken('t1')).resolves.toBeUndefined();

    consoleWarnSpy.mockRestore();
  });

  it('revokeAllUserTokens updates sessions', async () => {
    const { revokeAllUserTokens } = await importAuth();

    const prismaMock = prisma as unknown as PrismaMock;
    prismaMock.session.updateMany.mockResolvedValueOnce({ count: 2 });

    await expect(revokeAllUserTokens('u1')).resolves.toBeUndefined();
    expect(prismaMock.session.updateMany).toHaveBeenCalled();
  });
});
