import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@pulseweave/database';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Get channel by ID
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const channel = await prisma.channel.findUnique({
      where: { id: req.params.id },
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
      return res.status(404).json({ error: 'Channel not found' });
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
      return res.status(403).json({ error: 'Not a member of this workspace' });
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
        return res.status(403).json({ error: 'Not a member of this private channel' });
      }
    }

    // Remove workspace details from response (don't leak workspace info)
    const { workspace, ...channelData } = channel;
    res.json(channelData);
  } catch (error) {
    console.error('Get channel error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create channel
router.post('/', async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      workspaceId: z.string(),
      name: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
      description: z.string().max(200).optional(),
      isPrivate: z.boolean().default(false),
    });

    const data = schema.parse(req.body);

    // Verify user is member of workspace
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.userId!,
          workspaceId: data.workspaceId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }

    const channel = await prisma.channel.create({
      data: {
        name: data.name,
        description: data.description,
        workspaceId: data.workspaceId,
        isPrivate: data.isPrivate,
        createdById: req.userId!,
        members: {
          create: {
            userId: req.userId!,
          },
        },
      },
    });

    res.status(201).json(channel);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Create channel error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update channel
router.patch('/:id', async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/).optional(),
      description: z.string().max(200).optional(),
      isPrivate: z.boolean().optional(),
    });

    const data = schema.parse(req.body);

    // Verify user is channel creator or workspace owner
    const channel = await prisma.channel.findUnique({
      where: { id: req.params.id },
      include: { workspace: true },
    });

    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    if (channel.createdById !== req.userId && channel.workspace.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to update this channel' });
    }

    const updated = await prisma.channel.update({
      where: { id: req.params.id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.isPrivate !== undefined && { isPrivate: data.isPrivate }),
      },
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Update channel error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete channel
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    // Verify user is channel creator or workspace owner
    const channel = await prisma.channel.findUnique({
      where: { id: req.params.id },
      include: { workspace: true },
    });

    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    if (channel.createdById !== req.userId && channel.workspace.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to delete this channel' });
    }

    await prisma.channel.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete channel error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Join channel
router.post('/:id/join', async (req: AuthRequest, res) => {
  try {
    const channel = await prisma.channel.findUnique({
      where: { id: req.params.id },
    });

    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
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
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }

    if (channel.isPrivate) {
      return res.status(403).json({ error: 'Cannot join private channel' });
    }

    await prisma.channelMember.upsert({
      where: {
        userId_channelId: {
          userId: req.userId!,
          channelId: req.params.id,
        },
      },
      create: {
        userId: req.userId!,
        channelId: req.params.id,
      },
      update: {},
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Join channel error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as channelRouter };
