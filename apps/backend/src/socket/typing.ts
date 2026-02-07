import { prisma } from '@pulseweave/database';
import type { AuthenticatedSocket } from './types';

export function registerTypingHandlers(socket: AuthenticatedSocket, userId: string): void {
  socket.on('typing:start', async (channelId: string) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });

    socket.to(`channel:${channelId}`).emit('user:typing', {
      channelId,
      userId,
      username: user?.username,
    });
  });

  socket.on('typing:stop', (channelId: string) => {
    socket.to(`channel:${channelId}`).emit('user:typing:stop', {
      channelId,
      userId,
    });
  });
}
