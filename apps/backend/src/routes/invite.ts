import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '@pulseweave/database';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler, Errors } from '../middleware/error-handler';
import { validate } from '../middleware/validate';
import { logger } from '../utils/logger';

const router = Router();

const INVITE_CODE_LENGTH = 8;

function generateInviteCode(): string {
  return crypto.randomBytes(INVITE_CODE_LENGTH).toString('base64url').slice(0, INVITE_CODE_LENGTH);
}

const createInviteSchema = z.object({
  workspaceId: z.string().min(1),
  maxUses: z.number().int().positive().optional(),
  expiresInHours: z.number().positive().optional(),
});

/**
 * Create an invite link for a workspace.
 * Only workspace owner or admin can create invites.
 */
router.post('/', validate(createInviteSchema), asyncHandler(async (req: AuthRequest, res) => {
  const { workspaceId, maxUses, expiresInHours } = req.body;

  if (!req.userId) {
    throw Errors.unauthorized();
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId: req.userId,
        workspaceId,
      },
    },
  });

  if (!membership || !['owner', 'admin'].includes(membership.roleName)) {
    throw Errors.forbidden('Only workspace owners and admins can create invite links');
  }

  const expiresAt = expiresInHours
    ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
    : null;

  const invite = await prisma.inviteLink.create({
    data: {
      code: generateInviteCode(),
      workspaceId,
      createdById: req.userId,
      maxUses: maxUses ?? null,
      expiresAt,
    },
    include: {
      createdBy: {
        select: { id: true, username: true, displayName: true },
      },
    },
  });

  logger.info('Invite link created', { workspaceId, inviteId: invite.id, userId: req.userId });

  res.status(201).json(invite);
}));

/**
 * List invite links for a workspace.
 */
router.get('/workspace/:workspaceId', asyncHandler(async (req: AuthRequest, res) => {
  const { workspaceId } = req.params;

  if (!req.userId) {
    throw Errors.unauthorized();
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId: req.userId,
        workspaceId,
      },
    },
  });

  if (!membership || !['owner', 'admin'].includes(membership.roleName)) {
    throw Errors.forbidden('Only workspace owners and admins can view invite links');
  }

  const invites = await prisma.inviteLink.findMany({
    where: { workspaceId },
    include: {
      createdBy: {
        select: { id: true, username: true, displayName: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(invites);
}));

/**
 * Revoke an invite link.
 */
router.delete('/:inviteId', asyncHandler(async (req: AuthRequest, res) => {
  const { inviteId } = req.params;

  if (!req.userId) {
    throw Errors.unauthorized();
  }

  const invite = await prisma.inviteLink.findUnique({
    where: { id: inviteId },
  });

  if (!invite) {
    throw Errors.notFound('Invite link');
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId: req.userId,
        workspaceId: invite.workspaceId,
      },
    },
  });

  if (!membership || !['owner', 'admin'].includes(membership.roleName)) {
    throw Errors.forbidden('Only workspace owners and admins can revoke invite links');
  }

  await prisma.inviteLink.update({
    where: { id: inviteId },
    data: { isRevoked: true },
  });

  logger.info('Invite link revoked', { inviteId, userId: req.userId });

  res.json({ success: true });
}));

/**
 * Validate and use an invite code to join a workspace.
 */
router.post('/use/:code', asyncHandler(async (req: AuthRequest, res) => {
  const { code } = req.params;

  if (!req.userId) {
    throw Errors.unauthorized();
  }

  const invite = await prisma.inviteLink.findUnique({
    where: { code },
    include: {
      workspace: {
        select: { id: true, name: true, slug: true, iconUrl: true },
      },
    },
  });

  if (!invite) {
    throw Errors.notFound('Invite link');
  }

  if (invite.isRevoked) {
    throw Errors.badRequest('This invite link has been revoked');
  }

  if (invite.expiresAt && invite.expiresAt < new Date()) {
    throw Errors.badRequest('This invite link has expired');
  }

  if (invite.maxUses && invite.useCount >= invite.maxUses) {
    throw Errors.badRequest('This invite link has reached its maximum number of uses');
  }

  // Check if already a member
  const existingMembership = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId: req.userId,
        workspaceId: invite.workspaceId,
      },
    },
  });

  if (existingMembership) {
    return res.json({
      success: true,
      workspace: invite.workspace,
      alreadyMember: true,
    });
  }

  // Join workspace and increment use count in a transaction
  await prisma.$transaction([
    prisma.workspaceMember.create({
      data: {
        userId: req.userId,
        workspaceId: invite.workspaceId,
        roleName: 'member',
        invitedBy: invite.createdById,
        invitedAt: new Date(),
      },
    }),
    prisma.inviteLink.update({
      where: { id: invite.id },
      data: { useCount: { increment: 1 } },
    }),
  ]);

  // Add user to general channel
  const generalChannel = await prisma.channel.findFirst({
    where: {
      workspaceId: invite.workspaceId,
      name: 'general',
    },
  });

  if (generalChannel) {
    await prisma.channelMember.create({
      data: {
        userId: req.userId,
        channelId: generalChannel.id,
      },
    }).catch(() => {
      // Ignore if already a member of general channel
    });
  }

  logger.info('User joined via invite', {
    userId: req.userId,
    workspaceId: invite.workspaceId,
    inviteId: invite.id,
  });

  res.json({
    success: true,
    workspace: invite.workspace,
    alreadyMember: false,
  });
}));

/**
 * Get invite info by code (public, no auth required for display).
 */
router.get('/info/:code', asyncHandler(async (req: AuthRequest, res) => {
  const { code } = req.params;

  const invite = await prisma.inviteLink.findUnique({
    where: { code },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true,
          iconUrl: true,
          _count: { select: { members: true } },
        },
      },
    },
  });

  if (!invite || invite.isRevoked) {
    throw Errors.notFound('Invite link');
  }

  if (invite.expiresAt && invite.expiresAt < new Date()) {
    throw Errors.badRequest('This invite link has expired');
  }

  if (invite.maxUses && invite.useCount >= invite.maxUses) {
    throw Errors.badRequest('This invite link has reached its maximum number of uses');
  }

  let isMember = false;
  if (req.userId) {
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.userId,
          workspaceId: invite.workspaceId,
        },
      },
    });
    isMember = !!membership;
  }

  res.json({
    code: invite.code,
    workspace: {
      ...invite.workspace,
      memberCount: invite.workspace._count.members,
    },
    isMember,
  });
}));

export { router as inviteRouter };
