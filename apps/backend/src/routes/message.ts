import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@pulseweave/database';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler, Errors } from '../middleware/error-handler';
import { validate, paginationSchema, idParamsSchema } from '../middleware/validate';
import { NotificationService } from '../services/notifications';
import { sanitizeSearchQuery } from '../services/validation';
import { logger } from '../utils/logger';

const router = Router();

// Search messages
router.get('/search', asyncHandler(async (req: AuthRequest, res) => {
  const { workspaceId, q, limit = '50', cursor } = req.query;

  if (!workspaceId || typeof workspaceId !== 'string') {
    throw Errors.badRequest('Workspace ID is required');
  }

  if (!q || typeof q !== 'string' || q.length < 2) {
    return res.json({ messages: [], nextCursor: null });
  }

  const sanitizedQuery = sanitizeSearchQuery(q);
  if (sanitizedQuery.length < 2) {
    return res.json({ messages: [], nextCursor: null });
  }

  const take = Math.min(parseInt(limit as string), 100);

  // For production Postgres, replace with tsvector/tsquery or PgVector.
  // SQLite: Prisma `contains` with `mode: insensitive` is not supported,
  // but SQLite LIKE is case-insensitive for ASCII by default.
  const messages = await prisma.message.findMany({
    where: {
      workspaceId,
      content: {
        contains: sanitizedQuery,
      },
      // Access control: User must be able to see the channel
      channel: {
        workspaceId,
        OR: [
          { isPrivate: false },
          { members: { some: { userId: req.userId } } },
        ],
      },
      // Can't search encrypted content server-side
      isEncrypted: false,
      // Cursor-based pagination
      ...(cursor && typeof cursor === 'string' ? { id: { lt: cursor } } : {}),
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
    take: take + 1, // Fetch one extra to determine if there's more
  });

  const hasMore = messages.length > take;
  const results = hasMore ? messages.slice(0, take) : messages;
  const nextCursor = hasMore ? results[results.length - 1].id : null;

  res.json({ messages: results, nextCursor });
}));

// Get messages for a channel
router.get('/channel/:channelId', asyncHandler(async (req: AuthRequest, res) => {
  const { cursor, limit = '50' } = req.query;
  const take = Math.min(parseInt(limit as string), 100);

  // Verify channel exists and user has access
  const channel = await prisma.channel.findFirst({
    where: {
      id: req.params.channelId,
      OR: [
        { isPrivate: false },
        { members: { some: { userId: req.userId } } },
      ],
    },
  });

  if (!channel) {
    throw Errors.notFound('Channel');
  }

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
}));

// Get thread replies
router.get('/:id/replies', asyncHandler(async (req: AuthRequest, res) => {
  const parentMessage = await prisma.message.findUnique({
    where: { id: req.params.id },
  });

  if (!parentMessage) {
    throw Errors.notFound('Message');
  }

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
}));

// Create message schema
const createMessageSchema = z.object({
  channelId: z.string().min(1),
  content: z.string().min(1, 'Message cannot be empty').max(4000, 'Message too long'),
  parentId: z.string().min(1).optional(),
  // E2E encryption fields (optional)
  isEncrypted: z.boolean().optional().default(false),
  encryptionKey: z.string().optional(), // Wrapped symmetric key
  keyId: z.string().optional(), // Sender's key ID
  iv: z.string().optional(), // Initialization vector
}).refine(
  (data) => {
    // If encrypted, all encryption fields are required
    if (data.isEncrypted) {
      return data.encryptionKey && data.keyId && data.iv;
    }
    return true;
  },
  { message: 'Encrypted messages require encryptionKey, keyId, and iv' }
);

// Create message
router.post('/', validate(createMessageSchema), asyncHandler(async (req: AuthRequest, res) => {
  const { channelId, content, parentId, isEncrypted, encryptionKey, keyId, iv } = req.body;

  // Verify user has access to channel
  const channel = await prisma.channel.findFirst({
    where: {
      id: channelId,
      OR: [
        { isPrivate: false },
        { members: { some: { userId: req.userId } } },
      ],
    },
  });

  if (!channel) {
    throw Errors.forbidden('You do not have access to this channel');
  }

  // If replying, verify parent message exists
  if (parentId) {
    const parentMessage = await prisma.message.findUnique({
      where: { id: parentId },
    });
    if (!parentMessage) {
      throw Errors.notFound('Parent message');
    }
  }

  const message = await prisma.message.create({
    data: {
      content,
      channelId,
      workspaceId: channel.workspaceId,
      userId: req.userId!,
      parentId,
      // E2E encryption fields
      isEncrypted: isEncrypted ?? false,
      encryptionKey: isEncrypted ? encryptionKey : null,
      keyId: isEncrypted ? keyId : null,
      iv: isEncrypted ? iv : null,
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



  // Trigger push notifications
  // Using setImmediate to not block the response
  setImmediate(() => {
    NotificationService.notifyNewMessage(message, channel).catch(err => 
      logger.error('Failed to send notifications:', { error: String(err) })
    );
  });

  res.status(201).json(message);
}));

// Update message schema
const updateMessageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(4000, 'Message too long'),
});

// Update message
router.patch('/:id', validate(updateMessageSchema), asyncHandler(async (req: AuthRequest, res) => {
  const { content } = req.body;

  const message = await prisma.message.findUnique({
    where: { id: req.params.id },
  });

  if (!message) {
    throw Errors.notFound('Message');
  }

  if (message.userId !== req.userId) {
    throw Errors.forbidden('You can only edit your own messages');
  }

  const updated = await prisma.message.update({
    where: { id: req.params.id },
    data: {
      content,
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
}));

// Delete message
router.delete('/:id', asyncHandler(async (req: AuthRequest, res) => {
  const message = await prisma.message.findUnique({
    where: { id: req.params.id },
    include: {
      channel: {
        include: { workspace: true },
      },
    },
  });

  if (!message) {
    throw Errors.notFound('Message');
  }

  // Allow deletion by message author or workspace owner
  const isOwner = message.userId === req.userId;
  const isWorkspaceOwner = message.channel.workspace.ownerId === req.userId;

  if (!isOwner && !isWorkspaceOwner) {
    throw Errors.forbidden('You can only delete your own messages');
  }

  await prisma.message.delete({
    where: { id: req.params.id },
  });

  res.json({ success: true });
}));

// Add reaction schema
const reactionSchema = z.object({
  emoji: z.string().min(1).max(10),
});

// Add reaction
router.post('/:id/reactions', validate(reactionSchema), asyncHandler(async (req: AuthRequest, res) => {
  const { emoji } = req.body;

  // Verify message exists and user has access to channel
  const message = await prisma.message.findUnique({
    where: { id: req.params.id },
    include: { channel: true },
  });

  if (!message) {
    throw Errors.notFound('Message');
  }

  // Check channel access
  if (message.channel.isPrivate) {
    const membership = await prisma.channelMember.findUnique({
      where: {
        userId_channelId: {
          userId: req.userId!,
          channelId: message.channelId,
        },
      },
    });

    if (!membership) {
      throw Errors.forbidden('You do not have access to this channel');
    }
  }

  const reaction = await prisma.reaction.upsert({
    where: {
      messageId_userId_emoji: {
        messageId: req.params.id,
        userId: req.userId!,
        emoji,
      },
    },
    create: {
      messageId: req.params.id,
      workspaceId: message.channel.workspaceId,
      userId: req.userId!,
      emoji,
    },
    update: {},
  });

  res.json(reaction);
}));

// Remove reaction
router.delete('/:id/reactions/:emoji', asyncHandler(async (req: AuthRequest, res) => {
  // Verify message exists and user has access to channel
  const message = await prisma.message.findUnique({
    where: { id: req.params.id },
    include: { channel: true },
  });

  if (!message) {
    throw Errors.notFound('Message');
  }

  // Check channel access
  if (message.channel.isPrivate) {
    const membership = await prisma.channelMember.findUnique({
      where: {
        userId_channelId: {
          userId: req.userId!,
          channelId: message.channelId,
        },
      },
    });

    if (!membership) {
      throw Errors.forbidden('You do not have access to this channel');
    }
  }

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
}));

// Pin message
router.post('/:id/pin', asyncHandler(async (req: AuthRequest, res) => {
  // Verify message exists and user has access
  const existing = await prisma.message.findUnique({
    where: { id: req.params.id },
    include: { channel: true },
  });

  if (!existing) {
    throw Errors.notFound('Message');
  }

  // Check channel access
  if (existing.channel.isPrivate) {
    const membership = await prisma.channelMember.findUnique({
      where: {
        userId_channelId: {
          userId: req.userId!,
          channelId: existing.channelId,
        },
      },
    });

    if (!membership) {
      throw Errors.forbidden('You do not have access to this channel');
    }
  }

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
}));

// Unpin message
router.delete('/:id/pin', asyncHandler(async (req: AuthRequest, res) => {
  // Verify message exists
  const existing = await prisma.message.findUnique({
    where: { id: req.params.id },
    include: { channel: true },
  });

  if (!existing) {
    throw Errors.notFound('Message');
  }

  // Check channel access
  if (existing.channel.isPrivate) {
    const membership = await prisma.channelMember.findUnique({
      where: {
        userId_channelId: {
          userId: req.userId!,
          channelId: existing.channelId,
        },
      },
    });

    if (!membership) {
      throw Errors.forbidden('You do not have access to this channel');
    }
  }

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
}));

// Search query schema
const searchSchema = z.object({
  q: z.string().min(1, 'Search query is required'),
  workspaceId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// Global search across workspace
router.get('/search', asyncHandler(async (req: AuthRequest, res) => {
  const result = searchSchema.safeParse(req.query);
  
  if (!result.success) {
    throw Errors.badRequest('Query and workspaceId are required');
  }

  const { q, workspaceId, limit } = result.data;

  // Verify user has access to workspace
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId: req.userId!,
        workspaceId,
      },
    },
  });

  if (!membership) {
    throw Errors.forbidden('You do not have access to this workspace');
  }

  const messages = await prisma.message.findMany({
    where: {
      channel: {
        workspaceId,
        OR: [
          { isPrivate: false },
          { members: { some: { userId: req.userId } } },
        ],
      },
      content: {
        contains: q,
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
    take: limit,
  });

  res.json(messages);
}));

// Get pinned messages for channel
router.get('/channel/:channelId/pinned', asyncHandler(async (req: AuthRequest, res) => {
  // Verify channel exists and user has access
  const channel = await prisma.channel.findFirst({
    where: {
      id: req.params.channelId,
      OR: [
        { isPrivate: false },
        { members: { some: { userId: req.userId } } },
      ],
    },
  });

  if (!channel) {
    throw Errors.notFound('Channel');
  }

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
}));

export { router as messageRouter };
