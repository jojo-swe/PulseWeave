import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@pulseweave/database';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  VerifiedRegistrationResponse,
  VerifiedAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server';

/**
 * App configuration for TOTP.
 */
const APP_NAME = 'PulseWeave';

/**
 * Configure TOTP authenticator with time window for clock drift tolerance.
 * Window of 1 means codes from 30 seconds before/after are also valid.
 */
authenticator.options = {
  window: 1, // Allow 1 step before/after (±30 seconds)
  step: 30,  // 30-second time step (standard)
};

/**
 * WebAuthn configuration.
 */
const RP_NAME = 'PulseWeave';
const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost';
const ORIGIN = process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000';

/**
 * In-memory challenge store (use Redis in production).
 */
const challengeStore = new Map<string, string>();

// ============================================================================
// TOTP (Time-based One-Time Password)
// ============================================================================

/**
 * Generates a new TOTP secret for a user.
 * @param email - User's email for the authenticator label
 * @returns Object with secret and QR code data URL
 */
export async function generateTotpSecret(email: string): Promise<{
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}> {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(email, APP_NAME, secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  return {
    secret,
    otpauthUrl,
    qrCodeDataUrl,
  };
}

/**
 * Verifies a TOTP token against a secret.
 * @param token - The 6-digit token from authenticator app
 * @param secret - The user's TOTP secret
 * @returns True if valid
 */
export function verifyTotpToken(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

/**
 * Enables TOTP for a user.
 * @param userId - The user ID
 * @param secret - The TOTP secret
 * @param token - Initial verification token
 * @returns Object with success status and backup codes
 */
export async function enableTotp(
  userId: string,
  secret: string,
  token: string
): Promise<{ success: boolean; backupCodes?: string[]; error?: string }> {
  // Verify the token first
  if (!verifyTotpToken(token, secret)) {
    return { success: false, error: 'Invalid verification code' };
  }

  // Generate backup codes
  const backupCodes = generateBackupCodes();
  const hashedBackupCodes = await Promise.all(
    backupCodes.map(code => bcrypt.hash(code, 10))
  );

  // Update user
  await prisma.user.update({
    where: { id: userId },
    data: {
      mfaEnabled: true,
      mfaSecret: secret,
      mfaBackupCodes: JSON.stringify(hashedBackupCodes),
    },
  });

  return { success: true, backupCodes };
}

/**
 * Disables TOTP for a user.
 * @param userId - The user ID
 * @param password - User's password for verification
 */
export async function disableTotp(
  userId: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });

  if (!user) {
    return { success: false, error: 'User not found' };
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    return { success: false, error: 'Invalid password' };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodes: null,
    },
  });

  // Also remove all WebAuthn credentials
  await prisma.webAuthnCredential.deleteMany({
    where: { userId },
  });

  return { success: true };
}

/**
 * Generates backup codes for account recovery.
 * @param count - Number of codes to generate
 * @returns Array of backup codes
 */
function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // Generate 8-character alphanumeric codes
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

/**
 * Verifies a backup code and invalidates it if valid.
 * @param userId - The user ID
 * @param code - The backup code to verify
 * @returns True if valid
 */
export async function verifyBackupCode(
  userId: string,
  code: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaBackupCodes: true },
  });

  if (!user?.mfaBackupCodes) {
    return false;
  }

  const hashedCodes: string[] = JSON.parse(user.mfaBackupCodes);
  const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const formattedCode = `${normalizedCode.slice(0, 4)}-${normalizedCode.slice(4)}`;

  for (let i = 0; i < hashedCodes.length; i++) {
    const isValid = await bcrypt.compare(formattedCode, hashedCodes[i]);
    if (isValid) {
      // Remove the used code
      hashedCodes.splice(i, 1);
      await prisma.user.update({
        where: { id: userId },
        data: { mfaBackupCodes: JSON.stringify(hashedCodes) },
      });
      return true;
    }
  }

  return false;
}

/**
 * Regenerates backup codes for a user.
 * @param userId - The user ID
 * @param password - User's password for verification
 * @returns New backup codes or error
 */
export async function regenerateBackupCodes(
  userId: string,
  password: string
): Promise<{ success: boolean; backupCodes?: string[]; error?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, mfaEnabled: true },
  });

  if (!user) {
    return { success: false, error: 'User not found' };
  }

  if (!user.mfaEnabled) {
    return { success: false, error: 'MFA is not enabled' };
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    return { success: false, error: 'Invalid password' };
  }

  const backupCodes = generateBackupCodes();
  const hashedBackupCodes = await Promise.all(
    backupCodes.map(code => bcrypt.hash(code, 10))
  );

  await prisma.user.update({
    where: { id: userId },
    data: { mfaBackupCodes: JSON.stringify(hashedBackupCodes) },
  });

  return { success: true, backupCodes };
}

// ============================================================================
// WebAuthn (YubiKey, Passkeys, etc.)
// ============================================================================

/**
 * Generates WebAuthn registration options.
 * @param userId - The user ID
 * @returns Registration options for the client
 */
export async function generateWebAuthnRegistrationOptions(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, username: true, displayName: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Get existing credentials to exclude
  const existingCredentials = await prisma.webAuthnCredential.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  });

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(user.id),
    userName: user.email,
    userDisplayName: user.displayName,
    attestationType: 'none',
    excludeCredentials: existingCredentials.map(cred => ({
      id: cred.credentialId,
      transports: cred.transports 
        ? JSON.parse(cred.transports) as AuthenticatorTransportFuture[]
        : undefined,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  // Store challenge
  challengeStore.set(userId, options.challenge);

  return options;
}

/**
 * Verifies WebAuthn registration response.
 * @param userId - The user ID
 * @param response - The registration response from client
 * @param credentialName - User-friendly name for the credential
 * @returns Verification result
 */
export async function verifyWebAuthnRegistration(
  userId: string,
  response: RegistrationResponseJSON,
  credentialName: string
): Promise<{ success: boolean; error?: string }> {
  const expectedChallenge = challengeStore.get(userId);
  if (!expectedChallenge) {
    return { success: false, error: 'No challenge found' };
  }

  try {
    const verification: VerifiedRegistrationResponse = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return { success: false, error: 'Verification failed' };
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    // Store credential
    await prisma.webAuthnCredential.create({
      data: {
        userId,
        credentialId: Buffer.from(credential.id).toString('base64url'),
        publicKey: Buffer.from(credential.publicKey).toString('base64'),
        counter: credential.counter,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports: response.response.transports 
          ? JSON.stringify(response.response.transports) 
          : null,
        name: credentialName || 'Security Key',
      },
    });

    // Enable MFA if not already enabled
    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });

    // Clean up challenge
    challengeStore.delete(userId);

    return { success: true };
  } catch (error) {
    console.error('WebAuthn registration error:', error);
    return { success: false, error: 'Registration failed' };
  }
}

/**
 * Generates WebAuthn authentication options.
 * @param userId - The user ID
 * @returns Authentication options for the client
 */
export async function generateWebAuthnAuthenticationOptions(userId: string) {
  const credentials = await prisma.webAuthnCredential.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  });

  if (credentials.length === 0) {
    throw new Error('No WebAuthn credentials found');
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: credentials.map(cred => ({
      id: cred.credentialId,
      transports: cred.transports 
        ? JSON.parse(cred.transports) as AuthenticatorTransportFuture[]
        : undefined,
    })),
    userVerification: 'preferred',
  });

  // Store challenge
  challengeStore.set(userId, options.challenge);

  return options;
}

/**
 * Verifies WebAuthn authentication response.
 * @param userId - The user ID
 * @param response - The authentication response from client
 * @returns Verification result
 */
export async function verifyWebAuthnAuthentication(
  userId: string,
  response: AuthenticationResponseJSON
): Promise<{ success: boolean; error?: string }> {
  const expectedChallenge = challengeStore.get(userId);
  if (!expectedChallenge) {
    return { success: false, error: 'No challenge found' };
  }

  const credentialId = response.id;
  const credential = await prisma.webAuthnCredential.findUnique({
    where: { credentialId },
  });

  if (!credential || credential.userId !== userId) {
    return { success: false, error: 'Credential not found' };
  }

  try {
    const verification: VerifiedAuthenticationResponse = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(Buffer.from(credential.publicKey, 'base64')),
        counter: credential.counter,
        transports: credential.transports 
          ? JSON.parse(credential.transports) as AuthenticatorTransportFuture[]
          : undefined,
      },
    });

    if (!verification.verified) {
      return { success: false, error: 'Verification failed' };
    }

    // Update counter
    await prisma.webAuthnCredential.update({
      where: { id: credential.id },
      data: {
        counter: verification.authenticationInfo.newCounter,
        lastUsedAt: new Date(),
      },
    });

    // Clean up challenge
    challengeStore.delete(userId);

    return { success: true };
  } catch (error) {
    console.error('WebAuthn authentication error:', error);
    return { success: false, error: 'Authentication failed' };
  }
}

/**
 * Gets all WebAuthn credentials for a user.
 * @param userId - The user ID
 * @returns Array of credentials (without sensitive data)
 */
export async function getWebAuthnCredentials(userId: string) {
  return prisma.webAuthnCredential.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      deviceType: true,
      backedUp: true,
      createdAt: true,
      lastUsedAt: true,
    },
  });
}

/**
 * Deletes a WebAuthn credential.
 * @param userId - The user ID
 * @param credentialId - The credential ID to delete
 */
export async function deleteWebAuthnCredential(
  userId: string,
  credentialId: string
): Promise<{ success: boolean; error?: string }> {
  const credential = await prisma.webAuthnCredential.findFirst({
    where: { id: credentialId, userId },
  });

  if (!credential) {
    return { success: false, error: 'Credential not found' };
  }

  await prisma.webAuthnCredential.delete({
    where: { id: credentialId },
  });

  // Check if user has any remaining MFA methods
  const remainingCredentials = await prisma.webAuthnCredential.count({
    where: { userId },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaSecret: true },
  });

  // Disable MFA if no methods remain
  if (remainingCredentials === 0 && !user?.mfaSecret) {
    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false },
    });
  }

  return { success: true };
}

/**
 * Renames a WebAuthn credential.
 * @param userId - The user ID
 * @param credentialId - The credential ID
 * @param newName - The new name
 */
export async function renameWebAuthnCredential(
  userId: string,
  credentialId: string,
  newName: string
): Promise<{ success: boolean; error?: string }> {
  const credential = await prisma.webAuthnCredential.findFirst({
    where: { id: credentialId, userId },
  });

  if (!credential) {
    return { success: false, error: 'Credential not found' };
  }

  await prisma.webAuthnCredential.update({
    where: { id: credentialId },
    data: { name: newName },
  });

  return { success: true };
}
