import { prisma } from '@pulseweave/database';
import { logger } from '../utils/logger';
import type { AuthenticatedSocket } from './types';

export function registerRoomHandlers(socket: AuthenticatedSocket, userId: string): void {
  socket.on('workspace:join', async (workspaceId: string) => {
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId, workspaceId },
      },
    });

    if (membership) {
      socket.join(`workspace:${workspaceId}`);
      logger.debug(`User ${userId} joined workspace ${workspaceId}`);
    }
  });

  socket.on('channel:join', async (channelId: string) => {
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: { workspace: true },
    });

    if (!channel) {
      socket.emit('error', { message: 'Channel not found' });
      return;
    }

    const workspaceMembership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId, workspaceId: channel.workspaceId },
      },
    });

    if (!workspaceMembership) {
      socket.emit('error', { message: 'Not a member of this workspace' });
      return;
    }

    if (channel.isPrivate) {
      const channelMembership = await prisma.channelMember.findUnique({
        where: {
          userId_channelId: { userId, channelId },
        },
      });

      if (!channelMembership) {
        socket.emit('error', { message: 'Not a member of this private channel' });
        return;
      }
    }

    socket.join(`channel:${channelId}`);
    logger.debug(`User ${userId} joined channel ${channelId}`);
  });

  socket.on('channel:leave', (channelId: string) => {
    socket.leave(`channel:${channelId}`);
  });

  socket.on('dm:join', async (conversationId: string) => {
    const membership = await prisma.conversationMember.findUnique({
      where: {
        userId_conversationId: { userId, conversationId },
      },
    });

    if (membership) {
      socket.join(`dm:${conversationId}`);
      logger.debug(`User ${userId} joined DM ${conversationId}`);
    }
  });

  socket.on('dm:leave', (conversationId: string) => {
    socket.leave(`dm:${conversationId}`);
  });
}
