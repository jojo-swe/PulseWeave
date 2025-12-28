import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server as HttpServer } from 'node:http';
import type { Server as SocketIoServer } from 'socket.io';

vi.mock('@pulseweave/database', () => ({
  prisma: {
    $disconnect: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { prisma } from '@pulseweave/database';
import { logger } from './logger';

import { checkDatabaseHealth, setupGracefulShutdown } from './graceful-shutdown';

describe('utils/graceful-shutdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('checkDatabaseHealth returns true when query succeeds', async () => {
    (prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ ok: 1 }]);

    await expect(checkDatabaseHealth()).resolves.toBe(true);
  });

  it('checkDatabaseHealth returns false when query fails', async () => {
    (prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('fail'));

    await expect(checkDatabaseHealth()).resolves.toBe(false);
    expect(logger.error).toHaveBeenCalled();
  });

  it('setupGracefulShutdown closes resources on SIGTERM', async () => {
    vi.useFakeTimers();

    const handlers = new Map<string, () => unknown>();
    type ProcessEventName = Parameters<typeof process.on>[0];
    type ProcessListener = Parameters<typeof process.on>[1];

    const onSpy = vi.spyOn(process, 'on').mockImplementation((event: ProcessEventName, listener: ProcessListener) => {
      if (typeof event === 'string' && (event === 'SIGTERM' || event === 'SIGINT') && typeof listener === 'function') {
        handlers.set(event, listener as unknown as () => unknown);
      }
      return process;
    });

    let exitCode: number | undefined;
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      exitCode = code;
      return undefined as never;
    }) as unknown as typeof process.exit);

    const httpServerDouble = {
      close: vi.fn((cb: (err?: Error) => void) => cb()),
    };

    const ioDouble = {
      disconnectSockets: vi.fn(),
      close: vi.fn((cb: () => void) => cb()),
    };

    (prisma.$disconnect as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    setupGracefulShutdown(httpServerDouble as unknown as HttpServer, ioDouble as unknown as SocketIoServer);

    const sigtermHandler = handlers.get('SIGTERM');
    expect(sigtermHandler).toBeDefined();

    await Promise.resolve(sigtermHandler?.());

    expect(httpServerDouble.close).toHaveBeenCalledTimes(1);
    expect(ioDouble.disconnectSockets).toHaveBeenCalledWith(true);
    expect(ioDouble.close).toHaveBeenCalledTimes(1);
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
    expect(exitCode).toBe(0);

    onSpy.mockRestore();
    exitSpy.mockRestore();
    vi.useRealTimers();
  });
});
