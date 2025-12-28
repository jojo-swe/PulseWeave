import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('utils/logger', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...envBackup };
    vi.restoreAllMocks();
  });

  it('logs info/warn/error when LOG_LEVEL=debug', async () => {
    process.env.LOG_LEVEL = 'debug';
    process.env.NODE_ENV = 'development';

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    vi.resetModules();
    const { logger } = await import('./logger');

    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(logSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('does not log below current level when LOG_LEVEL=error', async () => {
    process.env.LOG_LEVEL = 'error';
    process.env.NODE_ENV = 'development';

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    vi.resetModules();
    const { logger } = await import('./logger');

    logger.info('i');
    logger.warn('w');

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('logger.request logs with method/path/status', async () => {
    process.env.LOG_LEVEL = 'debug';

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    vi.resetModules();
    const { logger } = await import('./logger');

    logger.request('GET', '/x', 200, 5, 'u1');

    const message = String(logSpy.mock.calls[0]?.[0]);
    expect(message).toContain('GET /x 200');
  });

  it('logger.query only logs when LOG_QUERIES=true', async () => {
    process.env.LOG_LEVEL = 'debug';

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    vi.resetModules();
    const { logger } = await import('./logger');

    process.env.LOG_QUERIES = 'false';
    logger.query('SELECT 1', 3);
    expect(logSpy).not.toHaveBeenCalled();

    process.env.LOG_QUERIES = 'true';
    logger.query('SELECT 1', 3);
    expect(logSpy).toHaveBeenCalled();
  });
});
