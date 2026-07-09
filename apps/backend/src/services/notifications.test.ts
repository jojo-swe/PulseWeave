import { describe, expect, it, vi, beforeEach } from 'vitest';

const { sendNotification } = vi.hoisted(() => ({
  sendNotification: vi.fn(),
}));

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification,
  },
  setVapidDetails: vi.fn(),
  sendNotification,
}));

vi.mock('@pulseweave/database', () => ({
  prisma: {
    pushSubscription: {
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    channelMember: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { prisma } from '@pulseweave/database';
import { NotificationService } from './notifications';

describe('NotificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendToUser', () => {
    it('should return early if user has no subscriptions', async () => {
      vi.mocked(prisma.pushSubscription.findMany).mockResolvedValue([]);

      await NotificationService.sendToUser('user-1', {
        title: 'Test',
        body: 'Hello',
      });

      expect(sendNotification).not.toHaveBeenCalled();
    });

    it('should send notifications to all subscriptions', async () => {
      const subs = [
        { id: 'sub-1', endpoint: 'https://fcm.googleapis.com/1', p256dh: 'key1', auth: 'auth1' },
        { id: 'sub-2', endpoint: 'https://fcm.googleapis.com/2', p256dh: 'key2', auth: 'auth2' },
      ] as never;
      vi.mocked(prisma.pushSubscription.findMany).mockResolvedValue(subs);
      sendNotification.mockResolvedValue({ statusCode: 201 });

      await NotificationService.sendToUser('user-1', {
        title: 'Test',
        body: 'Hello',
        url: '/chat',
      });

      expect(sendNotification).toHaveBeenCalledTimes(2);
    });

    it('should clean up expired subscriptions (410 Gone)', async () => {
      const subs = [
        { id: 'sub-1', endpoint: 'https://fcm.googleapis.com/1', p256dh: 'key1', auth: 'auth1' },
      ] as never;
      vi.mocked(prisma.pushSubscription.findMany).mockResolvedValue(subs);
      sendNotification.mockRejectedValue({ statusCode: 410 });
      vi.mocked(prisma.pushSubscription.delete).mockResolvedValue({} as never);

      await NotificationService.sendToUser('user-1', { title: 'Test', body: 'Hello' });

      expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: 'sub-1' } });
    });

    it('should clean up expired subscriptions (404 Not Found)', async () => {
      const subs = [
        { id: 'sub-1', endpoint: 'https://fcm.googleapis.com/1', p256dh: 'key1', auth: 'auth1' },
      ] as never;
      vi.mocked(prisma.pushSubscription.findMany).mockResolvedValue(subs);
      sendNotification.mockRejectedValue({ statusCode: 404 });
      vi.mocked(prisma.pushSubscription.delete).mockResolvedValue({} as never);

      await NotificationService.sendToUser('user-1', { title: 'Test', body: 'Hello' });

      expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: 'sub-1' } });
    });

    it('should not delete subscription on non-expiry errors', async () => {
      const subs = [
        { id: 'sub-1', endpoint: 'https://fcm.googleapis.com/1', p256dh: 'key1', auth: 'auth1' },
      ] as never;
      vi.mocked(prisma.pushSubscription.findMany).mockResolvedValue(subs);
      sendNotification.mockRejectedValue({ statusCode: 500 });

      await NotificationService.sendToUser('user-1', { title: 'Test', body: 'Hello' });

      expect(prisma.pushSubscription.delete).not.toHaveBeenCalled();
    });
  });

  describe('notifyNewMessage', () => {
    it('should return early for system messages (no user)', async () => {
      await NotificationService.notifyNewMessage(
        { content: 'Hello', userId: 'user-1' },
        { id: 'ch-1', name: 'general', workspaceId: 'ws-1' }
      );

      expect(prisma.channelMember.findUnique).not.toHaveBeenCalled();
    });

    it('should notify mentioned users', async () => {
      vi.mocked(prisma.channelMember.findUnique).mockResolvedValue({} as never);
      vi.mocked(prisma.pushSubscription.findMany).mockResolvedValue([]);

      await NotificationService.notifyNewMessage(
        { content: 'Hello <@user-2> check this out', userId: 'user-1', user: { displayName: 'Alice' } },
        { id: 'ch-1', name: 'general', workspaceId: 'ws-1' }
      );

      expect(prisma.channelMember.findUnique).toHaveBeenCalledWith({
        where: { userId_channelId: { userId: 'user-2', channelId: 'ch-1' } },
      });
    });

    it('should not notify the sender for self-mentions', async () => {
      vi.mocked(prisma.channelMember.findUnique).mockResolvedValue({} as never);
      vi.mocked(prisma.pushSubscription.findMany).mockResolvedValue([]);

      await NotificationService.notifyNewMessage(
        { content: 'Self mention <@user-1>', userId: 'user-1', user: { displayName: 'Alice' } },
        { id: 'ch-1', name: 'general', workspaceId: 'ws-1' }
      );

      expect(prisma.channelMember.findUnique).not.toHaveBeenCalled();
    });

    it('should not send notification if mentioned user is not a channel member', async () => {
      vi.mocked(prisma.channelMember.findUnique).mockResolvedValue(null);

      await NotificationService.notifyNewMessage(
        { content: 'Hello <@user-2>', userId: 'user-1', user: { displayName: 'Alice' } },
        { id: 'ch-1', name: 'general', workspaceId: 'ws-1' }
      );

      expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled();
    });

    it('should handle multiple mentions', async () => {
      vi.mocked(prisma.channelMember.findUnique).mockResolvedValue({} as never);
      vi.mocked(prisma.pushSubscription.findMany).mockResolvedValue([]);

      await NotificationService.notifyNewMessage(
        { content: 'Hey <@user-2> and <@user-3>', userId: 'user-1', user: { displayName: 'Alice' } },
        { id: 'ch-1', name: 'general', workspaceId: 'ws-1' }
      );

      expect(prisma.channelMember.findUnique).toHaveBeenCalledTimes(2);
    });
  });
});
