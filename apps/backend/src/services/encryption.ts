/**
 * E2E Encryption Service
 *
 * Provides utilities for managing encryption keys and validating encrypted messages.
 * Actual encryption/decryption happens client-side using Web Crypto API.
 *
 * Key Exchange Protocol:
 * 1. Each user generates an ECDH key pair on registration/first login
 * 2. Public keys are stored on the server, private keys stay on client
 * 3. When sending an encrypted message:
 *    a. Sender generates a random AES-256-GCM symmetric key
 *    b. Message is encrypted with the symmetric key
 *    c. Symmetric key is wrapped with recipient's public key
 *    d. Both encrypted message and wrapped key are sent to server
 * 4. Recipient uses their private key to unwrap the symmetric key and decrypt
 */

import { z } from 'zod';
import { randomBytes } from 'crypto';

/**
 * Schema for validating public key registration.
 */
export const publicKeySchema = z.object({
  publicKey: z.string().min(1, 'Public key is required'),
  keyId: z.string().optional(),
});

/**
 * Schema for validating encrypted message data.
 */
export const encryptedMessageSchema = z.object({
  content: z.string().min(1, 'Encrypted content is required'),
  isEncrypted: z.literal(true),
  encryptionKey: z.string().min(1, 'Wrapped encryption key is required'),
  keyId: z.string().min(1, 'Key ID is required'),
  iv: z.string().min(1, 'IV is required'),
});

/**
 * Schema for channel encryption key bundle.
 * Used when a user joins an encrypted channel.
 */
export const channelKeyBundleSchema = z.object({
  channelId: z.string().min(1),
  wrappedKeys: z.array(z.object({
    userId: z.string(),
    wrappedKey: z.string(),
  })),
});

/**
 * Generates a unique key identifier.
 *
 * @returns A unique key ID string.
 */
export function generateKeyId(): string {
  return `key_${randomBytes(16).toString('hex')}`;
}

/**
 * Validates that a public key string is properly formatted.
 * The key should be a base64-encoded ECDH public key.
 *
 * @param publicKey - The public key string to validate.
 * @returns True if the key appears valid.
 */
export function isValidPublicKey(publicKey: string): boolean {
  // Basic validation - check it's base64 and reasonable length
  try {
    const decoded = Buffer.from(publicKey, 'base64');
    // ECDH P-256 public key is 65 bytes uncompressed, 33 compressed
    // JWK format is longer
    return decoded.length >= 33 && decoded.length <= 500;
  } catch {
    return false;
  }
}

/**
 * Validates encrypted message metadata.
 *
 * @param data - The encrypted message data to validate.
 * @returns Parsed and validated data or null if invalid.
 */
export function validateEncryptedMessage(data: unknown): z.infer<typeof encryptedMessageSchema> | null {
  const result = encryptedMessageSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Masks encrypted content for logging purposes.
 * Never log actual encrypted content.
 *
 * @param content - The encrypted content.
 * @returns A masked representation.
 */
export function maskEncryptedContent(content: string): string {
  return `[ENCRYPTED:${content.length} chars]`;
}

/**
 * E2E Encryption status for a channel or conversation.
 */
export interface EncryptionStatus {
  enabled: boolean;
  allMembersHaveKeys: boolean;
  membersWithoutKeys: string[];
}

/**
 * Checks if all members of a channel have registered public keys.
 *
 * @param members - Array of members with their public key status.
 * @returns Encryption status for the channel.
 */
export function checkEncryptionReadiness(
  members: Array<{ userId: string; username: string; publicKey: string | null }>
): EncryptionStatus {
  const membersWithoutKeys = members
    .filter(m => !m.publicKey)
    .map(m => m.username);

  return {
    enabled: membersWithoutKeys.length === 0,
    allMembersHaveKeys: membersWithoutKeys.length === 0,
    membersWithoutKeys,
  };
}

/**
 * Response type for key exchange endpoints.
 */
export interface PublicKeyInfo {
  userId: string;
  username: string;
  publicKey: string;
  keyId: string;
}

/**
 * Audit log event types for encryption.
 */
export const EncryptionAuditEvents = {
  KEY_REGISTERED: 'E2E_KEY_REGISTERED',
  KEY_ROTATED: 'E2E_KEY_ROTATED',
  ENCRYPTED_MESSAGE_SENT: 'E2E_MESSAGE_SENT',
  CHANNEL_ENCRYPTION_ENABLED: 'E2E_CHANNEL_ENABLED',
  CHANNEL_ENCRYPTION_DISABLED: 'E2E_CHANNEL_DISABLED',
} as const;
