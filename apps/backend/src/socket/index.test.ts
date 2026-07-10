import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    session: { findUnique: vi.fn() },
    workspaceMember: { findUnique: vi.fn() },
    channel: { findUnique: vi.fn() },
    channelMember: { findUnique: vi.fn() },
    conversationMember: { findUnique: vi.fn() },
    message: { create: vi.fn(), findUnique: vi.fn() },
    reaction: { upsert: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
  },
}));

vi.mock('@pulseweave/database', () => ({ prisma: mockPrisma }));

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn(),
    TokenExpiredError: class TokenExpiredError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'TokenExpiredError';
      }
    },
  },
}));

vi.mock('../middleware/auth', () => ({
  JWT_SECRET: 'test-secret-at-least-32-characters-long-for-testing',
}));

vi.mock('../middleware/security', () => ({
  sanitizeInput: vi.fn((input: string) => input),
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import jwt from 'jsonwebtoken';
import { setupSocketHandlers } from './index';

/* eslint-disable @typescript-eslint/no-explicit-any */

function createMockSocket(userId?: string): any {
  const socket = new EventEmitter();
  socket.id = 'socket-' + Math.random().toString(36).slice(2);
  if (userId) socket.userId = userId;
  socket.handshake = { auth: { token: 'valid-token' } };
  socket.rooms = new Set();
  socket.join = vi.fn((room: string) => { socket.rooms.add(room); });
  socket.leave = vi.fn((room: string) => { socket.rooms.delete(room); });
  socket.disconnect = vi.fn();
  socket.broadcast = { emit: vi.fn() };
  socket.to = vi.fn(() => ({ emit: vi.fn() }));
  // Socket.io emit (send to client) — separate from EventEmitter.emit (trigger handlers)
  socket.emit = vi.fn();
  // Helper to trigger event handlers (uses EventEmitter.emit internally)
  socket._trigger = (event: string, ...args: any[]) => EventEmitter.prototype.emit.call(socket, event, ...args);
  return socket;
}

function createMockIo(): any {
  const io = new EventEmitter();
  io.use = vi.fn();
  io.to = vi.fn(() => ({ emit: vi.fn() }));
  io.emit = vi.fn();
  return io;
}

describe('Socket Handlers', () => {
  let io: any;
  let authMiddleware: (socket: any, next: (err?: Error) => void) => void;
  let connectionHandler: (socket: any) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    io = createMockIo();

    io.use = vi.fn((fn: any) => { authMiddleware = fn; });
    io.on = vi.fn((event: string, handler: any) => {
      if (event === 'connection') connectionHandler = handler;
    });

    // Re-setup default mock implementations after clearAllMocks
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.update.mockResolvedValue({});
    mockPrisma.session.findUnique.mockResolvedValue(null);
    mockPrisma.workspaceMember.findUnique.mockResolvedValue(null);
    mockPrisma.channel.findUnique.mockResolvedValue(null);
    mockPrisma.channelMember.findUnique.mockResolvedValue(null);
    mockPrisma.conversationMember.findUnique.mockResolvedValue(null);
    mockPrisma.message.findUnique.mockResolvedValue(null);
    mockPrisma.message.create.mockResolvedValue(null);
    mockPrisma.reaction.upsert.mockResolvedValue(null);
    mockPrisma.reaction.findUnique.mockResolvedValue(null);
    mockPrisma.reaction.delete.mockResolvedValue(null);

    setupSocketHandlers(io);
  });

  describe('Authentication middleware', () => {
    it('should reject connection without token', () => {
      const socket = createMockSocket();
      socket.handshake.auth.token = undefined;
      const next = vi.fn();

      authMiddleware(socket, next);
      expect(next).toHaveBeenCalledWith(new Error('Authentication required'));
    });

    it('should accept connection with valid token', async () => {
      const socket = createMockSocket();
      vi.mocked(jwt.verify).mockReturnValue({ userId: 'user-1' } as never);
      mockPrisma.session.findUnique.mockResolvedValue(null);
      const next = vi.fn();

      await authMiddleware(socket, next);
      expect(next).toHaveBeenCalledWith();
      expect(socket.userId).toBe('user-1');
    });

    it('should reject connection with expired token', async () => {
      const socket = createMockSocket();
      vi.mocked(jwt.verify).mockImplementation(() => {
        throw new jwt.TokenExpiredError('Token expired');
      });
      const next = vi.fn();

      await authMiddleware(socket, next);
      expect(next).toHaveBeenCalledWith(new Error('Token expired'));
    });

    it('should reject connection with invalid token', async () => {
      const socket = createMockSocket();
      vi.mocked(jwt.verify).mockImplementation(() => {
        throw new Error('Invalid signature');
      });
      const next = vi.fn();

      await authMiddleware(socket, next);
      expect(next).toHaveBeenCalledWith(new Error('Invalid token'));
    });

    it('should reject connection with revoked session', async () => {
      const socket = createMockSocket();
      vi.mocked(jwt.verify).mockReturnValue({ userId: 'user-1', jti: 'token-1' } as never);
      mockPrisma.session.findUnique.mockResolvedValue({ tokenId: 'token-1', isValid: false });
      const next = vi.fn();

      await authMiddleware(socket, next);
      expect(next).toHaveBeenCalledWith(new Error('Token has been revoked'));
    });

    it('should accept connection with valid session', async () => {
      const socket = createMockSocket();
      vi.mocked(jwt.verify).mockReturnValue({ userId: 'user-1', jti: 'token-1' } as never);
      mockPrisma.session.findUnique.mockResolvedValue({ tokenId: 'token-1', isValid: true });
      const next = vi.fn();

      await authMiddleware(socket, next);
      expect(next).toHaveBeenCalledWith();
      expect(socket.userId).toBe('user-1');
    });
  });

  describe('Connection handler', () => {
    it('should disconnect if user not found', async () => {
      const socket = createMockSocket('user-1');
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await connectionHandler(socket);

      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'User not found. Please log in again.' });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should set user online and track socket on valid connection', async () => {
      const socket = createMockSocket('user-1');
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'testuser' });
      mockPrisma.user.update.mockResolvedValue({});

      await connectionHandler(socket);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { status: 'online' },
      });
      expect(socket.broadcast.emit).toHaveBeenCalledWith('user:status', { userId: 'user-1', status: 'online' });
      expect(socket.emit).toHaveBeenCalledWith('user:status', { userId: 'user-1', status: 'online' });
    });
  });

  describe('workspace:join', () => {
    it('should join workspace room if user is a member', async () => {
      const socket = createMockSocket('user-1');
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'testuser' });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.workspaceMember.findUnique.mockResolvedValue({});

      await connectionHandler(socket);
      socket._trigger('workspace:join', 'ws-1');

      await new Promise((r) => setImmediate(r));
      expect(socket.join).toHaveBeenCalledWith('workspace:ws-1');
    });

    it('should not join workspace room if user is not a member', async () => {
      const socket = createMockSocket('user-1');
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'testuser' });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.workspaceMember.findUnique.mockResolvedValue(null);

      await connectionHandler(socket);
      socket._trigger('workspace:join', 'ws-1');

      await new Promise((r) => setImmediate(r));
      expect(socket.join).not.toHaveBeenCalledWith('workspace:ws-1');
    });
  });

  describe('channel:join', () => {
    it('should emit error if channel not found', async () => {
      const socket = createMockSocket('user-1');
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'testuser' });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.channel.findUnique.mockResolvedValue(null);

      await connectionHandler(socket);
      socket._trigger('channel:join', 'ch-1');

      await new Promise((r) => setImmediate(r));
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Channel not found' });
    });

    it('should emit error if not a workspace member', async () => {
      const socket = createMockSocket('user-1');
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'testuser' });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.channel.findUnique.mockResolvedValue({
        id: 'ch-1', workspaceId: 'ws-1', isPrivate: false, workspace: { id: 'ws-1' },
      });
      mockPrisma.workspaceMember.findUnique.mockResolvedValue(null);

      await connectionHandler(socket);
      socket._trigger('channel:join', 'ch-1');

      await new Promise((r) => setImmediate(r));
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Not a member of this workspace' });
    });

    it('should join public channel if workspace member', async () => {
      const socket = createMockSocket('user-1');
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'testuser' });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.channel.findUnique.mockResolvedValue({
        id: 'ch-1', workspaceId: 'ws-1', isPrivate: false, workspace: { id: 'ws-1' },
      });
      mockPrisma.workspaceMember.findUnique.mockResolvedValue({});

      await connectionHandler(socket);
      socket._trigger('channel:join', 'ch-1');

      await new Promise((r) => setImmediate(r));
      expect(socket.join).toHaveBeenCalledWith('channel:ch-1');
    });

    it('should join private channel if channel member', async () => {
      const socket = createMockSocket('user-1');
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'testuser' });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.channel.findUnique.mockResolvedValue({
        id: 'ch-1', workspaceId: 'ws-1', isPrivate: true, workspace: { id: 'ws-1' },
      });
      mockPrisma.workspaceMember.findUnique.mockResolvedValue({});
      mockPrisma.channelMember.findUnique.mockResolvedValue({});

      await connectionHandler(socket);
      socket._trigger('channel:join', 'ch-1');

      await new Promise((r) => setImmediate(r));
      expect(socket.join).toHaveBeenCalledWith('channel:ch-1');
    });

    it('should reject private channel if not a channel member', async () => {
      const socket = createMockSocket('user-1');
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'testuser' });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.channel.findUnique.mockResolvedValue({
        id: 'ch-1', workspaceId: 'ws-1', isPrivate: true, workspace: { id: 'ws-1' },
      });
      mockPrisma.workspaceMember.findUnique.mockResolvedValue({});
      mockPrisma.channelMember.findUnique.mockResolvedValue(null);

      await connectionHandler(socket);
      socket._trigger('channel:join', 'ch-1');

      await new Promise((r) => setImmediate(r));
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Not a member of this private channel' });
    });
  });

  describe('channel:leave', () => {
    it('should leave channel room', async () => {
      const socket = createMockSocket('user-1');
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'testuser' });
      mockPrisma.user.update.mockResolvedValue({});

      await connectionHandler(socket);
      socket._trigger('channel:leave', 'ch-1');

      expect(socket.leave).toHaveBeenCalledWith('channel:ch-1');
    });
  });

  describe('dm:join', () => {
    it('should join DM room if user is a member', async () => {
      const socket = createMockSocket('user-1');
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'testuser' });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.conversationMember.findUnique.mockResolvedValue({});

      await connectionHandler(socket);
      socket._trigger('dm:join', 'conv-1');

      await new Promise((r) => setImmediate(r));
      expect(socket.join).toHaveBeenCalledWith('dm:conv-1');
    });

    it('should not join DM room if user is not a member', async () => {
      const socket = createMockSocket('user-1');
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'testuser' });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.conversationMember.findUnique.mockResolvedValue(null);

      await connectionHandler(socket);
      socket._trigger('dm:join', 'conv-1');

      await new Promise((r) => setImmediate(r));
      expect(socket.join).not.toHaveBeenCalledWith('dm:conv-1');
    });
  });

  describe('dm:leave', () => {
    it('should leave DM room', async () => {
      const socket = createMockSocket('user-1');
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'testuser' });
      mockPrisma.user.update.mockResolvedValue({});

      await connectionHandler(socket);
      socket._trigger('dm:leave', 'conv-1');

      expect(socket.leave).toHaveBeenCalledWith('dm:conv-1');
    });
  });

  describe('message:send', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'testuser' });
      mockPrisma.user.update.mockResolvedValue({});
    });

    it('should reject message with invalid channel ID', async () => {
      const socket = createMockSocket('user-1');
      await connectionHandler(socket);
      socket._trigger('message:send', { channelId: '', content: 'hello' });

      await new Promise((r) => setImmediate(r));
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Invalid channel ID' });
    });

    it('should reject empty message content', async () => {
      const socket = createMockSocket('user-1');
      await connectionHandler(socket);
      socket._trigger('message:send', { channelId: 'ch-1', content: '' });

      await new Promise((r) => setImmediate(r));
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Message content required' });
    });

    it('should reject message content over 4000 chars', async () => {
      const socket = createMockSocket('user-1');
      await connectionHandler(socket);
      socket._trigger('message:send', { channelId: 'ch-1', content: 'a'.repeat(4001) });

      await new Promise((r) => setImmediate(r));
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Message too long (max 4000 characters)' });
    });

    it('should reject if channel not found', async () => {
      const socket = createMockSocket('user-1');
      mockPrisma.channel.findUnique.mockResolvedValue(null);
      await connectionHandler(socket);
      socket._trigger('message:send', { channelId: 'ch-1', content: 'hello' });

      await new Promise((r) => setImmediate(r));
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Channel not found' });
    });

    it('should reject if not a workspace member', async () => {
      const socket = createMockSocket('user-1');
      mockPrisma.channel.findUnique.mockResolvedValue({ workspaceId: 'ws-1', isPrivate: false });
      mockPrisma.workspaceMember.findUnique.mockResolvedValue(null);
      await connectionHandler(socket);
      socket._trigger('message:send', { channelId: 'ch-1', content: 'hello' });

      await new Promise((r) => setImmediate(r));
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Not a member of this workspace' });
    });

    it('should reject if not a member of private channel', async () => {
      const socket = createMockSocket('user-1');
      mockPrisma.channel.findUnique.mockResolvedValue({ workspaceId: 'ws-1', isPrivate: true });
      mockPrisma.workspaceMember.findUnique.mockResolvedValue({});
      mockPrisma.channelMember.findUnique.mockResolvedValue(null);
      await connectionHandler(socket);
      socket._trigger('message:send', { channelId: 'ch-1', content: 'hello' });

      await new Promise((r) => setImmediate(r));
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Not a member of this private channel' });
    });

    it('should create and broadcast message on valid send', async () => {
      const socket = createMockSocket('user-1');
      mockPrisma.channel.findUnique.mockResolvedValue({ workspaceId: 'ws-1', isPrivate: false });
      mockPrisma.workspaceMember.findUnique.mockResolvedValue({});
      const mockMessage = { id: 'msg-1', content: 'hello', userId: 'user-1', user: { id: 'user-1', username: 'testuser' } };
      mockPrisma.message.create.mockResolvedValue(mockMessage);

      const toEmit = vi.fn();
      io.to = vi.fn(() => ({ emit: toEmit }));

      await connectionHandler(socket);
      socket._trigger('message:send', { channelId: 'ch-1', content: 'hello' });

      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      expect(mockPrisma.message.create).toHaveBeenCalled();
      expect(toEmit).toHaveBeenCalledWith('message:new', mockMessage);
    });
  });

  describe('typing:start and typing:stop', () => {
    it('should broadcast typing:start event', async () => {
      const socket = createMockSocket('user-1');
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'testuser' });
      mockPrisma.user.update.mockResolvedValue({});

      const toEmit = vi.fn();
      socket.to = vi.fn(() => ({ emit: toEmit }));

      await connectionHandler(socket);
      socket._trigger('typing:start', 'ch-1');

      expect(toEmit).toHaveBeenCalledWith('user:typing', {
        channelId: 'ch-1', userId: 'user-1', username: 'testuser',
      });
    });

    it('should broadcast typing:stop event', async () => {
      const socket = createMockSocket('user-1');
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'testuser' });
      mockPrisma.user.update.mockResolvedValue({});

      const toEmit = vi.fn();
      socket.to = vi.fn(() => ({ emit: toEmit }));

      await connectionHandler(socket);
      socket._trigger('typing:stop', 'ch-1');

      expect(toEmit).toHaveBeenCalledWith('user:typing:stop', {
        channelId: 'ch-1', userId: 'user-1',
      });
    });
  });

  describe('reaction:add', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'testuser' });
      mockPrisma.user.update.mockResolvedValue({});
    });

    it('should reject invalid message ID', async () => {
      const socket = createMockSocket('user-1');
      await connectionHandler(socket);
      socket._trigger('reaction:add', { messageId: '', emoji: '👍' });

      await new Promise((r) => setImmediate(r));
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Invalid message ID' });
    });

    it('should reject invalid emoji', async () => {
      const socket = createMockSocket('user-1');
      await connectionHandler(socket);
      socket._trigger('reaction:add', { messageId: 'msg-1', emoji: '' });

      await new Promise((r) => setImmediate(r));
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Invalid emoji' });
    });

    it('should reject if message not found', async () => {
      const socket = createMockSocket('user-1');
      mockPrisma.message.findUnique.mockResolvedValue(null);
      await connectionHandler(socket);
      socket._trigger('reaction:add', { messageId: 'msg-1', emoji: '👍' });

      await new Promise((r) => setImmediate(r));
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Message not found' });
    });

    it('should reject if not a workspace member', async () => {
      const socket = createMockSocket('user-1');
      mockPrisma.message.findUnique.mockResolvedValue({
        id: 'msg-1', channelId: 'ch-1', workspaceId: 'ws-1',
        channel: { workspaceId: 'ws-1', isPrivate: false },
      });
      mockPrisma.workspaceMember.findUnique.mockResolvedValue(null);
      await connectionHandler(socket);
      socket._trigger('reaction:add', { messageId: 'msg-1', emoji: '👍' });

      await new Promise((r) => setImmediate(r));
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Not a member of this workspace' });
    });

    it('should add reaction and broadcast on valid request', async () => {
      const socket = createMockSocket('user-1');
      mockPrisma.message.findUnique.mockResolvedValue({
        id: 'msg-1', channelId: 'ch-1', workspaceId: 'ws-1',
        channel: { workspaceId: 'ws-1', isPrivate: false },
      });
      mockPrisma.workspaceMember.findUnique.mockResolvedValue({});
      mockPrisma.reaction.upsert.mockResolvedValue({ message: { channelId: 'ch-1' } });

      const toEmit = vi.fn();
      io.to = vi.fn(() => ({ emit: toEmit }));

      await connectionHandler(socket);
      socket._trigger('reaction:add', { messageId: 'msg-1', emoji: '👍' });

      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      expect(mockPrisma.reaction.upsert).toHaveBeenCalled();
      expect(toEmit).toHaveBeenCalledWith('message:reaction', {
        messageId: 'msg-1', emoji: '👍', userId: 'user-1', action: 'add',
      });
    });
  });

  describe('reaction:remove', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'testuser' });
      mockPrisma.user.update.mockResolvedValue({});
    });

    it('should reject invalid message ID', async () => {
      const socket = createMockSocket('user-1');
      await connectionHandler(socket);
      socket._trigger('reaction:remove', { messageId: '', emoji: '👍' });

      await new Promise((r) => setImmediate(r));
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Invalid message ID' });
    });

    it('should reject invalid emoji', async () => {
      const socket = createMockSocket('user-1');
      await connectionHandler(socket);
      socket._trigger('reaction:remove', { messageId: 'msg-1', emoji: '' });

      await new Promise((r) => setImmediate(r));
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Invalid emoji' });
    });

    it('should remove reaction and broadcast if found', async () => {
      const socket = createMockSocket('user-1');
      mockPrisma.reaction.findUnique.mockResolvedValue({
        id: 'reaction-1', message: { channelId: 'ch-1' },
      });
      mockPrisma.reaction.delete.mockResolvedValue({});

      const toEmit = vi.fn();
      io.to = vi.fn(() => ({ emit: toEmit }));

      await connectionHandler(socket);
      socket._trigger('reaction:remove', { messageId: 'msg-1', emoji: '👍' });

      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      expect(mockPrisma.reaction.delete).toHaveBeenCalledWith({ where: { id: 'reaction-1' } });
      expect(toEmit).toHaveBeenCalledWith('message:reaction', {
        messageId: 'msg-1', emoji: '👍', userId: 'user-1', action: 'remove',
      });
    });

    it('should do nothing if reaction not found', async () => {
      const socket = createMockSocket('user-1');
      mockPrisma.reaction.findUnique.mockResolvedValue(null);

      await connectionHandler(socket);
      socket._trigger('reaction:remove', { messageId: 'msg-1', emoji: '👍' });

      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      expect(mockPrisma.reaction.delete).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('should set user offline when last socket disconnects', async () => {
      // Use a unique user ID to avoid interference from module-level userSockets map
      const socket = createMockSocket('user-disconnect-1');
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-disconnect-1', username: 'testuser' });
      mockPrisma.user.update.mockResolvedValue({});

      await connectionHandler(socket);
      // Clear the online update call so we can verify the offline call
      mockPrisma.user.update.mockClear();
      socket.broadcast.emit.mockClear();
      socket._trigger('disconnect');

      // Flush microtasks for the async disconnect handler
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-disconnect-1' },
        data: { status: 'offline' },
      });
      expect(socket.broadcast.emit).toHaveBeenCalledWith('user:status', { userId: 'user-disconnect-1', status: 'offline' });
    });

    it('should not set offline if user has other sockets', async () => {
      const socket1 = createMockSocket('user-2');
      const socket2 = createMockSocket('user-2');
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-2', username: 'testuser2' });
      mockPrisma.user.update.mockResolvedValue({});

      await connectionHandler(socket1);
      await connectionHandler(socket2);

      mockPrisma.user.update.mockClear();
      socket1._trigger('disconnect');

      await new Promise((r) => setImmediate(r));
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });
});
