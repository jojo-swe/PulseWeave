import { describe, expect, it, vi, beforeEach } from 'vitest';

const { authenticatorVerify, authenticatorGenerateSecret, authenticatorKeyuri } = vi.hoisted(() => ({
  authenticatorVerify: vi.fn(),
  authenticatorGenerateSecret: vi.fn(),
  authenticatorKeyuri: vi.fn(),
}));

vi.mock('otplib', () => ({
  authenticator: {
    generateSecret: authenticatorGenerateSecret,
    keyuri: authenticatorKeyuri,
    verify: authenticatorVerify,
    options: {},
  },
}));

const { toDataURL } = vi.hoisted(() => ({
  toDataURL: vi.fn(),
}));

vi.mock('qrcode', () => ({
  toDataURL,
}));

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));

vi.mock('@pulseweave/database', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    webAuthnCredential: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
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

import bcrypt from 'bcryptjs';
import { prisma } from '@pulseweave/database';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import {
  generateTotpSecret,
  verifyTotpToken,
  enableTotp,
  disableTotp,
  verifyBackupCode,
  regenerateBackupCodes,
  generateWebAuthnRegistrationOptions,
  verifyWebAuthnRegistration,
  generateWebAuthnAuthenticationOptions,
  verifyWebAuthnAuthentication,
  getWebAuthnCredentials,
  deleteWebAuthnCredential,
  renameWebAuthnCredential,
} from './mfa';

describe('mfa service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // TOTP
  // ==========================================================================
  describe('generateTotpSecret', () => {
    it('should generate secret, otpauth URL, and QR code', async () => {
      authenticatorGenerateSecret.mockReturnValue('TESTSECRET123456');
      authenticatorKeyuri.mockReturnValue('otpauth://totp/test');
      toDataURL.mockResolvedValue('data:image/png;base64,QRDATA');

      const result = await generateTotpSecret('user@example.com');

      expect(result.secret).toBe('TESTSECRET123456');
      expect(result.otpauthUrl).toBe('otpauth://totp/test');
      expect(result.qrCodeDataUrl).toBe('data:image/png;base64,QRDATA');
    });
  });

  describe('verifyTotpToken', () => {
    it('should return true for valid token', () => {
      authenticatorVerify.mockReturnValue(true);
      expect(verifyTotpToken('123456', 'secret')).toBe(true);
    });

    it('should return false for invalid token', () => {
      authenticatorVerify.mockReturnValue(false);
      expect(verifyTotpToken('wrong', 'secret')).toBe(false);
    });

    it('should return false when authenticator throws', () => {
      authenticatorVerify.mockImplementation(() => {
        throw new Error('decode error');
      });
      expect(verifyTotpToken('123456', 'bad-secret')).toBe(false);
    });
  });

  describe('enableTotp', () => {
    it('should fail if token verification fails', async () => {
      authenticatorVerify.mockReturnValue(false);

      const result = await enableTotp('user-1', 'secret', 'wrong-token');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid verification code');
    });

    it('should enable TOTP and return backup codes on success', async () => {
      authenticatorVerify.mockReturnValue(true);
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);

      const result = await enableTotp('user-1', 'secret', '123456');

      expect(result.success).toBe(true);
      expect(result.backupCodes).toBeDefined();
      expect(result.backupCodes).toHaveLength(10);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            mfaEnabled: true,
            mfaSecret: 'secret',
          }),
        })
      );
    });

    it('should generate backup codes in XXXX-XXXX format', async () => {
      authenticatorVerify.mockReturnValue(true);
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);

      const result = await enableTotp('user-1', 'secret', '123456');

      expect(result.backupCodes).toBeDefined();
      for (const code of result.backupCodes!) {
        expect(code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/);
      }
    });
  });

  describe('disableTotp', () => {
    it('should fail if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const result = await disableTotp('user-1', 'password');

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    it('should fail if password is invalid', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        passwordHash: '$2a$10$hashedpassword',
      } as never);

      const result = await disableTotp('user-1', 'wrong-password');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid password');
    });

    it('should disable TOTP and delete WebAuthn credentials on success', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        passwordHash: hashedPassword,
      } as never);
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);
      vi.mocked(prisma.webAuthnCredential.deleteMany).mockResolvedValue({ count: 2 } as never);

      const result = await disableTotp('user-1', 'password123');

      expect(result.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mfaEnabled: false,
            mfaSecret: null,
            mfaBackupCodes: null,
          }),
        })
      );
      expect(prisma.webAuthnCredential.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });
  });

  describe('verifyBackupCode', () => {
    it('should return false if user has no backup codes', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        mfaBackupCodes: null,
      } as never);

      const result = await verifyBackupCode('user-1', 'ABCD-1234');

      expect(result).toBe(false);
    });

    it('should return false if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const result = await verifyBackupCode('user-1', 'ABCD-1234');

      expect(result).toBe(false);
    });

    it('should verify and invalidate a valid backup code', async () => {
      const code = 'ABCD-1234';
      const hashedCode = await bcrypt.hash(code, 10);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        mfaBackupCodes: JSON.stringify([hashedCode]),
      } as never);
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);

      const result = await verifyBackupCode('user-1', code);

      expect(result).toBe(true);
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('should return false for invalid backup code', async () => {
      const hashedCode = await bcrypt.hash('ABCD-1234', 10);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        mfaBackupCodes: JSON.stringify([hashedCode]),
      } as never);

      const result = await verifyBackupCode('user-1', 'WRONG-CODE');

      expect(result).toBe(false);
    });

    it('should normalize code format (lowercase, no hyphen)', async () => {
      const code = 'ABCD-1234';
      const hashedCode = await bcrypt.hash(code, 10);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        mfaBackupCodes: JSON.stringify([hashedCode]),
      } as never);
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);

      // Pass without hyphen and in lowercase — should be normalized
      const result = await verifyBackupCode('user-1', 'abcd1234');

      expect(result).toBe(true);
    });
  });

  describe('regenerateBackupCodes', () => {
    it('should fail if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const result = await regenerateBackupCodes('user-1', 'password');

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    it('should fail if MFA is not enabled', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        passwordHash: 'hash',
        mfaEnabled: false,
      } as never);

      const result = await regenerateBackupCodes('user-1', 'password');

      expect(result.success).toBe(false);
      expect(result.error).toBe('MFA is not enabled');
    });

    it('should fail if password is invalid', async () => {
      const hashedPassword = await bcrypt.hash('correct', 10);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        passwordHash: hashedPassword,
        mfaEnabled: true,
      } as never);

      const result = await regenerateBackupCodes('user-1', 'wrong');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid password');
    });

    it('should regenerate backup codes on success', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        passwordHash: hashedPassword,
        mfaEnabled: true,
      } as never);
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);

      const result = await regenerateBackupCodes('user-1', 'password123');

      expect(result.success).toBe(true);
      expect(result.backupCodes).toHaveLength(10);
      expect(prisma.user.update).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // WebAuthn
  // ==========================================================================
  describe('generateWebAuthnRegistrationOptions', () => {
    it('should throw if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      await expect(generateWebAuthnRegistrationOptions('user-1')).rejects.toThrow('User not found');
    });

    it('should generate registration options with existing credentials excluded', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        username: 'user1',
        displayName: 'User One',
      } as never);
      vi.mocked(prisma.webAuthnCredential.findMany).mockResolvedValue([
        { credentialId: 'cred-1', transports: JSON.stringify(['usb']) },
      ] as never);
      vi.mocked(generateRegistrationOptions).mockResolvedValue({
        challenge: 'test-challenge',
      } as never);

      const result = await generateWebAuthnRegistrationOptions('user-1');

      expect(result).toEqual({ challenge: 'test-challenge' });
      expect(generateRegistrationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          rpName: 'PulseWeave',
          userID: expect.any(Uint8Array),
          userName: 'user@example.com',
        })
      );
    });

    it('should handle credentials without transports', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        username: 'user1',
        displayName: 'User One',
      } as never);
      vi.mocked(prisma.webAuthnCredential.findMany).mockResolvedValue([
        { credentialId: 'cred-1', transports: null },
      ] as never);
      vi.mocked(generateRegistrationOptions).mockResolvedValue({
        challenge: 'test-challenge',
      } as never);

      const result = await generateWebAuthnRegistrationOptions('user-1');

      expect(result).toEqual({ challenge: 'test-challenge' });
    });
  });

  describe('verifyWebAuthnRegistration', () => {
    it('should fail if no challenge found', async () => {
      const response = { id: 'cred-1', response: { transports: [] } } as never;

      const result = await verifyWebAuthnRegistration('user-no-challenge-reg', response, 'My Key');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No challenge found');
    });

    it('should fail if verification not verified', async () => {
      // Need to set a challenge first
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        username: 'user1',
        displayName: 'User One',
      } as never);
      vi.mocked(prisma.webAuthnCredential.findMany).mockResolvedValue([] as never);
      vi.mocked(generateRegistrationOptions).mockResolvedValue({
        challenge: 'test-challenge',
      } as never);
      await generateWebAuthnRegistrationOptions('user-1');

      vi.mocked(verifyRegistrationResponse).mockResolvedValue({
        verified: false,
        registrationInfo: undefined,
      } as never);

      const response = { id: 'cred-1', response: { transports: ['usb'] } } as never;
      const result = await verifyWebAuthnRegistration('user-1', response, 'My Key');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Verification failed');
    });

    it('should store credential and enable MFA on success', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        username: 'user1',
        displayName: 'User One',
      } as never);
      vi.mocked(prisma.webAuthnCredential.findMany).mockResolvedValue([] as never);
      vi.mocked(generateRegistrationOptions).mockResolvedValue({
        challenge: 'test-challenge',
      } as never);
      await generateWebAuthnRegistrationOptions('user-1');

      vi.mocked(verifyRegistrationResponse).mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: {
            id: new Uint8Array([1, 2, 3]),
            publicKey: new Uint8Array([4, 5, 6]),
            counter: 0,
          },
          credentialDeviceType: 'singleDevice',
          credentialBackedUp: false,
        },
      } as never);
      vi.mocked(prisma.webAuthnCredential.create).mockResolvedValue({} as never);
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);

      const response = {
        id: 'cred-1',
        response: { transports: ['usb'] },
      } as never;
      const result = await verifyWebAuthnRegistration('user-1', response, 'My Key');

      expect(result.success).toBe(true);
      expect(prisma.webAuthnCredential.create).toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { mfaEnabled: true },
        })
      );
    });

    it('should handle verification errors', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        username: 'user1',
        displayName: 'User One',
      } as never);
      vi.mocked(prisma.webAuthnCredential.findMany).mockResolvedValue([] as never);
      vi.mocked(generateRegistrationOptions).mockResolvedValue({
        challenge: 'test-challenge',
      } as never);
      await generateWebAuthnRegistrationOptions('user-1');

      vi.mocked(verifyRegistrationResponse).mockRejectedValue(new Error('Verification error'));

      const response = { id: 'cred-1', response: { transports: [] } } as never;
      const result = await verifyWebAuthnRegistration('user-1', response, 'My Key');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Registration failed');
    });
  });

  describe('generateWebAuthnAuthenticationOptions', () => {
    it('should throw if no WebAuthn credentials found', async () => {
      vi.mocked(prisma.webAuthnCredential.findMany).mockResolvedValue([] as never);

      await expect(generateWebAuthnAuthenticationOptions('user-1')).rejects.toThrow(
        'No WebAuthn credentials found'
      );
    });

    it('should generate authentication options', async () => {
      vi.mocked(prisma.webAuthnCredential.findMany).mockResolvedValue([
        { credentialId: 'cred-1', transports: JSON.stringify(['usb']) },
      ] as never);
      vi.mocked(generateAuthenticationOptions).mockResolvedValue({
        challenge: 'auth-challenge',
      } as never);

      const result = await generateWebAuthnAuthenticationOptions('user-1');

      expect(result).toEqual({ challenge: 'auth-challenge' });
    });
  });

  describe('verifyWebAuthnAuthentication', () => {
    it('should fail if no challenge found', async () => {
      const response = { id: 'cred-1' } as never;

      const result = await verifyWebAuthnAuthentication('user-no-challenge-auth', response);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No challenge found');
    });

    it('should fail if credential not found', async () => {
      // Set a challenge first
      vi.mocked(prisma.webAuthnCredential.findMany).mockResolvedValue([
        { credentialId: 'cred-1', transports: null },
      ] as never);
      vi.mocked(generateAuthenticationOptions).mockResolvedValue({
        challenge: 'auth-challenge',
      } as never);
      await generateWebAuthnAuthenticationOptions('user-1');

      vi.mocked(prisma.webAuthnCredential.findUnique).mockResolvedValue(null);

      const response = { id: 'cred-1' } as never;
      const result = await verifyWebAuthnAuthentication('user-1', response);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Credential not found');
    });

    it('should fail if credential belongs to different user', async () => {
      vi.mocked(prisma.webAuthnCredential.findMany).mockResolvedValue([
        { credentialId: 'cred-1', transports: null },
      ] as never);
      vi.mocked(generateAuthenticationOptions).mockResolvedValue({
        challenge: 'auth-challenge',
      } as never);
      await generateWebAuthnAuthenticationOptions('user-1');

      vi.mocked(prisma.webAuthnCredential.findUnique).mockResolvedValue({
        id: 'db-cred-1',
        userId: 'different-user',
        credentialId: 'cred-1',
        publicKey: 'base64key',
        counter: 0,
        transports: null,
      } as never);

      const response = { id: 'cred-1' } as never;
      const result = await verifyWebAuthnAuthentication('user-1', response);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Credential not found');
    });

    it('should update counter on successful authentication', async () => {
      vi.mocked(prisma.webAuthnCredential.findMany).mockResolvedValue([
        { credentialId: 'cred-1', transports: null },
      ] as never);
      vi.mocked(generateAuthenticationOptions).mockResolvedValue({
        challenge: 'auth-challenge',
      } as never);
      await generateWebAuthnAuthenticationOptions('user-1');

      vi.mocked(prisma.webAuthnCredential.findUnique).mockResolvedValue({
        id: 'db-cred-1',
        userId: 'user-1',
        credentialId: 'cred-1',
        publicKey: 'base64key',
        counter: 0,
        transports: null,
      } as never);
      vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
        verified: true,
        authenticationInfo: { newCounter: 1 },
      } as never);
      vi.mocked(prisma.webAuthnCredential.update).mockResolvedValue({} as never);

      const response = { id: 'cred-1' } as never;
      const result = await verifyWebAuthnAuthentication('user-1', response);

      expect(result.success).toBe(true);
      expect(prisma.webAuthnCredential.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            counter: 1,
            lastUsedAt: expect.any(Date),
          }),
        })
      );
    });

    it('should handle authentication errors', async () => {
      vi.mocked(prisma.webAuthnCredential.findMany).mockResolvedValue([
        { credentialId: 'cred-1', transports: null },
      ] as never);
      vi.mocked(generateAuthenticationOptions).mockResolvedValue({
        challenge: 'auth-challenge',
      } as never);
      await generateWebAuthnAuthenticationOptions('user-1');

      vi.mocked(prisma.webAuthnCredential.findUnique).mockResolvedValue({
        id: 'db-cred-1',
        userId: 'user-1',
        credentialId: 'cred-1',
        publicKey: 'base64key',
        counter: 0,
        transports: null,
      } as never);
      vi.mocked(verifyAuthenticationResponse).mockRejectedValue(new Error('Auth error'));

      const response = { id: 'cred-1' } as never;
      const result = await verifyWebAuthnAuthentication('user-1', response);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication failed');
    });
  });

  describe('getWebAuthnCredentials', () => {
    it('should return credentials for a user', async () => {
      const creds = [
        { id: 'cred-1', name: 'Key 1', deviceType: 'singleDevice', backedUp: false, createdAt: new Date(), lastUsedAt: null },
      ];
      vi.mocked(prisma.webAuthnCredential.findMany).mockResolvedValue(creds as never);

      const result = await getWebAuthnCredentials('user-1');

      expect(result).toEqual(creds);
      expect(prisma.webAuthnCredential.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        select: expect.objectContaining({
          id: true,
          name: true,
        }),
      });
    });
  });

  describe('deleteWebAuthnCredential', () => {
    it('should fail if credential not found', async () => {
      vi.mocked(prisma.webAuthnCredential.findFirst).mockResolvedValue(null);

      const result = await deleteWebAuthnCredential('user-1', 'cred-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Credential not found');
    });

    it('should delete credential and keep MFA enabled if other methods exist', async () => {
      vi.mocked(prisma.webAuthnCredential.findFirst).mockResolvedValue({ id: 'cred-1' } as never);
      vi.mocked(prisma.webAuthnCredential.delete).mockResolvedValue({} as never);
      vi.mocked(prisma.webAuthnCredential.count).mockResolvedValue(1 as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ mfaSecret: 'secret' } as never);

      const result = await deleteWebAuthnCredential('user-1', 'cred-1');

      expect(result.success).toBe(true);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('should disable MFA if no credentials and no TOTP secret remain', async () => {
      vi.mocked(prisma.webAuthnCredential.findFirst).mockResolvedValue({ id: 'cred-1' } as never);
      vi.mocked(prisma.webAuthnCredential.delete).mockResolvedValue({} as never);
      vi.mocked(prisma.webAuthnCredential.count).mockResolvedValue(0 as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ mfaSecret: null } as never);
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);

      const result = await deleteWebAuthnCredential('user-1', 'cred-1');

      expect(result.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { mfaEnabled: false },
        })
      );
    });
  });

  describe('renameWebAuthnCredential', () => {
    it('should fail if credential not found', async () => {
      vi.mocked(prisma.webAuthnCredential.findFirst).mockResolvedValue(null);

      const result = await renameWebAuthnCredential('user-1', 'cred-1', 'New Name');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Credential not found');
    });

    it('should rename credential on success', async () => {
      vi.mocked(prisma.webAuthnCredential.findFirst).mockResolvedValue({ id: 'cred-1' } as never);
      vi.mocked(prisma.webAuthnCredential.update).mockResolvedValue({} as never);

      const result = await renameWebAuthnCredential('user-1', 'cred-1', 'New Name');

      expect(result.success).toBe(true);
      expect(prisma.webAuthnCredential.update).toHaveBeenCalledWith({
        where: { id: 'cred-1' },
        data: { name: 'New Name' },
      });
    });
  });
});
