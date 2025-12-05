import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@chatterbox/database';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Get user's workspaces
router.get('/', async (req: AuthRequest, res) => {
  try {
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
      role: m.role,
      memberCount: m.workspace._count.members,
      channelCount: m.workspace._count.channels,
    }));

    res.json(workspaces);
  } catch (error) {
    console.error('Get workspaces error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get workspace by ID
router.get('/:id', async (req: AuthRequest, res) => {
  try {
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
      return res.status(404).json({ error: 'Workspace not found' });
    }

    res.json(workspace);
  } catch (error) {
    console.error('Get workspace error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create workspace
router.post('/', async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(50),
      slug: z.string().min(1).max(30).regex(/^[a-z0-9-]+$/),
    });

    const data = schema.parse(req.body);

    const workspace = await prisma.workspace.create({
      data: {
        name: data.name,
        slug: data.slug,
        ownerId: req.userId!,
        members: {
          create: {
            userId: req.userId!,
            role: 'owner',
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
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Create workspace error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as workspaceRouter };
