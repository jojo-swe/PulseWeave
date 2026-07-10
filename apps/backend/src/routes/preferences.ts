import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@pulseweave/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error-handler';
import { validate } from '../middleware/validate';

const router = Router();

/**
 * Schema for updating user preferences.
 */
const updatePreferencesSchema = z.object({
  // Appearance
  theme: z.enum(['dark', 'light', 'corporate', 'midnight', 'system']).optional(),
  
  // Notification settings
  desktopNotifications: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),
  notificationPreview: z.boolean().optional(),
  mentionNotifications: z.boolean().optional(),
  dmNotifications: z.boolean().optional(),
  channelNotifications: z.boolean().optional(),
  threadReplies: z.boolean().optional(),
  
  // Quiet hours
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:MM)').optional(),
  quietHoursEnd: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:MM)').optional(),
  
  // Status timeouts (in minutes)
  idleTimeout: z.number().int().min(1).max(60).optional(),
  awayTimeout: z.number().int().min(5).max(480).optional(),
});

/**
 * Get current user's preferences.
 * Creates default preferences if they don't exist.
 */
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res) => {
    let preferences = await prisma.userPreferences.findUnique({
      where: { userId: req.userId },
    });

    // Create default preferences if they don't exist
    if (!preferences) {
      preferences = await prisma.userPreferences.create({
        data: { userId: req.userId! },
      });
    }

    res.json(preferences);
  })
);

/**
 * Update current user's preferences.
 * Creates preferences if they don't exist.
 */
router.patch(
  '/',
  authenticateToken,
  validate(updatePreferencesSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = req.body;

    // Upsert preferences
    const preferences = await prisma.userPreferences.upsert({
      where: { userId: req.userId },
      update: data,
      create: {
        userId: req.userId!,
        ...data,
      },
    });

    res.json(preferences);
  })
);

/**
 * Reset preferences to defaults.
 */
router.post(
  '/reset',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res) => {
    // Delete existing preferences
    await prisma.userPreferences.deleteMany({
      where: { userId: req.userId },
    });

    // Create new default preferences
    const preferences = await prisma.userPreferences.create({
      data: { userId: req.userId! },
    });

    res.json(preferences);
  })
);

export default router;
