import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('@pulseweave/database', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    workspace: {
      create: vi.fn(),
    },
    workspaceMember: {
      findFirst: vi.fn(),
    },
    session: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    emailVerificationToken: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    passwordResetToken: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-password'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn((userId: string, _secret: string, opts?: { expiresIn?: string }) => ({
      token: `jwt-token-${userId}${opts?.expiresIn ? '-' + opts.expiresIn : ''}`,
    })),
    verify: vi.fn(() => ({ userId: 'test-user-id' })),
  },
}));

const authMocks = vi.hoisted(() => ({
  generateToken: vi.fn((userId: string, _expires?: string, jti?: string) => ({
    token: `access-token-${userId}-${jti || 'no-jti'}`,
  })),
  generateRefreshToken: vi.fn((userId: string, jti?: string) => ({
    token: `refresh-token-${userId}-${jti || 'no-jti'}`,
  })),
  verifyRefreshToken: vi.fn(),
  revokeToken: vi.fn(),
  authenticateToken: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { userId: string }).userId = 'test-user-id';
    (req as unknown as { tokenId: string }).tokenId = 'token-jti-123';
    next();
  },
  AuthRequest: class AuthRequest {},
  JWT_SECRET: 'test-secret',
}));
vi.mock('../middleware/auth', () => authMocks);

const { verifyTotpToken, verifyBackupCode } = vi.hoisted(() => ({
  verifyTotpToken: vi.fn(),
  verifyBackupCode: vi.fn(),
}));
vi.mock('../services/mfa', () => ({ verifyTotpToken, verifyBackupCode }));

const { logSecurityEvent } = vi.hoisted(() => ({ logSecurityEvent: vi.fn() }));
vi.mock('../middleware/security', () => ({ logSecurityEvent }));

vi.mock('../config/security', () => ({
  cookieConfig: {
    accessToken: { name: 'access_token', maxAge: 86400000 },
    refreshToken: { name: 'refresh_token', maxAge: 604800000 },
    options: { httpOnly: true, secure: false, sameSite: 'lax' },
  },
}));

const ldapMocks = vi.hoisted(() => ({
  isLdapEnabled: vi.fn(() => false),
  getLdapConfig: vi.fn(() => ({ enabled: false })),
  authenticateLdap: vi.fn(),
  syncLdapUser: vi.fn(),
  testLdapConnection: vi.fn(),
}));
vi.mock('../services/ldap', () => ldapMocks);

const advSecMocks = vi.hoisted(() => ({
  isAccountLocked: vi.fn(() => ({ locked: false })),
  recordFailedLogin: vi.fn(() => ({ locked: false })),
  clearFailedLogins: vi.fn(),
  recordFailedAttempt: vi.fn(),
  clearFailedAttempts: vi.fn(),
  getClientIp: vi.fn(() => '127.0.0.1'),
  isPasswordCompromised: vi.fn(() => false),
  logSecurityAudit: vi.fn(),
}));
vi.mock('../middleware/advanced-security', () => advSecMocks);

const emailMocks = vi.hoisted(() => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendWelcomeEmail: vi.fn(),
}));
vi.mock('../services/email', () => emailMocks);

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { prisma } from '@pulseweave/database';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authRouter } from './auth';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
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

describe('auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(bcrypt.hash).mockResolvedValue('hashed-password' as never);
    advSecMocks.isAccountLocked.mockReturnValue({ locked: false });
    advSecMocks.recordFailedLogin.mockReturnValue({ locked: false });
  });

  describe('POST /auth/register', () => {
    it('should register a new user', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue({
        id: 'new-user', email: 'new@test.com', username: 'newuser',
        displayName: 'New User', avatarUrl: null, status: 'offline', createdAt: new Date(),
      } as never);
      vi.mocked(prisma.workspace.create).mockResolvedValue({
        id: 'ws-1', name: "New User's Workspace", slug: 'newuser-workspace',
      } as never);
      vi.mocked(prisma.session.createMany).mockResolvedValue({ count: 2 } as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const res = await request(createApp())
        .post('/auth/register')
        .send({
          email: 'new@test.com',
          username: 'newuser',
          displayName: 'New User',
          password: 'Password123!',
        });

      expect(res.status).toBe(201);
      expect(res.body.user.id).toBe('new-user');
      expect(res.body.token).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.workspace.id).toBe('ws-1');
    });

    it('should return 400 if email already exists', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        id: 'existing', email: 'existing@test.com',
      } as never);

      const res = await request(createApp())
        .post('/auth/register')
        .send({
          email: 'existing@test.com',
          username: 'existing',
          displayName: 'Existing',
          password: 'Password123!',
        });

      expect(res.status).toBe(400);
    });

    it('should return 400 for weak password', async () => {
      const res = await request(createApp())
        .post('/auth/register')
        .send({
          email: 'weak@test.com',
          username: 'weakuser',
          displayName: 'Weak',
          password: 'weak',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    it('should login successfully', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u1', email: 'test@test.com', username: 'testuser',
        displayName: 'Test', avatarUrl: null, status: 'offline',
        mfaEnabled: false, isActive: true, passwordHash: 'hashed',
        workspaceMemberships: [{
          roleName: 'owner', workspaceId: 'ws-1',
          workspace: { id: 'ws-1', name: 'Test WS', slug: 'test-ws' },
        }],
      } as never);
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);
      vi.mocked(prisma.session.createMany).mockResolvedValue({ count: 2 } as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const res = await request(createApp())
        .post('/auth/login')
        .send({ email: 'test@test.com', password: 'Password123!' });

      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe('u1');
      expect(res.body.token).toBeDefined();
    });

    it('should return 401 for non-existent user', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const res = await request(createApp())
        .post('/auth/login')
        .send({ email: 'nonexistent@test.com', password: 'Password123!' });

      expect(res.status).toBe(401);
    });

    it('should return 423 if account is locked', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u1', email: 'locked@test.com', passwordHash: 'hashed',
        isActive: true, mfaEnabled: false, workspaceMemberships: [],
      } as never);
      advSecMocks.isAccountLocked.mockReturnValue({ locked: true, lockedUntil: new Date() });

      const res = await request(createApp())
        .post('/auth/login')
        .send({ email: 'locked@test.com', password: 'Password123!' });

      expect(res.status).toBe(423);
    });

    it('should return 403 if account is disabled', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u1', email: 'disabled@test.com', passwordHash: 'hashed',
        isActive: false, mfaEnabled: false, workspaceMemberships: [],
      } as never);

      const res = await request(createApp())
        .post('/auth/login')
        .send({ email: 'disabled@test.com', password: 'Password123!' });

      expect(res.status).toBe(403);
    });

    it('should return 401 for invalid password', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u1', email: 'test@test.com', passwordHash: 'hashed',
        isActive: true, mfaEnabled: false, workspaceMemberships: [],
      } as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const res = await request(createApp())
        .post('/auth/login')
        .send({ email: 'test@test.com', password: 'WrongPassword123!' });

      expect(res.status).toBe(401);
    });

    it('should return MFA required for MFA-enabled user', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u1', email: 'mfa@test.com', passwordHash: 'hashed',
        isActive: true, mfaEnabled: true, workspaceMemberships: [],
      } as never);

      const res = await request(createApp())
        .post('/auth/login')
        .send({ email: 'mfa@test.com', password: 'Password123!' });

      expect(res.status).toBe(200);
      expect(res.body.mfaRequired).toBe(true);
      expect(res.body.mfaToken).toBeDefined();
    });
  });

  describe('POST /auth/mfa/verify', () => {
    it('should verify TOTP code and complete login', async () => {
      vi.mocked(jwt.verify).mockReturnValue({ userId: 'u1' } as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u1', email: 'test@test.com', username: 'testuser',
        displayName: 'Test', avatarUrl: null, mfaEnabled: true, mfaSecret: 'secret',
        workspaceMemberships: [{
          workspaceId: 'ws-1',
          workspace: { id: 'ws-1', name: 'Test WS', slug: 'test-ws' },
        }],
      } as never);
      verifyTotpToken.mockReturnValue(true);
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);
      vi.mocked(prisma.session.createMany).mockResolvedValue({ count: 2 } as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const res = await request(createApp())
        .post('/auth/mfa/verify')
        .send({ mfaToken: 'mfa-token', code: '123456', type: 'totp' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });

    it('should return 401 for invalid MFA token', async () => {
      vi.mocked(jwt.verify).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const res = await request(createApp())
        .post('/auth/mfa/verify')
        .send({ mfaToken: 'invalid', code: '123456', type: 'totp' });

      expect(res.status).toBe(401);
    });

    it('should return 401 for invalid TOTP code', async () => {
      vi.mocked(jwt.verify).mockReturnValue({ userId: 'u1' } as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u1', mfaSecret: 'secret', mfaEnabled: true,
        workspaceMemberships: [],
      } as never);
      verifyTotpToken.mockReturnValue(false);

      const res = await request(createApp())
        .post('/auth/mfa/verify')
        .send({ mfaToken: 'mfa-token', code: '000000', type: 'totp' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh token successfully', async () => {
      authMocks.verifyRefreshToken.mockResolvedValue({ userId: 'u1', jti: 'old-jti' });
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1' } as never);
      vi.mocked(prisma.session.createMany).mockResolvedValue({ count: 2 } as never);

      const res = await request(createApp())
        .post('/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
    });

    it('should return 401 for invalid refresh token', async () => {
      authMocks.verifyRefreshToken.mockResolvedValue(null);

      const res = await request(createApp())
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid' });

      expect(res.status).toBe(401);
    });

    it('should return 401 if user not found', async () => {
      authMocks.verifyRefreshToken.mockResolvedValue({ userId: 'u1', jti: 'old-jti' });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const res = await request(createApp())
        .post('/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout successfully', async () => {
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);

      const res = await request(createApp()).post('/auth/logout');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /auth/me', () => {
    it('should return current user', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u1', email: 'test@test.com', username: 'testuser',
        displayName: 'Test', avatarUrl: null, status: 'online',
        statusMessage: null, createdAt: new Date(),
        workspaceMemberships: [{
          roleName: 'owner',
          workspace: { id: 'ws-1', name: 'Test WS', slug: 'test-ws' },
        }],
      } as never);

      const res = await request(createApp()).get('/auth/me');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('u1');
      expect(res.body.role).toBe('owner');
    });

    it('should return 404 if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).get('/auth/me');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /auth/config', () => {
    it('should return auth config', async () => {
      const res = await request(createApp()).get('/auth/config');

      expect(res.status).toBe(200);
      expect(res.body.ldap.enabled).toBe(false);
      expect(res.body.localAuth).toBe(true);
    });
  });

  describe('POST /auth/ldap/login', () => {
    it('should return 400 if LDAP not enabled', async () => {
      ldapMocks.isLdapEnabled.mockReturnValue(false);

      const res = await request(createApp())
        .post('/auth/ldap/login')
        .send({ username: 'ldapuser', password: 'password' });

      expect(res.status).toBe(400);
    });

    it('should login with LDAP credentials', async () => {
      ldapMocks.isLdapEnabled.mockReturnValue(true);
      ldapMocks.authenticateLdap.mockResolvedValue({
        username: 'ldapuser', email: 'ldap@test.com', displayName: 'LDAP User',
      });
      ldapMocks.syncLdapUser.mockResolvedValue({
        id: 'ldap-u1', email: 'ldap@test.com', username: 'ldapuser',
        displayName: 'LDAP User', avatarUrl: null, status: 'offline',
      });
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);
      vi.mocked(prisma.session.createMany).mockResolvedValue({ count: 2 } as never);
      vi.mocked(prisma.workspaceMember.findFirst).mockResolvedValue({
        workspace: { id: 'ws-1', name: 'Test', slug: 'test' },
      } as never);

      const res = await request(createApp())
        .post('/auth/ldap/login')
        .send({ username: 'ldapuser', password: 'password' });

      expect(res.status).toBe(200);
      expect(res.body.authMethod).toBe('ldap');
      expect(res.body.token).toBeDefined();
    });

    it('should return 401 for invalid LDAP credentials', async () => {
      ldapMocks.isLdapEnabled.mockReturnValue(true);
      ldapMocks.authenticateLdap.mockResolvedValue(null);

      const res = await request(createApp())
        .post('/auth/ldap/login')
        .send({ username: 'baduser', password: 'wrong' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/ldap/test', () => {
    it('should test LDAP connection', async () => {
      ldapMocks.testLdapConnection.mockResolvedValue({ success: true, message: 'Connected' });

      const res = await request(createApp()).post('/auth/ldap/test');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /auth/send-verification', () => {
    it('should send verification email', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u1', email: 'test@test.com', displayName: 'Test', isVerified: false,
      } as never);
      vi.mocked(prisma.emailVerificationToken.deleteMany).mockResolvedValue({ count: 0 } as never);
      vi.mocked(prisma.emailVerificationToken.create).mockResolvedValue({} as never);
      emailMocks.sendVerificationEmail.mockResolvedValue(undefined);

      const res = await request(createApp())
        .post('/auth/send-verification')
        .send({ email: 'test@test.com' });

      expect(res.status).toBe(200);
    });

    it('should not reveal if user does not exist', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const res = await request(createApp())
        .post('/auth/send-verification')
        .send({ email: 'nonexistent@test.com' });

      expect(res.status).toBe(200);
    });

    it('should return already verified message', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u1', email: 'test@test.com', displayName: 'Test', isVerified: true,
      } as never);

      const res = await request(createApp())
        .post('/auth/send-verification')
        .send({ email: 'test@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('already verified');
    });
  });

  describe('POST /auth/verify-email', () => {
    it('should verify email with valid token', async () => {
      vi.mocked(prisma.emailVerificationToken.findUnique).mockResolvedValue({
        id: 'vt-1', expiresAt: new Date(Date.now() + 3600000),
        user: { id: 'u1', email: 'test@test.com', displayName: 'Test', isVerified: false },
      } as never);
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);
      vi.mocked(prisma.emailVerificationToken.delete).mockResolvedValue({} as never);
      emailMocks.sendWelcomeEmail.mockResolvedValue(undefined);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const res = await request(createApp())
        .post('/auth/verify-email')
        .send({ token: 'valid-token' });

      expect(res.status).toBe(200);
    });

    it('should return 400 for invalid token', async () => {
      vi.mocked(prisma.emailVerificationToken.findUnique).mockResolvedValue(null);

      const res = await request(createApp())
        .post('/auth/verify-email')
        .send({ token: 'invalid' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for expired token', async () => {
      vi.mocked(prisma.emailVerificationToken.findUnique).mockResolvedValue({
        id: 'vt-1', expiresAt: new Date(Date.now() - 3600000),
        user: { id: 'u1', email: 'test@test.com', displayName: 'Test', isVerified: false },
      } as never);
      vi.mocked(prisma.emailVerificationToken.delete).mockResolvedValue({} as never);

      const res = await request(createApp())
        .post('/auth/verify-email')
        .send({ token: 'expired' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('should send password reset email', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u1', email: 'test@test.com', displayName: 'Test',
      } as never);
      vi.mocked(prisma.passwordResetToken.deleteMany).mockResolvedValue({ count: 0 } as never);
      vi.mocked(prisma.passwordResetToken.create).mockResolvedValue({} as never);
      emailMocks.sendPasswordResetEmail.mockResolvedValue(undefined);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const res = await request(createApp())
        .post('/auth/forgot-password')
        .send({ email: 'test@test.com' });

      expect(res.status).toBe(200);
    });

    it('should not reveal if user does not exist', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const res = await request(createApp())
        .post('/auth/forgot-password')
        .send({ email: 'nonexistent@test.com' });

      expect(res.status).toBe(200);
    });
  });

  describe('POST /auth/reset-password', () => {
    it('should reset password with valid token', async () => {
      vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue({
        id: 'rt-1', expiresAt: new Date(Date.now() + 3600000), usedAt: null,
        user: { id: 'u1', email: 'test@test.com' },
      } as never);
      vi.mocked(prisma.$transaction).mockResolvedValue([{}, {}, {}] as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const res = await request(createApp())
        .post('/auth/reset-password')
        .send({ token: 'valid-token', password: 'NewPassword123!' });

      expect(res.status).toBe(200);
    });

    it('should return 400 for invalid token', async () => {
      vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue(null);

      const res = await request(createApp())
        .post('/auth/reset-password')
        .send({ token: 'invalid', password: 'NewPassword123!' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for expired token', async () => {
      vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue({
        id: 'rt-1', expiresAt: new Date(Date.now() - 3600000), usedAt: null,
        user: { id: 'u1', email: 'test@test.com' },
      } as never);
      vi.mocked(prisma.passwordResetToken.delete).mockResolvedValue({} as never);

      const res = await request(createApp())
        .post('/auth/reset-password')
        .send({ token: 'expired', password: 'NewPassword123!' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for already used token', async () => {
      vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue({
        id: 'rt-1', expiresAt: new Date(Date.now() + 3600000), usedAt: new Date(),
        user: { id: 'u1', email: 'test@test.com' },
      } as never);

      const res = await request(createApp())
        .post('/auth/reset-password')
        .send({ token: 'used', password: 'NewPassword123!' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for weak password', async () => {
      const res = await request(createApp())
        .post('/auth/reset-password')
        .send({ token: 'valid-token', password: 'weak' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /auth/verification-status', () => {
    it('should return verification status', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        isVerified: true, email: 'test@test.com',
      } as never);

      const res = await request(createApp()).get('/auth/verification-status');

      expect(res.status).toBe(200);
      expect(res.body.isVerified).toBe(true);
    });

    it('should return 404 if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).get('/auth/verification-status');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /auth/sessions', () => {
    it('should list active sessions', async () => {
      vi.mocked(prisma.session.findMany).mockResolvedValue([
        {
          id: 's1', deviceInfo: 'Mozilla/5.0 Chrome', ipAddress: '127.0.0.1',
          createdAt: new Date(), lastActiveAt: new Date(), tokenId: 'token-jti-123',
        },
      ] as never);

      const res = await request(createApp()).get('/auth/sessions');

      expect(res.status).toBe(200);
      expect(res.body.sessions).toHaveLength(1);
      expect(res.body.sessions[0].isCurrent).toBe(true);
      expect(res.body.sessions[0].device.browser).toBe('Chrome');
    });
  });

  describe('DELETE /auth/sessions/:sessionId', () => {
    it('should revoke a session', async () => {
      vi.mocked(prisma.session.findFirst).mockResolvedValue({
        id: 's1', userId: 'test-user-id',
      } as never);
      vi.mocked(prisma.session.update).mockResolvedValue({} as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const res = await request(createApp()).delete('/auth/sessions/s1');

      expect(res.status).toBe(200);
    });

    it('should return 404 if session not found', async () => {
      vi.mocked(prisma.session.findFirst).mockResolvedValue(null);

      const res = await request(createApp()).delete('/auth/sessions/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /auth/sessions/revoke-all', () => {
    it('should revoke all sessions except current', async () => {
      vi.mocked(prisma.session.updateMany).mockResolvedValue({ count: 3 } as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const res = await request(createApp()).post('/auth/sessions/revoke-all');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('3');
    });
  });
});
