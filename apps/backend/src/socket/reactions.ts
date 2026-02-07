import { Server } from 'socket.io';
import { prisma } from '@pulseweave/database';
import { logger } from '../utils/logger';
import type { AuthenticatedSocket } from './types';

export function registerReactionHandlers(
  io: Server,
  socket: AuthenticatedSocket,
  userId: string,
): void {
  socket.on('reaction:add', async (data: { messageId: string; emoji: string }) => {
    try {
      if (!data.messageId || typeof data.messageId !== 'string') {
        socket.emit('error', { message: 'Invalid message ID' });
        return;
      }
      if (!data.emoji || typeof data.emoji !== 'string' || data.emoji.length > 50) {
        socket.emit('error', { message: 'Invalid emoji' });
        return;
      }

      const message = await prisma.message.findUnique({
        where: { id: data.messageId },
        include: { channel: { select: { workspaceId: true, isPrivate: true } } },
      });

      if (!message) {
        socket.emit('error', { message: 'Message not found' });
        return;
      }

      const workspaceMembership = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: { userId, workspaceId: message.channel.workspaceId },
        },
      });

      if (!workspaceMembership) {
        socket.emit('error', { message: 'Not a member of this workspace' });
        return;
      }

      if (message.channel.isPrivate) {
        const channelMembership = await prisma.channelMember.findUnique({
          where: {
            userId_channelId: { userId, channelId: message.channelId },
          },
        });

        if (!channelMembership) {
          socket.emit('error', { message: 'Not a member of this private channel' });
          return;
        }
      }

      const reaction = await prisma.reaction.upsert({
        where: {
          messageId_userId_emoji: {
            messageId: data.messageId,
            userId,
            emoji: data.emoji,
          },
        },
        create: {
          messageId: data.messageId,
          userId,
          emoji: data.emoji,
          workspaceId: message.workspaceId,
        },
        update: {},
        include: {
          message: { select: { channelId: true } },
        },
      });

      io.to(`channel:${reaction.message.channelId}`).emit('message:reaction', {
        messageId: data.messageId,
        emoji: data.emoji,
        userId,
        action: 'add',
      });
    } catch (error) {
      logger.error('Reaction error:', { error: String(error) });
    }
  });

  socket.on('reaction:remove', async (data: { messageId: string; emoji: string }) => {
    try {
      if (!data.messageId || typeof data.messageId !== 'string') {
        socket.emit('error', { message: 'Invalid message ID' });
        return;
      }
      if (!data.emoji || typeof data.emoji !== 'string') {
        socket.emit('error', { message: 'Invalid emoji' });
        return;
      }

      const reaction = await prisma.reaction.findUnique({
        where: {
          messageId_userId_emoji: {
            messageId: data.messageId,
            userId,
            emoji: data.emoji,
          },
        },
        include: {
          message: { select: { channelId: true } },
        },
      });

      if (reaction) {
        await prisma.reaction.delete({
          where: { id: reaction.id },
        });

        io.to(`channel:${reaction.message.channelId}`).emit('message:reaction', {
          messageId: data.messageId,
          emoji: data.emoji,
          userId,
          action: 'remove',
        });
      }
    } catch (error) {
      logger.error('Reaction remove error:', { error: String(error) });
    }
  });
}
