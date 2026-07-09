import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mfaMocks = vi.hoisted(() => ({
  generateTotpSecret: vi.fn(),
  verifyTotpToken: vi.fn(),
  enableTotp: vi.fn(),
  disableTotp: vi.fn(),
  verifyBackupCode: vi.fn(),
  regenerateBackupCodes: vi.fn(),
  generateWebAuthnRegistrationOptions: vi.fn(),
  verifyWebAuthnRegistration: vi.fn(),
  generateWebAuthnAuthenticationOptions: vi.fn(),
  verifyWebAuthnAuthentication: vi.fn(),
  getWebAuthnCredentials: vi.fn(),
  deleteWebAuthnCredential: vi.fn(),
  renameWebAuthnCredential: vi.fn(),
}));

vi.mock('../services/mfa', () => mfaMocks);

vi.mock('@pulseweave/database', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

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
import { mfaRouter } from './mfa';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/mfa', mfaRouter);
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

describe('mfa routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /mfa/status', () => {
    it('should return MFA status', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        mfaEnabled: true, mfaSecret: 'secret',
      } as never);
      mfaMocks.getWebAuthnCredentials.mockResolvedValue([]);

      const res = await request(createApp()).get('/mfa/status');

      expect(res.status).toBe(200);
      expect(res.body.mfaEnabled).toBe(true);
      expect(res.body.totpEnabled).toBe(true);
      expect(res.body.webauthnEnabled).toBe(false);
    });

    it('should return 404 if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).get('/mfa/status');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /mfa/totp/setup', () => {
    it('should generate TOTP secret and QR code', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        email: 'test@test.com', mfaSecret: null,
      } as never);
      mfaMocks.generateTotpSecret.mockResolvedValue({
        secret: 'NEWSECRET', qrCodeDataUrl: 'data:image/png;base64,...',
      });

      const res = await request(createApp()).post('/mfa/totp/setup');

      expect(res.status).toBe(200);
      expect(res.body.secret).toBe('NEWSECRET');
    });

    it('should return 400 if TOTP already enabled', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        email: 'test@test.com', mfaSecret: 'existing',
      } as never);

      const res = await request(createApp()).post('/mfa/totp/setup');

      expect(res.status).toBe(400);
    });

    it('should return 404 if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).post('/mfa/totp/setup');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /mfa/totp/enable', () => {
    it('should enable TOTP with valid token', async () => {
      mfaMocks.enableTotp.mockResolvedValue({
        success: true, backupCodes: ['code1', 'code2'],
      });

      const res = await request(createApp())
        .post('/mfa/totp/enable')
        .send({ secret: 'NEWSECRET', token: '123456' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.backupCodes).toHaveLength(2);
    });

    it('should return 400 if enableTotp fails', async () => {
      mfaMocks.enableTotp.mockResolvedValue({
        success: false, error: 'Invalid token',
      });

      const res = await request(createApp())
        .post('/mfa/totp/enable')
        .send({ secret: 'NEWSECRET', token: 'wrong1' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid token length', async () => {
      const res = await request(createApp())
        .post('/mfa/totp/enable')
        .send({ secret: 'secret', token: '123' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /mfa/totp/disable', () => {
    it('should disable TOTP with valid password', async () => {
      mfaMocks.disableTotp.mockResolvedValue({ success: true });

      const res = await request(createApp())
        .post('/mfa/totp/disable')
        .send({ password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 if disableTotp fails', async () => {
      mfaMocks.disableTotp.mockResolvedValue({
        success: false, error: 'Wrong password',
      });

      const res = await request(createApp())
        .post('/mfa/totp/disable')
        .send({ password: 'wrong' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /mfa/totp/verify', () => {
    it('should verify a valid TOTP token', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        mfaSecret: 'secret',
      } as never);
      mfaMocks.verifyTotpToken.mockReturnValue(true);

      const res = await request(createApp())
        .post('/mfa/totp/verify')
        .send({ token: '123456' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 if TOTP not enabled', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        mfaSecret: null,
      } as never);

      const res = await request(createApp())
        .post('/mfa/totp/verify')
        .send({ token: '123456' });

      expect(res.status).toBe(400);
    });

    it('should return 401 for invalid token', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        mfaSecret: 'secret',
      } as never);
      mfaMocks.verifyTotpToken.mockReturnValue(false);

      const res = await request(createApp())
        .post('/mfa/totp/verify')
        .send({ token: '000000' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /mfa/backup/verify', () => {
    it('should verify a valid backup code', async () => {
      mfaMocks.verifyBackupCode.mockResolvedValue(true);

      const res = await request(createApp())
        .post('/mfa/backup/verify')
        .send({ code: 'backup-code-1' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 401 for invalid backup code', async () => {
      mfaMocks.verifyBackupCode.mockResolvedValue(false);

      const res = await request(createApp())
        .post('/mfa/backup/verify')
        .send({ code: 'invalid' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /mfa/backup/regenerate', () => {
    it('should regenerate backup codes', async () => {
      mfaMocks.regenerateBackupCodes.mockResolvedValue({
        success: true, backupCodes: ['new1', 'new2'],
      });

      const res = await request(createApp())
        .post('/mfa/backup/regenerate')
        .send({ password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.backupCodes).toHaveLength(2);
    });

    it('should return 400 if regeneration fails', async () => {
      mfaMocks.regenerateBackupCodes.mockResolvedValue({
        success: false, error: 'Wrong password',
      });

      const res = await request(createApp())
        .post('/mfa/backup/regenerate')
        .send({ password: 'wrong' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /mfa/webauthn/register/options', () => {
    it('should return registration options', async () => {
      mfaMocks.generateWebAuthnRegistrationOptions.mockResolvedValue({
        challenge: 'challenge',
        rp: { name: 'PulseWeave' },
      });

      const res = await request(createApp()).post('/mfa/webauthn/register/options');

      expect(res.status).toBe(200);
      expect(res.body.challenge).toBe('challenge');
    });
  });

  describe('POST /mfa/webauthn/register/verify', () => {
    it('should verify WebAuthn registration', async () => {
      mfaMocks.verifyWebAuthnRegistration.mockResolvedValue({ success: true });

      const res = await request(createApp())
        .post('/mfa/webauthn/register/verify')
        .send({ response: { id: 'cred-id' }, name: 'My Key' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 if verification fails', async () => {
      mfaMocks.verifyWebAuthnRegistration.mockResolvedValue({
        success: false, error: 'Invalid response',
      });

      const res = await request(createApp())
        .post('/mfa/webauthn/register/verify')
        .send({ response: {} });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /mfa/webauthn/authenticate/options', () => {
    it('should return authentication options', async () => {
      mfaMocks.generateWebAuthnAuthenticationOptions.mockResolvedValue({
        challenge: 'auth-challenge',
      });

      const res = await request(createApp()).post('/mfa/webauthn/authenticate/options');

      expect(res.status).toBe(200);
      expect(res.body.challenge).toBe('auth-challenge');
    });

    it('should return 400 if no credentials found', async () => {
      mfaMocks.generateWebAuthnAuthenticationOptions.mockRejectedValue(
        new Error('No WebAuthn credentials found')
      );

      const res = await request(createApp()).post('/mfa/webauthn/authenticate/options');

      expect(res.status).toBe(400);
    });
  });

  describe('POST /mfa/webauthn/authenticate/verify', () => {
    it('should verify WebAuthn authentication', async () => {
      mfaMocks.verifyWebAuthnAuthentication.mockResolvedValue({ success: true });

      const res = await request(createApp())
        .post('/mfa/webauthn/authenticate/verify')
        .send({ response: { id: 'cred-id' } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 401 if authentication fails', async () => {
      mfaMocks.verifyWebAuthnAuthentication.mockResolvedValue({
        success: false, error: 'Invalid key',
      });

      const res = await request(createApp())
        .post('/mfa/webauthn/authenticate/verify')
        .send({ response: {} });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /mfa/webauthn/credentials', () => {
    it('should list WebAuthn credentials', async () => {
      mfaMocks.getWebAuthnCredentials.mockResolvedValue([
        { id: 'cred-1', name: 'My Key' },
      ]);

      const res = await request(createApp()).get('/mfa/webauthn/credentials');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('PATCH /mfa/webauthn/credentials/:credentialId', () => {
    it('should rename a credential', async () => {
      mfaMocks.renameWebAuthnCredential.mockResolvedValue({ success: true });

      const res = await request(createApp())
        .patch('/mfa/webauthn/credentials/cred-1')
        .send({ name: 'New Name' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 if rename fails', async () => {
      mfaMocks.renameWebAuthnCredential.mockResolvedValue({
        success: false, error: 'Not found',
      });

      const res = await request(createApp())
        .patch('/mfa/webauthn/credentials/cred-1')
        .send({ name: 'New Name' });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /mfa/webauthn/credentials/:credentialId', () => {
    it('should delete a credential', async () => {
      mfaMocks.deleteWebAuthnCredential.mockResolvedValue({ success: true });

      const res = await request(createApp()).delete('/mfa/webauthn/credentials/cred-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 if deletion fails', async () => {
      mfaMocks.deleteWebAuthnCredential.mockResolvedValue({
        success: false, error: 'Not found',
      });

      const res = await request(createApp()).delete('/mfa/webauthn/credentials/cred-1');

      expect(res.status).toBe(400);
    });
  });
});
