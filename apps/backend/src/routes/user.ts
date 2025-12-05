import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@pulseweave/database';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Get current user profile
router.get('/me', async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
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

// Update current user profile
router.patch('/me', async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      displayName: z.string().min(1).max(100).optional(),
      status: z.enum(['online', 'away', 'dnd', 'offline']).optional(),
      avatarUrl: z.string().url().optional().or(z.literal('')),
    });

    const data = schema.parse(req.body);

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        ...(data.displayName && { displayName: data.displayName }),
        ...(data.status && { status: data.status }),
        ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl || null }),
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        status: true,
      },
    });

    // Emit status change via socket if status changed
    if (data.status) {
      const io = req.app.get('io');
      if (io) {
        io.emit('user:status', { userId: user.id, status: user.status });
      }
    }

    res.json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
