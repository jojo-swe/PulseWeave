import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@pulseweave/database', () => ({
  prisma: {
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
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
import { sessionManager } from './session-store';

describe('session-store service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    sessionManager.stopCleanup();
  });

  describe('createSession', () => {
    it('should create a session and return a session ID', async () => {
      const sessionId = await sessionManager.createSession('user-1', 'token-1', {
        deviceInfo: 'Chrome',
        ipAddress: '127.0.0.1',
      });

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
    });

    it('should use custom expiry time', async () => {
      const sessionId = await sessionManager.createSession('user-1', 'token-1', {
        expiresInMs: 1000,
      });

      expect(sessionId).toBeDefined();
    });
  });

  describe('getSession', () => {
    it('should return session data for a valid session', async () => {
      const sessionId = await sessionManager.createSession('user-1', 'token-1');

      const session = await sessionManager.getSession(sessionId);

      expect(session).not.toBeNull();
      expect(session!.userId).toBe('user-1');
      expect(session!.tokenId).toBe('token-1');
    });

    it('should return null for non-existent session', async () => {
      const session = await sessionManager.getSession('nonexistent-id');
      expect(session).toBeNull();
    });
  });

  describe('validateSession', () => {
    it('should return true for a valid session', async () => {
      const sessionId = await sessionManager.createSession('user-1', 'token-1');
      const valid = await sessionManager.validateSession(sessionId);
      expect(valid).toBe(true);
    });

    it('should return false for non-existent session', async () => {
      const valid = await sessionManager.validateSession('nonexistent-id');
      expect(valid).toBe(false);
    });
  });

  describe('touchSession', () => {
    it('should update session without error', async () => {
      const sessionId = await sessionManager.createSession('user-1', 'token-1');
      await expect(sessionManager.touchSession(sessionId, '127.0.0.1')).resolves.toBeUndefined();
    });
  });

  describe('invalidateSession', () => {
    it('should invalidate a session', async () => {
      const sessionId = await sessionManager.createSession('user-1', 'token-1');
      await sessionManager.invalidateSession(sessionId);

      const valid = await sessionManager.validateSession(sessionId);
      expect(valid).toBe(false);
    });
  });

  describe('invalidateAllUserSessions', () => {
    it('should invalidate all sessions for a user and return count', async () => {
      const userId = 'user-invalidate-all-test';
      const sessionId1 = await sessionManager.createSession(userId, 'token-1');
      const sessionId2 = await sessionManager.createSession(userId, 'token-2');

      const count = await sessionManager.invalidateAllUserSessions(userId);

      expect(count).toBe(2);

      // Both sessions should now be invalid
      const valid1 = await sessionManager.validateSession(sessionId1);
      const valid2 = await sessionManager.validateSession(sessionId2);
      expect(valid1).toBe(false);
      expect(valid2).toBe(false);
    });
  });

  describe('stopCleanup', () => {
    it('should stop cleanup interval without error', () => {
      expect(() => sessionManager.stopCleanup()).not.toThrow();
    });
  });
});

describe('DatabaseSessionStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.USE_DB_SESSIONS = 'true';
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.USE_DB_SESSIONS;
  });

  it('should create session in database', async () => {
    vi.mocked(prisma.session.create).mockResolvedValue({} as never);

    const { sessionManager: dbSessionManager } = await import('./session-store');
    const sessionId = await dbSessionManager.createSession('user-1', 'token-1');

    expect(prisma.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          tokenId: 'token-1',
          isValid: true,
        }),
      })
    );
    expect(sessionId).toBeDefined();
    dbSessionManager.stopCleanup();
  });

  it('should get session from database', async () => {
    const futureDate = new Date(Date.now() + 86400000);
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: 'sess-1',
      userId: 'user-1',
      tokenId: 'token-1',
      deviceInfo: 'Chrome',
      ipAddress: '127.0.0.1',
      createdAt: new Date(),
      lastActiveAt: new Date(),
      expiresAt: futureDate,
      isValid: true,
    } as never);

    const { sessionManager: dbSessionManager } = await import('./session-store');
    const session = await dbSessionManager.getSession('sess-1');

    expect(session).not.toBeNull();
    expect(session!.userId).toBe('user-1');
    dbSessionManager.stopCleanup();
  });

  it('should return null for invalid session in database', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: 'sess-1',
      isValid: false,
      expiresAt: new Date(Date.now() + 86400000),
    } as never);

    const { sessionManager: dbSessionManager } = await import('./session-store');
    const session = await dbSessionManager.getSession('sess-1');

    expect(session).toBeNull();
    dbSessionManager.stopCleanup();
  });

  it('should return null for expired session in database', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: 'sess-1',
      userId: 'user-1',
      tokenId: 'token-1',
      deviceInfo: null,
      ipAddress: null,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      expiresAt: new Date(Date.now() - 1000),
      isValid: true,
    } as never);
    vi.mocked(prisma.session.update).mockResolvedValue({} as never);

    const { sessionManager: dbSessionManager } = await import('./session-store');
    const session = await dbSessionManager.getSession('sess-1');

    expect(session).toBeNull();
    dbSessionManager.stopCleanup();
  });
});
