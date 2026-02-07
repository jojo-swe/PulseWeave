import { Server } from 'socket.io';
import { prisma } from '@pulseweave/database';
import { logger } from '../utils/logger';
import type { AuthenticatedSocket } from './types';

export function registerMessageHandlers(
  io: Server,
  socket: AuthenticatedSocket,
  userId: string,
): void {
  socket.on('message:send', async (data: { channelId: string; content: string; parentId?: string }) => {
    try {
      if (!data.channelId || typeof data.channelId !== 'string') {
        socket.emit('error', { message: 'Invalid channel ID' });
        return;
      }
      if (!data.content || typeof data.content !== 'string' || data.content.trim().length === 0) {
        socket.emit('error', { message: 'Message content required' });
        return;
      }
      if (data.content.length > 4000) {
        socket.emit('error', { message: 'Message too long (max 4000 characters)' });
        return;
      }

      const channel = await prisma.channel.findUnique({
        where: { id: data.channelId },
        select: { workspaceId: true, isPrivate: true },
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
            userId_channelId: { userId, channelId: data.channelId },
          },
        });

        if (!channelMembership) {
          socket.emit('error', { message: 'Not a member of this private channel' });
          return;
        }
      }

      const message = await prisma.message.create({
        data: {
          content: data.content,
          channelId: data.channelId,
          workspaceId: channel.workspaceId,
          userId,
          parentId: data.parentId,
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
        },
      });

      io.to(`channel:${data.channelId}`).emit('message:new', message);
    } catch (error) {
      logger.error('Socket message error:', { error: String(error) });
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
}
