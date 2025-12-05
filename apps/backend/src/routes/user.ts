import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@pulseweave/database';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler, Errors } from '../middleware/error-handler';
import { validate } from '../middleware/validate';

const router = Router();

/**
 * Schema for updating user profile.
 */
const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/).optional(),
  status: z.enum(['online', 'away', 'dnd', 'offline']).optional(),
  statusMessage: z.string().max(100).optional().nullable(),
  avatarUrl: z.string().url().optional().or(z.literal('')).nullable(),
});

/**
 * Schema for changing password.
 */
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

/**
 * Get current user profile.
 */
router.get('/me', asyncHandler(async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      status: true,
      statusMessage: true,
      mfaEnabled: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw Errors.notFound('User');
  }

  res.json(user);
}));

/**
 * Update current user profile.
 */
router.patch('/me', validate(updateProfileSchema), asyncHandler(async (req: AuthRequest, res) => {
  const { displayName, username, status, statusMessage, avatarUrl } = req.body;

  // Check if username is already taken
  if (username) {
    const existing = await prisma.user.findFirst({
      where: {
        username,
        NOT: { id: req.userId },
      },
    });
    if (existing) {
      throw Errors.conflict('Username already taken');
    }
  }

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: {
      ...(displayName !== undefined && { displayName }),
      ...(username !== undefined && { username }),
      ...(status !== undefined && { status }),
      ...(statusMessage !== undefined && { statusMessage }),
      ...(avatarUrl !== undefined && { avatarUrl: avatarUrl || null }),
    },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      status: true,
      statusMessage: true,
    },
  });

  // Emit status change via socket if status changed
  if (status || statusMessage !== undefined) {
    const io = req.app.get('io');
    if (io) {
      io.emit('user:status', { 
        userId: user.id, 
        status: user.status,
        statusMessage: user.statusMessage,
      });
    }
  }

  res.json(user);
}));

/**
 * Change password.
 */
router.post('/me/password', validate(changePasswordSchema), asyncHandler(async (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await prisma.user.findUnique({
    where: { id: req.userId },
  });

  if (!user) {
    throw Errors.notFound('User');
  }

  // Verify current password
  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValid) {
    throw Errors.unauthorized('Current password is incorrect');
  }

  // Hash new password
  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: req.userId },
    data: { passwordHash },
  });

  res.json({ success: true, message: 'Password changed successfully' });
}));

/**
 * Delete account.
 */
router.delete('/me', asyncHandler(async (req: AuthRequest, res) => {
  const { password } = req.body;

  if (!password) {
    throw Errors.badRequest('Password is required to delete account');
  }

  const user = await prisma.user.findUnique({
    where: { id: req.userId },
  });

  if (!user) {
    throw Errors.notFound('User');
  }

  // Verify password
  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    throw Errors.unauthorized('Password is incorrect');
  }

  // Soft delete - just deactivate
  await prisma.user.update({
    where: { id: req.userId },
    data: { isActive: false },
  });

  res.json({ success: true, message: 'Account deleted' });
}));

// Get user by ID
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        status: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as userRouter };
