import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from '@pulseweave/database';
import { JWT_SECRET } from '../middleware/auth';
import { sanitizeInput } from '../middleware/security';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

const userSockets = new Map<string, Set<string>>();

export function setupSocketHandlers(io: Server) {
  // Authentication middleware with full validation
  io.use(async (socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      // Verify token with issuer and audience (same as HTTP auth)
      const decoded = jwt.verify(token, JWT_SECRET, {
        issuer: 'pulseweave',
        audience: 'pulseweave-api',
      }) as { userId: string; jti?: string };
      
      // SECURITY: Check if session is revoked (same as HTTP auth)
      if (decoded.jti) {
        const session = await prisma.session.findUnique({
          where: { tokenId: decoded.jti },
        });
        if (session && !session.isValid) {
          return next(new Error('Token has been revoked'));
        }
      }
      
      socket.userId = decoded.userId;
      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return next(new Error('Token expired'));
      }
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    console.log(`User connected: ${userId}`);

    // Verify user exists before proceeding
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      console.warn(`Socket connection rejected: user ${userId} not found (stale token?)`);
      socket.emit('error', { message: 'User not found. Please log in again.' });
      socket.disconnect(true);
      return;
    }

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

    // Broadcast online status to all OTHER users
    socket.broadcast.emit('user:status', { userId, status: 'online' });
    
    // Also send to the connecting user themselves so they update their own status
    socket.emit('user:status', { userId, status: 'online' });

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

    // Join channel room (with authorization check)
    socket.on('channel:join', async (channelId: string) => {
      // SECURITY: Verify user has access to this channel
      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        include: { workspace: true },
      });

      if (!channel) {
        socket.emit('error', { message: 'Channel not found' });
        return;
      }

      // Check workspace membership first
      const workspaceMembership = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: { userId, workspaceId: channel.workspaceId },
        },
      });

      if (!workspaceMembership) {
        socket.emit('error', { message: 'Not a member of this workspace' });
        return;
      }

      // For private channels, check channel membership
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
      console.log(`User ${userId} joined channel ${channelId}`);
    });

    // Leave channel room
    socket.on('channel:leave', (channelId: string) => {
      socket.leave(`channel:${channelId}`);
    });

    // Join DM room
    socket.on('dm:join', async (conversationId: string) => {
      // Verify user is member of conversation
      const membership = await prisma.conversationMember.findUnique({
        where: {
          userId_conversationId: { userId, conversationId },
        },
      });

      if (membership) {
        socket.join(`dm:${conversationId}`);
        console.log(`User ${userId} joined DM ${conversationId}`);
      }
    });

    // Leave DM room
    socket.on('dm:leave', (conversationId: string) => {
      socket.leave(`dm:${conversationId}`);
    });

    // Handle new message
    socket.on('message:send', async (data: { channelId: string; content: string; parentId?: string }) => {
      try {
        // Input validation
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

        // SECURITY: Verify user has access to send messages in this channel
        const workspaceMembership = await prisma.workspaceMember.findUnique({
          where: {
            userId_workspaceId: { userId, workspaceId: channel.workspaceId },
          },
        });

        if (!workspaceMembership) {
          socket.emit('error', { message: 'Not a member of this workspace' });
          return;
        }

        // For private channels, verify channel membership
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

        // SECURITY: Sanitize content — socket events bypass Express middleware
        const sanitizedContent = sanitizeInput(data.content.trim());
        if (!sanitizedContent || sanitizedContent.length === 0) {
          socket.emit('error', { message: 'Message content required' });
          return;
        }

        const message = await prisma.message.create({
          data: {
            content: sanitizedContent,
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

        // Broadcast to channel
        io.to(`channel:${data.channelId}`).emit('message:new', message);
      } catch (error) {
        console.error('Socket message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle typing indicator (use cached username to avoid DB query per keystroke)
    socket.on('typing:start', (channelId: string) => {
      socket.to(`channel:${channelId}`).emit('user:typing', {
        channelId,
        userId,
        username: user.username,
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
        // Input validation
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

        // SECURITY: Verify user has access to the channel
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
        console.error('Reaction error:', error);
      }
    });

    socket.on('reaction:remove', async (data: { messageId: string; emoji: string }) => {
      try {
        // Input validation
        if (!data.messageId || typeof data.messageId !== 'string') {
          socket.emit('error', { message: 'Invalid message ID' });
          return;
        }
        if (!data.emoji || typeof data.emoji !== 'string') {
          socket.emit('error', { message: 'Invalid emoji' });
          return;
        }

        // Only find reactions that belong to this user (prevents removing others' reactions)
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
