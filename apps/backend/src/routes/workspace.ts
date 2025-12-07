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
      id: req.params.id,
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

export { router as workspaceRouter };
