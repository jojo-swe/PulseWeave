import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@pulseweave/database';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Get all conversations for current user in a workspace
router.get('/workspace/:workspaceId', async (req: AuthRequest, res) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        workspaceId: req.params.workspaceId,
        members: {
          some: {
            userId: req.userId,
          },
        },
      },
      include: {
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
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Format conversations for frontend
    const formatted = conversations.map((conv) => ({
      id: conv.id,
      isGroup: conv.isGroup,
      name: conv.name,
      members: conv.members.map((m) => m.user),
      lastMessage: conv.messages[0] || null,
      updatedAt: conv.updatedAt,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get or create a 1:1 conversation
router.post('/start', async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      workspaceId: z.string(),
      userId: z.string(), // The other user
    });

    const data = schema.parse(req.body);

    // Check if conversation already exists
    const existing = await prisma.conversation.findFirst({
      where: {
        workspaceId: data.workspaceId,
        isGroup: false,
        AND: [
          { members: { some: { userId: req.userId } } },
          { members: { some: { userId: data.userId } } },
        ],
      },
      include: {
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

    if (existing) {
      return res.json({
        id: existing.id,
        isGroup: existing.isGroup,
        name: existing.name,
        members: existing.members.map((m) => m.user),
      });
    }

    // Create new conversation
    const conversation = await prisma.conversation.create({
      data: {
        workspaceId: data.workspaceId,
        isGroup: false,
        members: {
          create: [
            { userId: req.userId! },
            { userId: data.userId },
          ],
        },
      },
      include: {
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

    res.status(201).json({
      id: conversation.id,
      isGroup: conversation.isGroup,
      name: conversation.name,
      members: conversation.members.map((m) => m.user),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Start conversation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get messages for a conversation
router.get('/:id/messages', async (req: AuthRequest, res) => {
  try {
    const { cursor, limit = '50' } = req.query;
    const take = Math.min(parseInt(limit as string), 100);

    // Verify user is member
    const membership = await prisma.conversationMember.findUnique({
      where: {
        userId_conversationId: {
          userId: req.userId!,
          conversationId: req.params.id,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this conversation' });
    }

    const messages = await prisma.directMessage.findMany({
      where: { conversationId: req.params.id },
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
      orderBy: { createdAt: 'desc' },
      take,
      ...(cursor && {
        cursor: { id: cursor as string },
        skip: 1,
      }),
    });

    // Update last read
    await prisma.conversationMember.update({
      where: {
        userId_conversationId: {
          userId: req.userId!,
          conversationId: req.params.id,
        },
      },
      data: { lastReadAt: new Date() },
    });

    res.json({
      messages: messages.reverse(),
      nextCursor: messages.length === take ? messages[0]?.id : null,
    });
  } catch (error) {
    console.error('Get DM messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send a direct message
router.post('/:id/messages', async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      content: z.string().min(1).max(4000),
    });

    const data = schema.parse(req.body);

    // Verify user is member
    const membership = await prisma.conversationMember.findUnique({
      where: {
        userId_conversationId: {
          userId: req.userId!,
          conversationId: req.params.id,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this conversation' });
    }

    const message = await prisma.directMessage.create({
      data: {
        content: data.content,
        conversationId: req.params.id,
        userId: req.userId!,
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

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id: req.params.id },
      data: { updatedAt: new Date() },
    });

    // Emit via socket
    const io = req.app.get('io');
    if (io) {
      io.to(`dm:${req.params.id}`).emit('dm:message', message);
    }

    res.status(201).json(message);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Send DM error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create group DM
router.post('/group', async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      workspaceId: z.string(),
      name: z.string().min(1).max(100).optional(),
      memberIds: z.array(z.string()).min(2).max(8),
    });

    const data = schema.parse(req.body);

    // Ensure current user is included
    const allMemberIds = [...new Set([req.userId!, ...data.memberIds])];

    const conversation = await prisma.conversation.create({
      data: {
        workspaceId: data.workspaceId,
        isGroup: true,
        name: data.name,
        members: {
          create: allMemberIds.map((userId) => ({ userId })),
        },
      },
      include: {
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

    res.status(201).json({
      id: conversation.id,
      isGroup: conversation.isGroup,
      name: conversation.name,
      members: conversation.members.map((m) => m.user),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Create group DM error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as dmRouter };
