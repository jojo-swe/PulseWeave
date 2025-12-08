import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@pulseweave/database';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler, Errors } from '../middleware/error-handler';
import { validate } from '../middleware/validate';

const router = Router();

/**
 * Schema for creating a scheduled message.
 */
const createScheduledSchema = z.object({
  content: z.string().min(1).max(4000),
  channelId: z.string(),
  scheduledAt: z.string().datetime(),
});

/**
 * Schema for updating a scheduled message.
 */
const updateScheduledSchema = z.object({
  content: z.string().min(1).max(4000).optional(),
  scheduledAt: z.string().datetime().optional(),
});

/**
 * Get all scheduled messages for the current user.
 */
router.get('/', asyncHandler(async (req: AuthRequest, res) => {
  const messages = await prisma.scheduledMessage.findMany({
    where: {
      userId: req.userId!,
      status: 'pending',
    },
    orderBy: { scheduledAt: 'asc' },
  });

  res.json(messages);
}));

/**
 * Get scheduled messages for a specific channel.
 */
router.get('/channel/:channelId', asyncHandler(async (req: AuthRequest, res) => {
  const { channelId } = req.params;

  // Verify channel access
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
    throw Errors.notFound('Channel');
  }

  const messages = await prisma.scheduledMessage.findMany({
    where: {
      channelId,
      userId: req.userId!,
      status: 'pending',
    },
    orderBy: { scheduledAt: 'asc' },
  });

  res.json(messages);
}));

/**
 * Create a scheduled message.
 */
router.post('/', validate(createScheduledSchema), asyncHandler(async (req: AuthRequest, res) => {
  const { content, channelId, scheduledAt } = req.body;

  // Verify channel access
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
    throw Errors.notFound('Channel');
  }

  const scheduledDate = new Date(scheduledAt);
  if (scheduledDate <= new Date()) {
    throw Errors.badRequest('Scheduled time must be in the future');
  }

  const message = await prisma.scheduledMessage.create({
    data: {
      content,
      channelId,
      userId: req.userId!,
      scheduledAt: scheduledDate,
    },
  });

  res.status(201).json(message);
}));

/**
 * Update a scheduled message.
 */
router.patch('/:id', validate(updateScheduledSchema), asyncHandler(async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { content, scheduledAt } = req.body;

  const message = await prisma.scheduledMessage.findUnique({
    where: { id },
  });

  if (!message) {
    throw Errors.notFound('Scheduled message');
  }

  if (message.userId !== req.userId) {
    throw Errors.forbidden('Not your scheduled message');
  }

  if (message.status !== 'pending') {
    throw Errors.badRequest('Cannot update a message that has already been sent or cancelled');
  }

  let scheduledDate: Date | undefined;
  if (scheduledAt) {
    scheduledDate = new Date(scheduledAt);
    if (scheduledDate <= new Date()) {
      throw Errors.badRequest('Scheduled time must be in the future');
    }
  }

  const updated = await prisma.scheduledMessage.update({
    where: { id },
    data: {
      ...(content !== undefined && { content }),
      ...(scheduledDate && { scheduledAt: scheduledDate }),
    },
  });

  res.json(updated);
}));

/**
 * Cancel a scheduled message.
 */
router.delete('/:id', asyncHandler(async (req: AuthRequest, res) => {
  const { id } = req.params;

  const message = await prisma.scheduledMessage.findUnique({
    where: { id },
  });

  if (!message) {
    throw Errors.notFound('Scheduled message');
  }

  if (message.userId !== req.userId) {
    throw Errors.forbidden('Not your scheduled message');
  }

  if (message.status !== 'pending') {
    throw Errors.badRequest('Cannot cancel a message that has already been sent');
  }

  await prisma.scheduledMessage.update({
    where: { id },
    data: { status: 'cancelled' },
  });

  res.json({ success: true });
}));

/**
 * Send scheduled message now (skip the schedule).
 */
router.post('/:id/send-now', asyncHandler(async (req: AuthRequest, res) => {
  const { id } = req.params;

  const message = await prisma.scheduledMessage.findUnique({
    where: { id },
  });

  if (!message) {
    throw Errors.notFound('Scheduled message');
  }

  if (message.userId !== req.userId) {
    throw Errors.forbidden('Not your scheduled message');
  }

  if (message.status !== 'pending') {
    throw Errors.badRequest('Message has already been sent or cancelled');
  }

  // Get channel to fetch workspaceId
  const channel = await prisma.channel.findUnique({
    where: { id: message.channelId },
    select: { workspaceId: true },
  });

  if (!channel) {
    throw Errors.notFound('Channel not found');
  }

  // Create the actual message
  const newMessage = await prisma.message.create({
    data: {
      content: message.content,
      channelId: message.channelId,
      workspaceId: channel.workspaceId,
      userId: message.userId,
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
      reactions: true,
      attachments: true,
    },
  });

  // Mark scheduled message as sent
  await prisma.scheduledMessage.update({
    where: { id },
    data: {
      status: 'sent',
      sentAt: new Date(),
    },
  });

  // Emit socket event
  const io = req.app.get('io');
  if (io) {
    io.to(`channel:${message.channelId}`).emit('message:new', newMessage);
  }

  res.json(newMessage);
}));

export default router;
