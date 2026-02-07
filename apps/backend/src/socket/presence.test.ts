import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@pulseweave/database', () => ({
  prisma: {
    user: {
      update: vi.fn(),
    },
  },
}));

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { prisma } from '@pulseweave/database';
import { trackConnection, isFirstConnection, registerDisconnectHandler } from './presence';

type PrismaMock = {
  user: { update: ReturnType<typeof vi.fn> };
};
const prismaMock = prisma as unknown as PrismaMock;

function createMockSocket(socketId: string) {
  const listeners: Record<string, (...args: unknown[]) => Promise<void> | void> = {};
  return {
    id: socketId,
    on(event: string, handler: (...args: unknown[]) => Promise<void> | void) {
      listeners[event] = handler;
    },
    broadcast: {
      emit: vi.fn(),
    },
    async trigger(event: string) {
      await listeners[event]?.();
    },
  };
}

describe('presence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('trackConnection', () => {
    it('tracks a user socket connection', () => {
      trackConnection('user-1', 'socket-1');
      expect(isFirstConnection('user-1')).toBe(true);
    });

    it('tracks multiple connections for the same user', () => {
      trackConnection('user-2', 'socket-a');
      trackConnection('user-2', 'socket-b');
      expect(isFirstConnection('user-2')).toBe(false);
    });
  });

  describe('registerDisconnectHandler', () => {
    it('sets user offline when last socket disconnects', async () => {
      const userId = 'disconnect-user-1';
      const socket = createMockSocket('disc-socket-1');
      trackConnection(userId, socket.id);

      prismaMock.user.update.mockResolvedValue({});

      const io = { on: vi.fn() };
      registerDisconnectHandler(io as any, socket as any, userId);

      await socket.trigger('disconnect');

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { status: 'offline' },
      });
      expect(socket.broadcast.emit).toHaveBeenCalledWith('user:status', {
        userId,
        status: 'offline',
      });
    });

    it('does not set user offline when other sockets remain', async () => {
      const userId = 'disconnect-user-2';
      const socket1 = createMockSocket('disc-socket-2a');
      const socket2 = createMockSocket('disc-socket-2b');

      trackConnection(userId, socket1.id);
      trackConnection(userId, socket2.id);

      const io = { on: vi.fn() };
      registerDisconnectHandler(io as any, socket1 as any, userId);

      await socket1.trigger('disconnect');

      expect(prismaMock.user.update).not.toHaveBeenCalled();
      expect(socket1.broadcast.emit).not.toHaveBeenCalled();
    });
  });
});
