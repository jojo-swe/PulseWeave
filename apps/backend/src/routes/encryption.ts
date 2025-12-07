/**
 * E2E Encryption Routes
 *
 * Handles public key registration, key exchange, and encryption status endpoints.
 * Actual encryption/decryption is performed client-side.
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@pulseweave/database';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler, Errors } from '../middleware/error-handler';
import { validate } from '../middleware/validate';
import {
  publicKeySchema,
  generateKeyId,
  isValidPublicKey,
  checkEncryptionReadiness,
  EncryptionAuditEvents,
  type PublicKeyInfo,
} from '../services/encryption';

const router = Router();

/**
 * Register or update the user's public key for E2E encryption.
 *
 * @route POST /api/encryption/keys
 * @body publicKey - Base64 encoded ECDH public key.
 */
router.post(
  '/keys',
  validate(publicKeySchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { publicKey } = req.body;

    if (!isValidPublicKey(publicKey)) {
      throw Errors.badRequest('Invalid public key format');
    }

    const keyId = generateKeyId();

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        publicKey,
        publicKeyId: keyId,
        keyUpdatedAt: new Date(),
      },
      select: {
        id: true,
        username: true,
        publicKey: true,
        publicKeyId: true,
        keyUpdatedAt: true,
      },
    });

    // Log the key registration for audit
    await prisma.auditLog.create({
      data: {
        userId: req.userId,
        action: EncryptionAuditEvents.KEY_REGISTERED,
        resource: 'user',
        resourceId: req.userId,
        details: JSON.stringify({ keyId }),
      },
    });

    res.json({
      success: true,
      keyId: user.publicKeyId,
      keyUpdatedAt: user.keyUpdatedAt,
    });
  })
);

/**
 * Get the current user's public key info.
 *
 * @route GET /api/encryption/keys/me
 */
router.get(
  '/keys/me',
  asyncHandler(async (req: AuthRequest, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        username: true,
        publicKey: true,
        publicKeyId: true,
        keyUpdatedAt: true,
      },
    });

    if (!user) {
      throw Errors.notFound('User');
    }

    res.json({
      hasKey: !!user.publicKey,
      keyId: user.publicKeyId,
      keyUpdatedAt: user.keyUpdatedAt,
    });
  })
);

/**
 * Get public keys for specified users.
 * Used for encrypting messages to multiple recipients.
 *
 * @route POST /api/encryption/keys/batch
 * @body userIds - Array of user IDs to fetch keys for.
 */
const batchKeysSchema = z.object({
  userIds: z.array(z.string()).min(1).max(100),
});

router.post(
  '/keys/batch',
  validate(batchKeysSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { userIds } = req.body;

    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        username: true,
        publicKey: true,
        publicKeyId: true,
      },
    });

    const keys: PublicKeyInfo[] = users
      .filter((u) => u.publicKey && u.publicKeyId)
      .map((u) => ({
        userId: u.id,
        username: u.username,
        publicKey: u.publicKey!,
        keyId: u.publicKeyId!,
      }));

    const missingKeys = userIds.filter(
      (id) => !keys.find((k) => k.userId === id)
    );

    res.json({
      keys,
      missingKeys,
    });
  })
);

/**
 * Get public keys for all members of a channel.
 *
 * @route GET /api/encryption/channel/:channelId/keys
 */
router.get(
  '/channel/:channelId/keys',
  asyncHandler(async (req: AuthRequest, res) => {
    const { channelId } = req.params;

    // Verify user has access to channel
    const channel = await prisma.channel.findFirst({
      where: {
        id: channelId,
        OR: [
          { isPrivate: false },
          { members: { some: { userId: req.userId } } },
        ],
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                publicKey: true,
                publicKeyId: true,
              },
            },
          },
        },
        workspace: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    publicKey: true,
                    publicKeyId: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!channel) {
      throw Errors.notFound('Channel');
    }

    // For public channels, use workspace members. For private, use channel members.
    const members = channel.isPrivate
      ? channel.members.map((m) => m.user)
      : channel.workspace.members.map((m) => m.user);

    const keys: PublicKeyInfo[] = members
      .filter((u) => u.publicKey && u.publicKeyId)
      .map((u) => ({
        userId: u.id,
        username: u.username,
        publicKey: u.publicKey!,
        keyId: u.publicKeyId!,
      }));

    const encryptionStatus = checkEncryptionReadiness(
      members.map((m) => ({
        userId: m.id,
        username: m.username,
        publicKey: m.publicKey,
      }))
    );

    res.json({
      channelId,
      isEncrypted: channel.isEncrypted,
      keys,
      encryptionStatus,
    });
  })
);

/**
 * Enable or disable E2E encryption for a channel.
 * Only workspace owners or admins can toggle this.
 *
 * @route PATCH /api/encryption/channel/:channelId
 */
const toggleEncryptionSchema = z.object({
  enabled: z.boolean(),
});

router.patch(
  '/channel/:channelId',
  validate(toggleEncryptionSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { channelId } = req.params;
    const { enabled } = req.body;

    // Verify channel exists and user is admin/owner
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        workspace: {
          include: {
            members: {
              where: { userId: req.userId },
              include: { role: true },
            },
          },
        },
      },
    });

    if (!channel) {
      throw Errors.notFound('Channel');
    }

    const isOwner = channel.workspace.ownerId === req.userId;
    const membership = channel.workspace.members[0];
    const isAdmin = membership?.role?.name === 'admin' || membership?.roleName === 'admin';

    if (!isOwner && !isAdmin) {
      throw Errors.forbidden('Only workspace owners and admins can toggle encryption');
    }

    // If enabling, check all members have keys
    if (enabled) {
      const channelMembers = await prisma.channelMember.findMany({
        where: { channelId },
        include: {
          user: {
            select: { id: true, username: true, publicKey: true },
          },
        },
      });

      const workspaceMembers = await prisma.workspaceMember.findMany({
        where: { workspaceId: channel.workspaceId },
        include: {
          user: {
            select: { id: true, username: true, publicKey: true },
          },
        },
      });

      const members = channel.isPrivate
        ? channelMembers.map((m) => m.user)
        : workspaceMembers.map((m) => m.user);

      const status = checkEncryptionReadiness(
        members.map((m) => ({
          userId: m.id,
          username: m.username,
          publicKey: m.publicKey,
        }))
      );

      if (!status.allMembersHaveKeys) {
        throw Errors.badRequest(
          `Cannot enable encryption. These members have not registered keys: ${status.membersWithoutKeys.join(', ')}`
        );
      }
    }

    const updated = await prisma.channel.update({
      where: { id: channelId },
      data: { isEncrypted: enabled },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.userId,
        action: enabled
          ? EncryptionAuditEvents.CHANNEL_ENCRYPTION_ENABLED
          : EncryptionAuditEvents.CHANNEL_ENCRYPTION_DISABLED,
        resource: 'channel',
        resourceId: channelId,
      },
    });

    res.json({
      channelId: updated.id,
      isEncrypted: updated.isEncrypted,
    });
  })
);

/**
 * Get encryption status for a conversation (DM).
 *
 * @route GET /api/encryption/conversation/:conversationId/status
 */
router.get(
  '/conversation/:conversationId/status',
  asyncHandler(async (req: AuthRequest, res) => {
    const { conversationId } = req.params;

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        members: { some: { userId: req.userId } },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                publicKey: true,
                publicKeyId: true,
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      throw Errors.notFound('Conversation');
    }

    const members = conversation.members.map((m) => m.user);

    const keys: PublicKeyInfo[] = members
      .filter((u) => u.publicKey && u.publicKeyId)
      .map((u) => ({
        userId: u.id,
        username: u.username,
        publicKey: u.publicKey!,
        keyId: u.publicKeyId!,
      }));

    const encryptionStatus = checkEncryptionReadiness(
      members.map((m) => ({
        userId: m.id,
        username: m.username,
        publicKey: m.publicKey,
      }))
    );

    res.json({
      conversationId,
      keys,
      encryptionStatus,
    });
  })
);

export { router as encryptionRouter };
