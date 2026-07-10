import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@pulseweave/database';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler, Errors } from '../middleware/error-handler';
import { validate } from '../middleware/validate';

const router = Router();

// Schemas
const createChannelSchema = z.object({
  workspaceId: z.string(),
  name: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().max(200).optional(),
  isPrivate: z.boolean().default(false),
});

const updateChannelSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(200).optional(),
  isPrivate: z.boolean().optional(),
});

/**
 * Get channel by ID.
 */
router.get('/:id', asyncHandler(async (req: AuthRequest, res) => {
  const channel = await prisma.channel.findUnique({
    where: { id: req.params.id! },
    include: {
      workspace: true,
      members: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              status: true,
            },
          },
        },
      },
      _count: {
        select: { messages: true },
      },
    },
  });

  if (!channel) {
    throw Errors.notFound('Channel');
  }

  // SECURITY: Verify user is a member of the workspace
  const workspaceMembership = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId: req.userId!,
        workspaceId: channel.workspaceId,
      },
    },
  });

  if (!workspaceMembership) {
    throw Errors.forbidden('Not a member of this workspace');
  }

  // SECURITY: For private channels, verify channel membership
  if (channel.isPrivate) {
    const channelMembership = await prisma.channelMember.findUnique({
      where: {
        userId_channelId: {
          userId: req.userId!,
          channelId: channel.id,
        },
      },
    });

    if (!channelMembership) {
      throw Errors.forbidden('Not a member of this private channel');
    }
  }

  // Remove workspace details from response (don't leak workspace info)
  const { workspace: _workspace, ...channelData } = channel;
  res.json(channelData);
}));

/**
 * Create a new channel.
 */
router.post('/', validate(createChannelSchema), asyncHandler(async (req: AuthRequest, res) => {
  const { workspaceId, name, description, isPrivate } = req.body;

  // Verify user is member of workspace
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId: req.userId!,
        workspaceId,
      },
    },
  });

  if (!membership) {
    throw Errors.forbidden('Not a member of this workspace');
  }

  const channel = await prisma.channel.create({
    data: {
      name,
      description,
      workspaceId,
      isPrivate,
      createdById: req.userId!,
      members: {
        create: {
          userId: req.userId!,
        },
      },
    },
  });

  res.status(201).json(channel);
}));

/**
 * Update a channel.
 */
router.patch('/:id', validate(updateChannelSchema), asyncHandler(async (req: AuthRequest, res) => {
  const { name, description, isPrivate } = req.body;

  // Verify user is channel creator or workspace owner
  const channel = await prisma.channel.findUnique({
    where: { id: req.params.id! },
    include: { workspace: true },
  });

  if (!channel) {
    throw Errors.notFound('Channel');
  }

  if (channel.createdById !== req.userId && channel.workspace.ownerId !== req.userId) {
    throw Errors.forbidden('Not authorized to update this channel');
  }

  const updated = await prisma.channel.update({
    where: { id: req.params.id! },
    data: {
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(isPrivate !== undefined && { isPrivate }),
    },
  });

  res.json(updated);
}));

/**
 * Delete a channel.
 */
router.delete('/:id', asyncHandler(async (req: AuthRequest, res) => {
  // Verify user is channel creator or workspace owner
  const channel = await prisma.channel.findUnique({
    where: { id: req.params.id! },
    include: { workspace: true },
  });

  if (!channel) {
    throw Errors.notFound('Channel');
  }

  if (channel.createdById !== req.userId && channel.workspace.ownerId !== req.userId) {
    throw Errors.forbidden('Not authorized to delete this channel');
  }

  await prisma.channel.delete({
    where: { id: req.params.id! },
  });

  res.json({ success: true });
}));

/**
 * Get channel members.
 */
router.get('/:id/members', asyncHandler(async (req: AuthRequest, res) => {
  const channel = await prisma.channel.findUnique({
    where: { id: req.params.id! },
  });

  if (!channel) {
    throw Errors.notFound('Channel');
  }

  // SECURITY: Verify user is a member of the workspace
  const workspaceMembership = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId: req.userId!,
        workspaceId: channel.workspaceId,
      },
    },
  });

  if (!workspaceMembership) {
    throw Errors.forbidden('Not a member of this workspace');
  }

  // For private channels, verify channel membership
  if (channel.isPrivate) {
    const channelMembership = await prisma.channelMember.findUnique({
      where: {
        userId_channelId: {
          userId: req.userId!,
          channelId: channel.id,
        },
      },
    });

    if (!channelMembership) {
      throw Errors.forbidden('Not a member of this private channel');
    }
  }

  // Get channel members with user details
  const members = await prisma.channelMember.findMany({
    where: { channelId: req.params.id! },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          status: true,
          statusMessage: true,
        },
      },
    },
  });

  // Get workspace membership to include roles
  const workspaceMembers = await prisma.workspaceMember.findMany({
    where: {
      workspaceId: channel.workspaceId,
      userId: { in: members.map(m => m.userId) },
    },
    include: {
      role: true,
    },
  });

  const roleMap = new Map(workspaceMembers.map(wm => [wm.userId, wm.role?.name || 'member']));

  const formattedMembers = members.map(m => ({
    id: m.user.id,
    username: m.user.username,
    displayName: m.user.displayName,
    avatarUrl: m.user.avatarUrl,
    status: m.user.status,
    statusMessage: m.user.statusMessage,
    role: roleMap.get(m.userId) || 'member',
    joinedAt: m.joinedAt,
  }));

  res.json({ members: formattedMembers });
}));

/**
 * Join a channel.
 */
router.post('/:id/join', asyncHandler(async (req: AuthRequest, res) => {
  const channel = await prisma.channel.findUnique({
    where: { id: req.params.id! },
  });

  if (!channel) {
    throw Errors.notFound('Channel');
  }

  // SECURITY: Verify user is a member of the workspace first
  const workspaceMembership = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId: req.userId!,
        workspaceId: channel.workspaceId,
      },
    },
  });

  if (!workspaceMembership) {
    throw Errors.forbidden('Not a member of this workspace');
  }

  if (channel.isPrivate) {
    throw Errors.forbidden('Cannot join private channel');
  }

  await prisma.channelMember.upsert({
    where: {
      userId_channelId: {
        userId: req.userId!,
        channelId: req.params.id!,
      },
    },
    create: {
      userId: req.userId!,
      channelId: req.params.id!,
    },
    update: {},
  });

  res.json({ success: true });
}));

/**
 * Leave a channel.
 */
router.post('/:id/leave', asyncHandler(async (req: AuthRequest, res) => {
  const channel = await prisma.channel.findUnique({
    where: { id: req.params.id! },
    include: { workspace: true },
  });

  if (!channel) {
    throw Errors.notFound('Channel');
  }

  // Check if user is a member of the channel
  const membership = await prisma.channelMember.findUnique({
    where: {
      userId_channelId: {
        userId: req.userId!,
        channelId: req.params.id!,
      },
    },
  });

  if (!membership) {
    throw Errors.notFound('Channel membership');
  }

  // Cannot leave the default "general" channel
  if (channel.name === 'general') {
    throw Errors.forbidden('Cannot leave the general channel');
  }

  // Remove channel membership
  await prisma.channelMember.delete({
    where: {
      userId_channelId: {
        userId: req.userId!,
        channelId: req.params.id!,
      },
    },
  });

  res.json({ success: true, message: 'You have left the channel' });
}));

export { router as channelRouter };
