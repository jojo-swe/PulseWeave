import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@chatterbox/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
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
} from '../services/mfa';

const router = Router();

// ============================================================================
// MFA Status
// ============================================================================

/**
 * Get MFA status for current user.
 */
router.get('/status', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        mfaEnabled: true,
        mfaSecret: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const webauthnCredentials = await getWebAuthnCredentials(req.userId!);

    res.json({
      mfaEnabled: user.mfaEnabled,
      totpEnabled: !!user.mfaSecret,
      webauthnEnabled: webauthnCredentials.length > 0,
      webauthnCredentials,
    });
  } catch (error) {
    console.error('Get MFA status error:', error);
    res.status(500).json({ error: 'Failed to get MFA status' });
  }
});

// ============================================================================
// TOTP
// ============================================================================

/**
 * Generate TOTP setup (secret + QR code).
 */
router.post('/totp/setup', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { email: true, mfaSecret: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.mfaSecret) {
      return res.status(400).json({ error: 'TOTP is already enabled' });
    }

    const { secret, qrCodeDataUrl } = await generateTotpSecret(user.email);

    // Store temporarily - will be confirmed on enable
    res.json({ secret, qrCodeDataUrl });
  } catch (error) {
    console.error('TOTP setup error:', error);
    res.status(500).json({ error: 'Failed to setup TOTP' });
  }
});

const enableTotpSchema = z.object({
  secret: z.string(),
  token: z.string().length(6),
});

/**
 * Enable TOTP with verification.
 */
router.post('/totp/enable', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { secret, token } = enableTotpSchema.parse(req.body);

    const result = await enableTotp(req.userId!, secret, token);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      backupCodes: result.backupCodes,
      message: 'TOTP enabled successfully. Save your backup codes securely.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Enable TOTP error:', error);
    res.status(500).json({ error: 'Failed to enable TOTP' });
  }
});

const disableTotpSchema = z.object({
  password: z.string(),
});

/**
 * Disable TOTP.
 */
router.post('/totp/disable', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { password } = disableTotpSchema.parse(req.body);

    const result = await disableTotp(req.userId!, password);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, message: 'TOTP disabled successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Disable TOTP error:', error);
    res.status(500).json({ error: 'Failed to disable TOTP' });
  }
});

const verifyTotpSchema = z.object({
  token: z.string().length(6),
});

/**
 * Verify TOTP token (for MFA challenge during login).
 */
router.post('/totp/verify', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { token } = verifyTotpSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { mfaSecret: true },
    });

    if (!user?.mfaSecret) {
      return res.status(400).json({ error: 'TOTP is not enabled' });
    }

    const isValid = verifyTotpToken(token, user.mfaSecret);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Verify TOTP error:', error);
    res.status(500).json({ error: 'Failed to verify TOTP' });
  }
});

// ============================================================================
// Backup Codes
// ============================================================================

const verifyBackupCodeSchema = z.object({
  code: z.string(),
});

/**
 * Verify backup code.
 */
router.post('/backup/verify', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { code } = verifyBackupCodeSchema.parse(req.body);

    const isValid = await verifyBackupCode(req.userId!, code);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid backup code' });
    }

    res.json({ success: true, message: 'Backup code used. This code is now invalid.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Verify backup code error:', error);
    res.status(500).json({ error: 'Failed to verify backup code' });
  }
});

const regenerateBackupCodesSchema = z.object({
  password: z.string(),
});

/**
 * Regenerate backup codes.
 */
router.post('/backup/regenerate', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { password } = regenerateBackupCodesSchema.parse(req.body);

    const result = await regenerateBackupCodes(req.userId!, password);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      backupCodes: result.backupCodes,
      message: 'New backup codes generated. Old codes are now invalid.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Regenerate backup codes error:', error);
    res.status(500).json({ error: 'Failed to regenerate backup codes' });
  }
});

// ============================================================================
// WebAuthn (YubiKey, Passkeys)
// ============================================================================

/**
 * Get WebAuthn registration options.
 */
router.post('/webauthn/register/options', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const options = await generateWebAuthnRegistrationOptions(req.userId!);
    res.json(options);
  } catch (error) {
    console.error('WebAuthn registration options error:', error);
    res.status(500).json({ error: 'Failed to generate registration options' });
  }
});

const webauthnRegisterSchema = z.object({
  response: z.any(),
  name: z.string().min(1).max(50).optional(),
});

/**
 * Complete WebAuthn registration.
 */
router.post('/webauthn/register/verify', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { response, name } = webauthnRegisterSchema.parse(req.body);

    const result = await verifyWebAuthnRegistration(
      req.userId!,
      response,
      name || 'Security Key'
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, message: 'Security key registered successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('WebAuthn registration verify error:', error);
    res.status(500).json({ error: 'Failed to register security key' });
  }
});

/**
 * Get WebAuthn authentication options.
 */
router.post('/webauthn/authenticate/options', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const options = await generateWebAuthnAuthenticationOptions(req.userId!);
    res.json(options);
  } catch (error: any) {
    if (error.message === 'No WebAuthn credentials found') {
      return res.status(400).json({ error: 'No security keys registered' });
    }
    console.error('WebAuthn authentication options error:', error);
    res.status(500).json({ error: 'Failed to generate authentication options' });
  }
});

const webauthnAuthenticateSchema = z.object({
  response: z.any(),
});

/**
 * Complete WebAuthn authentication.
 */
router.post('/webauthn/authenticate/verify', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { response } = webauthnAuthenticateSchema.parse(req.body);

    const result = await verifyWebAuthnAuthentication(req.userId!, response);

    if (!result.success) {
      return res.status(401).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('WebAuthn authentication verify error:', error);
    res.status(500).json({ error: 'Failed to authenticate with security key' });
  }
});

/**
 * List WebAuthn credentials.
 */
router.get('/webauthn/credentials', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const credentials = await getWebAuthnCredentials(req.userId!);
    res.json(credentials);
  } catch (error) {
    console.error('Get WebAuthn credentials error:', error);
    res.status(500).json({ error: 'Failed to get security keys' });
  }
});

const renameCredentialSchema = z.object({
  name: z.string().min(1).max(50),
});

/**
 * Rename a WebAuthn credential.
 */
router.patch('/webauthn/credentials/:credentialId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { credentialId } = req.params;
    const { name } = renameCredentialSchema.parse(req.body);

    const result = await renameWebAuthnCredential(req.userId!, credentialId, name);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Rename WebAuthn credential error:', error);
    res.status(500).json({ error: 'Failed to rename security key' });
  }
});

/**
 * Delete a WebAuthn credential.
 */
router.delete('/webauthn/credentials/:credentialId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { credentialId } = req.params;

    const result = await deleteWebAuthnCredential(req.userId!, credentialId);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, message: 'Security key removed' });
  } catch (error) {
    console.error('Delete WebAuthn credential error:', error);
    res.status(500).json({ error: 'Failed to remove security key' });
  }
});

export { router as mfaRouter };
