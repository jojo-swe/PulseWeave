import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@pulseweave/database';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler, Errors } from '../middleware/error-handler';
import { validate } from '../middleware/validate';

const router = Router();

// Schemas
const startConversationSchema = z.object({
  workspaceId: z.string(),
  userId: z.string(),
});

const sendMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});

const createGroupSchema = z.object({
  workspaceId: z.string(),
  name: z.string().min(1).max(100).optional(),
  memberIds: z.array(z.string()).min(2).max(8),
});

/**
 * Get all conversations for current user in a workspace.
 */
router.get('/workspace/:workspaceId', asyncHandler(async (req: AuthRequest, res) => {
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
}));

/**
 * Get or create a 1:1 conversation.
 */
router.post('/start', validate(startConversationSchema), asyncHandler(async (req: AuthRequest, res) => {
  const { workspaceId, userId } = req.body;

  // Check if conversation already exists
  const existing = await prisma.conversation.findFirst({
    where: {
      workspaceId,
      isGroup: false,
      AND: [
        { members: { some: { userId: req.userId } } },
        { members: { some: { userId } } },
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
      workspaceId,
      isGroup: false,
      members: {
        create: [
          { userId: req.userId! },
          { userId },
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
}));

/**
 * Get messages for a conversation.
 */
router.get('/:id/messages', asyncHandler(async (req: AuthRequest, res) => {
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
    throw Errors.forbidden('Not a member of this conversation');
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
}));

/**
 * Send a direct message.
 */
router.post('/:id/messages', validate(sendMessageSchema), asyncHandler(async (req: AuthRequest, res) => {
  const { content } = req.body;

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
    throw Errors.forbidden('Not a member of this conversation');
  }

  const message = await prisma.directMessage.create({
    data: {
      content,
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
}));

/**
 * Create a group DM.
 */
router.post('/group', validate(createGroupSchema), asyncHandler(async (req: AuthRequest, res) => {
  const { workspaceId, name, memberIds } = req.body;

  // Ensure current user is included
  const allMemberIds = [...new Set([req.userId!, ...memberIds])];

  const conversation = await prisma.conversation.create({
    data: {
      workspaceId,
      isGroup: true,
      name,
      members: {
        create: allMemberIds.map((userId: string) => ({ userId })),
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
}));

export { router as dmRouter };
