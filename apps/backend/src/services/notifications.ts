import webpush from 'web-push';
import { prisma } from '@pulseweave/database';
import { logger } from '../utils/logger';

// VAPID keys should be in environment variables
const publicVapidKey = process.env.VAPID_PUBLIC_KEY || 'BAOcikxVSXADQjF9KPhx-AfJ3HxPVmKF5J6vFVnGj7ynr4Yt8isWprctA2O7kaA6NWprqXMst9blsgODbZg8aHc';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || 'lSZ0kXbVJeaKhb6gzWHxR-ZwwQGqhlsIeEiaSyoDg0s';

webpush.setVapidDetails(
  'mailto:support@pulseweave.com',
  publicVapidKey,
  privateVapidKey
);

export class NotificationService {
  /**
   * Send a push notification to a specific user
   */
  static async sendToUser(userId: string, payload: { title: string; body: string; url?: string; icon?: string }) {
    try {
      // Fetch all subscriptions for the user
      const subscriptions = await prisma.pushSubscription.findMany({
        where: { userId },
      });

      if (subscriptions.length === 0) {
        return;
      }

      logger.info(`Sending push notification to user ${userId} (${subscriptions.length} devices)`);

      const notificationPayload = JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url || '/',
        icon: payload.icon || '/icons/icon-192x192.png',
        timestamp: Date.now(),
      });

      // Send to all subscriptions in parallel
      const results = await Promise.allSettled(
        subscriptions.map(async (sub) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.p256dh,
                  auth: sub.auth,
                },
              },
              notificationPayload
            );
            return { status: 'fulfilled', id: sub.id };
          } catch (error: unknown) {
            // Check for expired subscription (410 Gone or 404 Not Found)
            const statusCode = (error as { statusCode?: number }).statusCode;
            if (statusCode === 410 || statusCode === 404) {
              logger.info(`Cleaning up expired subscription ${sub.id}`);
              await prisma.pushSubscription.delete({ where: { id: sub.id } });
            }
            throw error;
          }
        })
      );

      // Log results if needed
      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      logger.debug(`Push notification sent: ${successCount}/${subscriptions.length} successful`);
    } catch (error) {
      logger.error('Error sending push notification:', { error: String(error) });
    }
  }

  /**
   * Trigger notifications for a new message
   */
  static async notifyNewMessage(message: { content: string; userId: string; user?: { displayName: string } }, channel: { id: string; name: string; workspaceId: string }) {
    try {
      // Don't notify the sender
      if (!message.user) {
        return; // System message or corrupted
      }

      // Logic for mentions
      const mentionRegex = /<@([a-zA-Z0-9-]+)>/g;
      let match;
      const mentionedUserIds = new Set<string>();

      while ((match = mentionRegex.exec(message.content)) !== null) {
        mentionedUserIds.add(match[1]!);
      }

      // 1. Notify mentioned users
      for (const userId of mentionedUserIds) {
        if (userId === message.userId) continue; // Don't notify self

        // Verify user is in channel
        const member = await prisma.channelMember.findUnique({
          where: { userId_channelId: { userId, channelId: channel.id } },
        });

        if (member) {
          await this.sendToUser(userId, {
            title: `New mention in #${channel.name}`,
            body: `${message.user.displayName}: ${message.content}`,
            url: `/workspace/${channel.workspaceId}/channel/${channel.id}`,
          });
        }
      }
      
    } catch (error) {
      logger.error('Error handling message notification:', { error: String(error) });
    }
  }
}
