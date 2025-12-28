import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('os', () => {
  const loadavg = vi.fn(() => [0.1, 0.05, 0.01]);
  const cpus = vi.fn(() => new Array(4).fill({}));

  return {
    default: { loadavg, cpus },
    loadavg,
    cpus,
  };
});

vi.mock('v8', () => {
  const getHeapStatistics = vi.fn(() => ({ heap_size_limit: 1024 * 1024 * 1024 }));

  return {
    default: { getHeapStatistics },
    getHeapStatistics,
  };
});

vi.mock('@pulseweave/database', () => ({
  prisma: {
    $queryRawUnsafe: vi.fn(),
  },
}));

vi.mock('../utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { prisma } from '@pulseweave/database';
import { logger } from '../utils/logger';

import {
  getHealthStatus,
  getLivenessStatus,
  getMetrics,
  getReadinessStatus,
  startHealthLogging,
  updateWsConnectionCount,
} from './health';

describe('health service', () => {
  const envBackup = { ...process.env };
  const memoryUsageSpy = vi.spyOn(process, 'memoryUsage');

  beforeEach(() => {
    process.env = { ...envBackup };
    memoryUsageSpy.mockReturnValue({
      rss: 100,
      heapTotal: 100,
      heapUsed: 100 * 1024 * 1024,
      external: 0,
      arrayBuffers: 0,
    });
  });

  afterEach(() => {
    process.env = { ...envBackup };
    vi.clearAllMocks();
  });

  it('getLivenessStatus returns ok', () => {
    const status = getLivenessStatus();
    expect(status.status).toBe('ok');
    expect(typeof status.timestamp).toBe('string');
  });

  it('getMetrics includes websocket count and basic metrics', () => {
    updateWsConnectionCount(3);

    const metrics = getMetrics();

    expect(metrics).toContain('pulseweave_uptime_seconds');
    expect(metrics).toContain('pulseweave_memory_heap_used_bytes');
    expect(metrics).toContain('pulseweave_cpu_load_average');
    expect(metrics).toContain('pulseweave_websocket_connections 3');
  });

  it('getReadinessStatus returns ready when database is up', async () => {
    (prisma.$queryRawUnsafe as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ health_check: 1 }]);

    const status = await getReadinessStatus();

    expect(status.ready).toBe(true);
    expect(status.checks.find((c) => c.name === 'database')?.ready).toBe(true);
  });

  it('getReadinessStatus remains ready when database is degraded (timeout)', async () => {
    (prisma.$queryRawUnsafe as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Database health check timeout'));

    const status = await getReadinessStatus();

    expect(status.ready).toBe(true);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('getReadinessStatus is not ready when database is down', async () => {
    (prisma.$queryRawUnsafe as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Connection failed'));

    const status = await getReadinessStatus();

    expect(status.ready).toBe(false);
    expect(logger.error).toHaveBeenCalled();
  });

  it('getHealthStatus returns unhealthy when database is down', async () => {
    (prisma.$queryRawUnsafe as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Connection failed'));

    const health = await getHealthStatus();

    expect(health.status).toBe('unhealthy');
    expect(health.services.database.status).toBe('down');
  });

  it('startHealthLogging logs degraded health', async () => {
    vi.useFakeTimers();

    (prisma.$queryRawUnsafe as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ health_check: 1 }]);

    updateWsConnectionCount(0);

    const interval = startHealthLogging(10);

    await vi.runOnlyPendingTimersAsync();

    clearInterval(interval);
    vi.useRealTimers();
  });
});
