import { describe, expect, it, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

vi.mock('jsonwebtoken', () => {
  class TokenExpiredError extends Error {
    name = 'TokenExpiredError';
  }
  return {
    default: {
      verify: vi.fn(),
      TokenExpiredError,
    },
    verify: vi.fn(),
    TokenExpiredError,
  };
});

vi.mock('@pulseweave/database', () => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../middleware/auth', () => ({
  JWT_SECRET: 'test-secret',
}));

import { prisma } from '@pulseweave/database';
import { setupSocketAuth } from './auth';

const jwtVerify = vi.mocked(jwt.verify);
const sessionFindUnique = vi.mocked(prisma.session.findUnique);

/* eslint-disable @typescript-eslint/no-explicit-any */

function createMockSocket(token?: string) {
  return {
    handshake: { auth: { token } },
    userId: undefined as string | undefined,
  };
}

function createMockIo() {
  let middleware: ((socket: any, next: any) => Promise<void>) | undefined;
  return {
    use(fn: (socket: any, next: any) => Promise<void>) {
      middleware = fn;
    },
    getMiddleware() {
      return middleware!;
    },
  };
}

describe('setupSocketAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects connections without a token', async () => {
    const io = createMockIo();
    setupSocketAuth(io as any);

    const socket = createMockSocket();
    const next = vi.fn();

    await io.getMiddleware()(socket, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Authentication required',
    }));
  });

  it('authenticates valid token and sets userId', async () => {
    jwtVerify.mockReturnValue({ userId: 'user-123' } as any);

    const io = createMockIo();
    setupSocketAuth(io as any);

    const socket = createMockSocket('valid-token');
    const next = vi.fn();

    await io.getMiddleware()(socket, next);

    expect(socket.userId).toBe('user-123');
    expect(next).toHaveBeenCalledWith();
  });

  it('checks session validity when jti is present', async () => {
    jwtVerify.mockReturnValue({ userId: 'user-123', jti: 'token-id-1' } as any);
    sessionFindUnique.mockResolvedValue({ tokenId: 'token-id-1', isValid: true } as any);

    const io = createMockIo();
    setupSocketAuth(io as any);

    const socket = createMockSocket('valid-token');
    const next = vi.fn();

    await io.getMiddleware()(socket, next);

    expect(sessionFindUnique).toHaveBeenCalledWith({
      where: { tokenId: 'token-id-1' },
    });
    expect(socket.userId).toBe('user-123');
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects revoked sessions', async () => {
    jwtVerify.mockReturnValue({ userId: 'user-123', jti: 'token-id-1' } as any);
    sessionFindUnique.mockResolvedValue({ tokenId: 'token-id-1', isValid: false } as any);

    const io = createMockIo();
    setupSocketAuth(io as any);

    const socket = createMockSocket('valid-token');
    const next = vi.fn();

    await io.getMiddleware()(socket, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Token has been revoked',
    }));
  });

  it('rejects expired tokens', async () => {
    jwtVerify.mockImplementation(() => {
      throw new jwt.TokenExpiredError('jwt expired', new Date());
    });

    const io = createMockIo();
    setupSocketAuth(io as any);

    const socket = createMockSocket('expired-token');
    const next = vi.fn();

    await io.getMiddleware()(socket, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Token expired',
    }));
  });

  it('rejects invalid tokens', async () => {
    jwtVerify.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    const io = createMockIo();
    setupSocketAuth(io as any);

    const socket = createMockSocket('bad-token');
    const next = vi.fn();

    await io.getMiddleware()(socket, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Invalid token',
    }));
  });
});
