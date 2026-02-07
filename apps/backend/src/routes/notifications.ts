import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@pulseweave/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error-handler';
import { NotificationService } from '../services/notifications';

const router = Router();

// Get VAPID Public Key
router.get('/vapid-key', authenticateToken, (req, res) => {
  res.json({
    publicKey: process.env.VAPID_PUBLIC_KEY || ''
  });
});

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

// Subscribe to push notifications
router.post('/subscribe', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const { endpoint, keys } = subscriptionSchema.parse(req.body);
  const userAgent = req.headers['user-agent'] || 'Unknown';

  // Upsert subscription (if endpoint exists, update user/keys)
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: {
      userId: req.userId!,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent,
      updatedAt: new Date(),
    },
    create: {
      userId: req.userId!,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent,
    },
  });

  res.status(201).json({ success: true, message: 'Subscribed successfully' });
}));

// Unsubscribe
router.post('/unsubscribe', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.body);

  await prisma.pushSubscription.deleteMany({
    where: {
      endpoint,
      userId: req.userId, // Ensure user owns the subscription
    },
  });

  res.json({ success: true, message: 'Unsubscribed successfully' });
}));

// Send test notification
router.post('/test', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  await NotificationService.sendToUser(req.userId!, {
    title: 'Test Notification',
    body: 'This is a test notification from PulseWeave!',
  });

  res.json({ success: true, message: 'Test notification sent' });
}));

export { router as notificationRouter };
