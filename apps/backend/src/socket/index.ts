import { Server } from 'socket.io';
import { prisma } from '@pulseweave/database';
import { logger } from '../utils/logger';
import type { AuthenticatedSocket } from './types';
import { setupSocketAuth } from './auth';
import { trackConnection, registerDisconnectHandler } from './presence';
import { registerRoomHandlers } from './rooms';
import { registerMessageHandlers } from './messages';
import { registerTypingHandlers } from './typing';
import { registerReactionHandlers } from './reactions';

export function setupSocketHandlers(io: Server) {
  setupSocketAuth(io);

  io.on('connection', async (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    logger.info(`User connected: ${userId}`);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      logger.warn(`Socket connection rejected: user ${userId} not found (stale token?)`);
      socket.emit('error', { message: 'User not found. Please log in again.' });
      socket.disconnect(true);
      return;
    }

    trackConnection(userId, socket.id);

    await prisma.user.update({
      where: { id: userId },
      data: { status: 'online' },
    });

    socket.broadcast.emit('user:status', { userId, status: 'online' });
    socket.emit('user:status', { userId, status: 'online' });

    registerRoomHandlers(socket, userId);
    registerMessageHandlers(io, socket, userId);
    registerTypingHandlers(socket, userId);
    registerReactionHandlers(io, socket, userId);
    registerDisconnectHandler(io, socket, userId);
  });
}
