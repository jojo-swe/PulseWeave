import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@pulseweave/database';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler, Errors } from '../middleware/error-handler';
import { validate } from '../middleware/validate';

const router = Router();

// Schemas
const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(50),
  slug: z.string().min(1).max(30).regex(/^[a-z0-9-]+$/),
});

/**
 * Get user's workspaces.
 */
router.get('/', asyncHandler(async (req: AuthRequest, res) => {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: req.userId },
    include: {
      workspace: {
        include: {
          _count: {
            select: { members: true, channels: true },
          },
        },
      },
    },
  });

  const workspaces = memberships.map((m) => ({
    ...m.workspace,
    role: m.roleName,
    memberCount: m.workspace._count.members,
    channelCount: m.workspace._count.channels,
  }));

  res.json(workspaces);
}));

/**
 * Get workspace by ID.
 */
router.get('/:id', asyncHandler(async (req: AuthRequest, res) => {
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: req.params.id!,
      members: { some: { userId: req.userId } },
    },
    include: {
      channels: {
        where: {
          OR: [
            { isPrivate: false },
            { members: { some: { userId: req.userId } } },
          ],
        },
        orderBy: { name: 'asc' },
      },
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
    },
  });

  if (!workspace) {
    throw Errors.notFound('Workspace');
  }

  res.json(workspace);
}));

/**
 * Create a new workspace.
 */
router.post('/', validate(createWorkspaceSchema), asyncHandler(async (req: AuthRequest, res) => {
  const { name, slug } = req.body;

  const workspace = await prisma.workspace.create({
    data: {
      name,
      slug,
      ownerId: req.userId!,
      members: {
        create: {
          userId: req.userId!,
          roleName: 'owner',
        },
      },
      channels: {
        create: {
          name: 'general',
          description: 'General discussion',
          createdById: req.userId!,
          members: {
            create: {
              userId: req.userId!,
            },
          },
        },
      },
    },
  });

  res.status(201).json(workspace);
}));

// Update workspace schema
const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  iconUrl: z.string().url().optional().nullable(),
});

/**
 * Update workspace (owner/admin only).
 */
router.patch('/:id', validate(updateWorkspaceSchema), asyncHandler(async (req: AuthRequest, res) => {
  const { id } = req.params as { id: string };
  const { name, iconUrl } = req.body;

  // Check membership and role
  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: id, userId: req.userId },
  });

  if (!membership) {
    throw Errors.notFound('Workspace');
  }

  if (!['owner', 'admin'].includes(membership.roleName)) {
    throw Errors.forbidden('Only owners and admins can update the workspace');
  }

  const updated = await prisma.workspace.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(iconUrl !== undefined && { iconUrl }),
    },
  });

  res.json(updated);
}));

/**
 * Delete workspace (owner only).
 * This is a hard delete with cascade - all data will be permanently removed.
 */
router.delete('/:id', asyncHandler(async (req: AuthRequest, res) => {
  const { id } = req.params as { id: string };

  // Verify ownership
  const workspace = await prisma.workspace.findFirst({
    where: { id, ownerId: req.userId },
  });

  if (!workspace) {
    throw Errors.forbidden('Only the workspace owner can delete it');
  }

  // Cascade delete in transaction
  await prisma.$transaction(async (tx) => {
    // Delete all messages in all channels of this workspace
    await tx.message.deleteMany({
      where: { channel: { workspaceId: id } },
    });

    // Delete all channel members
    await tx.channelMember.deleteMany({
      where: { channel: { workspaceId: id } },
    });

    // Delete all channels
    await tx.channel.deleteMany({
      where: { workspaceId: id },
    });

    // Delete all workspace members
    await tx.workspaceMember.deleteMany({
      where: { workspaceId: id },
    });

    // Delete audit logs
    await tx.auditLog.deleteMany({
      where: { workspaceId: id },
    });

    // Delete the workspace itself
    await tx.workspace.delete({
      where: { id },
    });
  });

  res.json({ success: true, message: 'Workspace deleted permanently' });
}));

/**
 * Leave workspace (for non-owners).
 */
router.post('/:id/leave', asyncHandler(async (req: AuthRequest, res) => {
  const { id } = req.params as { id: string };

  // Check membership
  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: id, userId: req.userId },
    include: { workspace: true },
  });

  if (!membership) {
    throw Errors.notFound('Workspace membership');
  }

  // Owners cannot leave - they must delete or transfer ownership
  if (membership.roleName === 'owner') {
    throw Errors.forbidden('Owners cannot leave the workspace. Transfer ownership or delete the workspace instead.');
  }

  // Remove from all channels in this workspace
  await prisma.channelMember.deleteMany({
    where: {
      userId: req.userId,
      channel: { workspaceId: id },
    },
  });

  // Remove workspace membership
  await prisma.workspaceMember.delete({
    where: { id: membership.id },
  });

  res.json({ success: true, message: 'You have left the workspace' });
}));

/**
 * Get workspace by slug (public info for join page).
 */
router.get('/join/:slug', asyncHandler(async (req: AuthRequest, res) => {
  const { slug } = req.params as { slug: string };

  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      iconUrl: true,
      _count: {
        select: { members: true },
      },
    },
  });

  if (!workspace) {
    throw Errors.notFound('Workspace');
  }

  // Check if user is already a member
  let isMember = false;
  if (req.userId) {
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.userId,
          workspaceId: workspace.id,
        },
      },
    });
    isMember = !!membership;
  }

  res.json({
    ...workspace,
    memberCount: workspace._count.members,
    isMember,
  });
}));

/**
 * Join workspace by slug.
 */
router.post('/join/:slug', asyncHandler(async (req: AuthRequest, res) => {
  const { slug } = req.params as { slug: string };

  if (!req.userId) {
    throw Errors.unauthorized();
  }

  const workspace = await prisma.workspace.findUnique({
    where: { slug },
  });

  if (!workspace) {
    throw Errors.notFound('Workspace');
  }

  // Check if already a member
  const existingMembership = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId: req.userId,
        workspaceId: workspace.id,
      },
    },
  });

  if (existingMembership) {
    return res.json({
      success: true,
      message: 'Already a member',
      workspace,
      alreadyMember: true,
    });
  }

  // Add user as member
  await prisma.workspaceMember.create({
    data: {
      userId: req.userId,
      workspaceId: workspace.id,
      roleName: 'member',
    },
  });

  // Add user to general channel
  const generalChannel = await prisma.channel.findFirst({
    where: {
      workspaceId: workspace.id,
      name: 'general',
    },
  });

  if (generalChannel) {
    await prisma.channelMember.create({
      data: {
        userId: req.userId,
        channelId: generalChannel.id,
      },
    });
  }

  res.json({
    success: true,
    message: 'Joined workspace successfully',
    workspace,
    alreadyMember: false,
  });
}));

export { router as workspaceRouter };
