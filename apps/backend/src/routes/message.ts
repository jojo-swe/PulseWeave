import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@chatterbox/database';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Get messages for a channel
router.get('/channel/:channelId', async (req: AuthRequest, res) => {
  try {
    const { cursor, limit = '50' } = req.query;
    const take = Math.min(parseInt(limit as string), 100);

    const messages = await prisma.message.findMany({
      where: {
        channelId: req.params.channelId,
        parentId: null, // Only top-level messages
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        reactions: {
          include: {
            user: {
              select: { id: true, username: true },
            },
          },
        },
        _count: {
          select: { replies: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take,
      ...(cursor && {
        cursor: { id: cursor as string },
        skip: 1,
      }),
    });

    res.json({
      messages: messages.reverse(),
      nextCursor: messages.length === take ? messages[0]?.id : null,
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get thread replies
router.get('/:id/replies', async (req: AuthRequest, res) => {
  try {
    const replies = await prisma.message.findMany({
      where: { parentId: req.params.id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        reactions: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json(replies);
  } catch (error) {
    console.error('Get replies error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create message
router.post('/', async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      channelId: z.string(),
      content: z.string().min(1).max(4000),
      parentId: z.string().optional(),
    });

    const data = schema.parse(req.body);

    const message = await prisma.message.create({
      data: {
        content: data.content,
        channelId: data.channelId,
        userId: req.userId!,
        parentId: data.parentId,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    res.status(201).json(message);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Create message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update message
router.patch('/:id', async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      content: z.string().min(1).max(4000),
    });

    const data = schema.parse(req.body);

    const message = await prisma.message.findUnique({
      where: { id: req.params.id },
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.userId !== req.userId) {
      return res.status(403).json({ error: 'Cannot edit others messages' });
    }

    const updated = await prisma.message.update({
      where: { id: req.params.id },
      data: {
        content: data.content,
        isEdited: true,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Update message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete message
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const message = await prisma.message.findUnique({
      where: { id: req.params.id },
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.userId !== req.userId) {
      return res.status(403).json({ error: 'Cannot delete others messages' });
    }

    await prisma.message.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add reaction
router.post('/:id/reactions', async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      emoji: z.string().min(1).max(10),
    });

    const data = schema.parse(req.body);

    const reaction = await prisma.reaction.upsert({
      where: {
        messageId_userId_emoji: {
          messageId: req.params.id,
          userId: req.userId!,
          emoji: data.emoji,
        },
      },
      create: {
        messageId: req.params.id,
        userId: req.userId!,
        emoji: data.emoji,
      },
      update: {},
    });

    res.json(reaction);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Add reaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove reaction
router.delete('/:id/reactions/:emoji', async (req: AuthRequest, res) => {
  try {
    await prisma.reaction.delete({
      where: {
        messageId_userId_emoji: {
          messageId: req.params.id,
          userId: req.userId!,
          emoji: req.params.emoji,
        },
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Remove reaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Pin message
router.post('/:id/pin', async (req: AuthRequest, res) => {
  try {
    const message = await prisma.message.update({
      where: { id: req.params.id },
      data: {
        isPinned: true,
        pinnedAt: new Date(),
        pinnedById: req.userId,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    res.json(message);
  } catch (error) {
    console.error('Pin message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Unpin message
router.delete('/:id/pin', async (req: AuthRequest, res) => {
  try {
    const message = await prisma.message.update({
      where: { id: req.params.id },
      data: {
        isPinned: false,
        pinnedAt: null,
        pinnedById: null,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    res.json(message);
  } catch (error) {
    console.error('Unpin message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Global search across workspace
router.get('/search', async (req: AuthRequest, res) => {
  try {
    const { q, workspaceId, limit = '20' } = req.query;
    
    if (!q || !workspaceId) {
      return res.status(400).json({ error: 'Query and workspaceId required' });
    }

    const messages = await prisma.message.findMany({
      where: {
        channel: {
          workspaceId: workspaceId as string,
        },
        content: {
          contains: q as string,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        channel: {
          select: {
            id: true,
            name: true,
            isPrivate: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit as string), 50),
    });

    res.json(messages);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get pinned messages for channel
router.get('/channel/:channelId/pinned', async (req: AuthRequest, res) => {
  try {
    const messages = await prisma.message.findMany({
      where: {
        channelId: req.params.channelId,
        isPinned: true,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { pinnedAt: 'desc' },
    });

    res.json(messages);
  } catch (error) {
    console.error('Get pinned messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as messageRouter };
