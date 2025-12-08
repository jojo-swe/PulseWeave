import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@pulseweave/database';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler, Errors } from '../middleware/error-handler';
import { validate } from '../middleware/validate';

const router = Router();

// Schemas
const sendRequestSchema = z.object({
  username: z.string().min(1).max(30),
});

/**
 * Get all friends (accepted friendships).
 */
router.get('/', asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.userId!;

  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [
        { requesterId: userId, status: 'accepted' },
        { addresseeId: userId, status: 'accepted' },
      ],
    },
    include: {
      requester: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          status: true,
          statusMessage: true,
        },
      },
      addressee: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          status: true,
          statusMessage: true,
        },
      },
    },
  });

  // Map to friend objects (the other user in the friendship)
  const friends = friendships.map((f) => {
    const friend = f.requesterId === userId ? f.addressee : f.requester;
    return {
      id: f.id,
      friendshipId: f.id,
      user: friend,
      since: f.updatedAt,
    };
  });

  res.json({ friends });
}));

/**
 * Get pending friend requests (received).
 */
router.get('/requests', asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.userId!;

  const requests = await prisma.friendship.findMany({
    where: {
      addresseeId: userId,
      status: 'pending',
    },
    include: {
      requester: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    requests: requests.map((r) => ({
      id: r.id,
      from: r.requester,
      createdAt: r.createdAt,
    })),
  });
}));

/**
 * Get sent friend requests (pending).
 */
router.get('/requests/sent', asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.userId!;

  const requests = await prisma.friendship.findMany({
    where: {
      requesterId: userId,
      status: 'pending',
    },
    include: {
      addressee: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    requests: requests.map((r) => ({
      id: r.id,
      to: r.addressee,
      createdAt: r.createdAt,
    })),
  });
}));

/**
 * Send a friend request.
 */
router.post('/request', validate(sendRequestSchema), asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { username } = req.body;

  // Find the target user
  const targetUser = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: { id: true, username: true, displayName: true },
  });

  if (!targetUser) {
    throw Errors.notFound('User');
  }

  if (targetUser.id === userId) {
    throw Errors.badRequest('Cannot send friend request to yourself');
  }

  // Check if friendship already exists (in either direction)
  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: userId, addresseeId: targetUser.id },
        { requesterId: targetUser.id, addresseeId: userId },
      ],
    },
  });

  if (existing) {
    if (existing.status === 'accepted') {
      throw Errors.badRequest('Already friends with this user');
    }
    if (existing.status === 'pending') {
      // If they sent us a request, auto-accept
      if (existing.requesterId === targetUser.id) {
        const updated = await prisma.friendship.update({
          where: { id: existing.id },
          data: { status: 'accepted' },
        });
        return res.json({ 
          message: 'Friend request accepted',
          friendship: updated,
          status: 'accepted',
        });
      }
      throw Errors.badRequest('Friend request already sent');
    }
    if (existing.status === 'blocked') {
      throw Errors.forbidden('Cannot send friend request to this user');
    }
    if (existing.status === 'declined') {
      // Allow re-sending after decline
      const updated = await prisma.friendship.update({
        where: { id: existing.id },
        data: { 
          status: 'pending',
          requesterId: userId,
          addresseeId: targetUser.id,
        },
      });
      return res.status(201).json({ 
        message: 'Friend request sent',
        request: updated,
      });
    }
  }

  // Create new friend request
  const request = await prisma.friendship.create({
    data: {
      requesterId: userId,
      addresseeId: targetUser.id,
      status: 'pending',
    },
  });

  res.status(201).json({ 
    message: 'Friend request sent',
    request,
  });
}));

/**
 * Accept a friend request.
 */
router.post('/request/:id/accept', asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { id } = req.params;

  const request = await prisma.friendship.findUnique({
    where: { id },
  });

  if (!request) {
    throw Errors.notFound('Friend request');
  }

  if (request.addresseeId !== userId) {
    throw Errors.forbidden('Not authorized to accept this request');
  }

  if (request.status !== 'pending') {
    throw Errors.badRequest('Request is no longer pending');
  }

  const updated = await prisma.friendship.update({
    where: { id },
    data: { status: 'accepted' },
    include: {
      requester: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  res.json({ 
    message: 'Friend request accepted',
    friendship: updated,
  });
}));

/**
 * Decline a friend request.
 */
router.post('/request/:id/decline', asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { id } = req.params;

  const request = await prisma.friendship.findUnique({
    where: { id },
  });

  if (!request) {
    throw Errors.notFound('Friend request');
  }

  if (request.addresseeId !== userId) {
    throw Errors.forbidden('Not authorized to decline this request');
  }

  if (request.status !== 'pending') {
    throw Errors.badRequest('Request is no longer pending');
  }

  const updated = await prisma.friendship.update({
    where: { id },
    data: { status: 'declined' },
  });

  res.json({ message: 'Friend request declined' });
}));

/**
 * Cancel a sent friend request.
 */
router.delete('/request/:id', asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { id } = req.params;

  const request = await prisma.friendship.findUnique({
    where: { id },
  });

  if (!request) {
    throw Errors.notFound('Friend request');
  }

  if (request.requesterId !== userId) {
    throw Errors.forbidden('Not authorized to cancel this request');
  }

  if (request.status !== 'pending') {
    throw Errors.badRequest('Request is no longer pending');
  }

  await prisma.friendship.delete({
    where: { id },
  });

  res.json({ message: 'Friend request cancelled' });
}));

/**
 * Remove a friend.
 */
router.delete('/:id', asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { id } = req.params;

  const friendship = await prisma.friendship.findUnique({
    where: { id },
  });

  if (!friendship) {
    throw Errors.notFound('Friendship');
  }

  if (friendship.requesterId !== userId && friendship.addresseeId !== userId) {
    throw Errors.forbidden('Not authorized to remove this friend');
  }

  if (friendship.status !== 'accepted') {
    throw Errors.badRequest('Not friends with this user');
  }

  await prisma.friendship.delete({
    where: { id },
  });

  res.json({ message: 'Friend removed' });
}));

/**
 * Block a user.
 */
router.post('/block/:userId', asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const targetUserId = req.params.userId;

  if (targetUserId === userId) {
    throw Errors.badRequest('Cannot block yourself');
  }

  // Check if target user exists
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!targetUser) {
    throw Errors.notFound('User');
  }

  // Find or create friendship record
  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: userId, addresseeId: targetUserId },
        { requesterId: targetUserId, addresseeId: userId },
      ],
    },
  });

  if (existing) {
    await prisma.friendship.update({
      where: { id: existing.id },
      data: { 
        status: 'blocked',
        requesterId: userId, // Blocker becomes requester
        addresseeId: targetUserId,
      },
    });
  } else {
    await prisma.friendship.create({
      data: {
        requesterId: userId,
        addresseeId: targetUserId,
        status: 'blocked',
      },
    });
  }

  res.json({ message: 'User blocked' });
}));

/**
 * Unblock a user.
 */
router.delete('/block/:userId', asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const targetUserId = req.params.userId;

  const friendship = await prisma.friendship.findFirst({
    where: {
      requesterId: userId,
      addresseeId: targetUserId,
      status: 'blocked',
    },
  });

  if (!friendship) {
    throw Errors.notFound('Block record');
  }

  await prisma.friendship.delete({
    where: { id: friendship.id },
  });

  res.json({ message: 'User unblocked' });
}));

/**
 * Get blocked users.
 */
router.get('/blocked', asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.userId!;

  const blocked = await prisma.friendship.findMany({
    where: {
      requesterId: userId,
      status: 'blocked',
    },
    include: {
      addressee: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  res.json({
    blocked: blocked.map((b) => ({
      id: b.id,
      user: b.addressee,
      blockedAt: b.updatedAt,
    })),
  });
}));

export { router as friendRouter };
