import { Router, Request } from 'express';
import { z } from 'zod';
import { prisma } from '@pulseweave/database';
import { asyncHandler, Errors } from '../middleware/error-handler';
import { validate } from '../middleware/validate';
import { authenticateApiKey, hasScope } from './apikey';
import { dispatchWebhookEvent } from '../services/webhooks';

const router = Router();

/**
 * Extended request with API key data.
 */
interface ApiRequest extends Request {
  apiKey: any;
  apiScopes: string[];
  workspaceId: string;
  userId: string;
}

// ============================================================================
// External API Routes (authenticated via API key)
// ============================================================================

/**
 * Get workspace info.
 */
router.get(
  '/workspace',
  authenticateApiKey(),
  asyncHandler(async (req, res) => {
    const { workspaceId } = req as ApiRequest;

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        slug: true,
        iconUrl: true,
        createdAt: true,
        _count: {
          select: {
            members: true,
            channels: true,
          },
        },
      },
    });

    res.json(workspace);
  })
);

/**
 * List channels.
 */
router.get(
  '/channels',
  authenticateApiKey('channels:read'),
  asyncHandler(async (req, res) => {
    const { workspaceId } = req as ApiRequest;

    const channels = await prisma.channel.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        description: true,
        isPrivate: true,
        createdAt: true,
        _count: {
          select: { members: true, messages: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json({ channels });
  })
);

/**
 * Get channel by ID.
 */
router.get(
  '/channels/:channelId',
  authenticateApiKey('channels:read'),
  asyncHandler(async (req, res) => {
    const { workspaceId } = req as ApiRequest;
    const { channelId } = req.params;

    const channel = await prisma.channel.findFirst({
      where: { id: channelId, workspaceId },
      select: {
        id: true,
        name: true,
        description: true,
        isPrivate: true,
        createdAt: true,
        _count: {
          select: { members: true, messages: true },
        },
      },
    });

    if (!channel) {
      throw Errors.notFound('Channel');
    }

    res.json(channel);
  })
);

/**
 * List messages in a channel.
 */
router.get(
  '/channels/:channelId/messages',
  authenticateApiKey('messages:read'),
  asyncHandler(async (req, res) => {
    const { workspaceId } = req as ApiRequest;
    const { channelId } = req.params;
    const { limit = '50', before, after } = req.query;

    // Verify channel exists
    const channel = await prisma.channel.findFirst({
      where: { id: channelId, workspaceId },
    });

    if (!channel) {
      throw Errors.notFound('Channel');
    }

    const limitNum = Math.min(parseInt(limit as string, 10), 100);

    const where: any = { channelId };
    if (before) {
      where.createdAt = { lt: new Date(before as string) };
    } else if (after) {
      where.createdAt = { gt: new Date(after as string) };
    }

    const messages = await prisma.message.findMany({
      where,
      select: {
        id: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        isEdited: true,
        isPinned: true,
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        attachments: {
          select: {
            id: true,
            type: true,
            url: true,
            name: true,
            size: true,
            mimeType: true,
          },
        },
        reactions: {
          select: {
            emoji: true,
            userId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limitNum,
    });

    res.json({ messages: messages.reverse() });
  })
);

const sendMessageSchema = z.object({
  content: z.string().min(1).max(4000),
  attachments: z
    .array(
      z.object({
        type: z.string(),
        url: z.string().url(),
        name: z.string(),
        size: z.number().optional(),
        mimeType: z.string().optional(),
      })
    )
    .optional(),
});

/**
 * Send a message to a channel.
 */
router.post(
  '/channels/:channelId/messages',
  authenticateApiKey('messages:write'),
  validate(sendMessageSchema),
  asyncHandler(async (req, res) => {
    const { workspaceId, userId } = req as ApiRequest;
    const { channelId } = req.params;
    const { content, attachments } = req.body;

    // Verify channel exists
    const channel = await prisma.channel.findFirst({
      where: { id: channelId, workspaceId },
    });

    if (!channel) {
      throw Errors.notFound('Channel');
    }

    // Create message
    const message = await prisma.message.create({
      data: {
        content,
        channelId,
        workspaceId,
        userId,
        attachments: attachments
          ? {
              create: attachments.map((a: any) => ({
                type: a.type,
                url: a.url,
                name: a.name,
                size: a.size,
                mimeType: a.mimeType,
                workspaceId,
                uploadedById: userId,
              })),
            }
          : undefined,
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
        attachments: true,
        reactions: true,
      },
    });

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`channel:${channelId}`).emit('message:new', message);
    }

    // Dispatch webhook event
    await dispatchWebhookEvent(workspaceId, 'message.created', {
      message: {
        id: message.id,
        content: message.content,
        channelId: message.channelId,
        userId: message.userId,
        createdAt: message.createdAt,
      },
      channel: {
        id: channel.id,
        name: channel.name,
      },
      user: message.user,
    });

    res.status(201).json(message);
  })
);

/**
 * List workspace members.
 */
router.get(
  '/members',
  authenticateApiKey('members:read'),
  asyncHandler(async (req, res) => {
    const { workspaceId } = req as ApiRequest;

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: {
        id: true,
        roleName: true,
        joinedAt: true,
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
      orderBy: { joinedAt: 'asc' },
    });

    res.json({
      members: members.map((m) => ({
        memberId: m.id,
        userId: m.user.id,
        username: m.user.username,
        displayName: m.user.displayName,
        avatarUrl: m.user.avatarUrl,
        status: m.user.status,
        role: m.roleName,
        joinedAt: m.joinedAt,
      })),
    });
  })
);

/**
 * Get user by ID.
 */
router.get(
  '/users/:userId',
  authenticateApiKey('users:read'),
  asyncHandler(async (req, res) => {
    const { workspaceId } = req as ApiRequest;
    const { userId } = req.params;

    // Verify user is in workspace
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId, workspaceId },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            status: true,
            statusMessage: true,
            createdAt: true,
          },
        },
      },
    });

    if (!membership) {
      throw Errors.notFound('User');
    }

    res.json({
      ...membership.user,
      role: membership.roleName,
      joinedAt: membership.joinedAt,
    });
  })
);

export default router;
