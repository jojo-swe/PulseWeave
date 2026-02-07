import { Server } from 'socket.io';
import { prisma } from '@pulseweave/database';
import { logger } from '../utils/logger';
import type { AuthenticatedSocket } from './types';

const userSockets = new Map<string, Set<string>>();

export function trackConnection(userId: string, socketId: string): void {
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId)!.add(socketId);
}

export function isFirstConnection(userId: string): boolean {
  const sockets = userSockets.get(userId);
  return !sockets || sockets.size === 1;
}

export function registerDisconnectHandler(
  io: Server,
  socket: AuthenticatedSocket,
  userId: string,
): void {
  socket.on('disconnect', async () => {
    logger.info(`User disconnected: ${userId}`);

    const sockets = userSockets.get(userId);
    if (sockets) {
      sockets.delete(socket.id);

      if (sockets.size === 0) {
        userSockets.delete(userId);

        await prisma.user.update({
          where: { id: userId },
          data: { status: 'offline' },
        });

        socket.broadcast.emit('user:status', { userId, status: 'offline' });
      }
    }
  });
}
