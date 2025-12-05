import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from '@chatterbox/database';
import { JWT_SECRET } from '../middleware/auth';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

const userSockets = new Map<string, Set<string>>();

export function setupSocketHandlers(io: Server) {
  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      socket.userId = decoded.userId;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    console.log(`User connected: ${userId}`);

    // Track user's socket connections
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)!.add(socket.id);

    // Update user status to online
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'online' },
    });

    // Broadcast online status
    socket.broadcast.emit('user:status', { userId, status: 'online' });

    // Join workspace rooms
    socket.on('workspace:join', async (workspaceId: string) => {
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: { userId, workspaceId },
        },
      });

      if (membership) {
        socket.join(`workspace:${workspaceId}`);
        console.log(`User ${userId} joined workspace ${workspaceId}`);
      }
    });

    // Join channel room
    socket.on('channel:join', async (channelId: string) => {
      socket.join(`channel:${channelId}`);
      console.log(`User ${userId} joined channel ${channelId}`);
    });

    // Leave channel room
    socket.on('channel:leave', (channelId: string) => {
      socket.leave(`channel:${channelId}`);
    });

    // Handle new message
    socket.on('message:send', async (data: { channelId: string; content: string; parentId?: string }) => {
      try {
        const message = await prisma.message.create({
          data: {
            content: data.content,
            channelId: data.channelId,
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

        // Broadcast to channel
        io.to(`channel:${data.channelId}`).emit('message:new', message);
      } catch (error) {
        console.error('Socket message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle typing indicator
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

    // Handle reactions
    socket.on('reaction:add', async (data: { messageId: string; emoji: string }) => {
      try {
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
        console.error('Reaction error:', error);
      }
    });

    socket.on('reaction:remove', async (data: { messageId: string; emoji: string }) => {
      try {
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
        console.error('Reaction remove error:', error);
      }
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${userId}`);
      
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        
        // Only set offline if no more connections
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
  });
}
