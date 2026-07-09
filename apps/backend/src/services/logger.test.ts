import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('logger service', () => {
  const consoleSpies: ReturnType<typeof vi.fn>[] = [];
  let consoleDebug: ReturnType<typeof vi.fn>;
  let consoleInfo: ReturnType<typeof vi.fn>;
  let consoleWarn: ReturnType<typeof vi.fn>;
  let consoleError: ReturnType<typeof vi.fn>;
  let consoleLog: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => undefined as never) as never;
    consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined as never) as never;
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined as never) as never;
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined as never) as never;
    consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined as never) as never;
    consoleSpies.push(consoleDebug, consoleInfo, consoleWarn, consoleError, consoleLog);
  });

  afterEach(() => {
    consoleSpies.forEach(s => s.mockRestore());
    consoleSpies.length = 0;
  });

  describe('initErrorReporting', () => {
    it('should skip initialization if SENTRY_DSN is not set', async () => {
      delete process.env.SENTRY_DSN;
      const { initErrorReporting } = await import('./logger');
      await initErrorReporting();
      expect(consoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Sentry DSN not configured')
      );
    });
  });

  describe('logDebug', () => {
    it('should log debug message when LOG_LEVEL allows it', async () => {
      process.env.LOG_LEVEL = 'debug';
      vi.resetModules();
      const { logDebug } = await import('./logger');
      logDebug('test message');
      expect(consoleDebug).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG]')
      );
      expect(consoleDebug).toHaveBeenCalledWith(
        expect.stringContaining('test message')
      );
    });

    it('should not log debug when LOG_LEVEL is info', async () => {
      process.env.LOG_LEVEL = 'info';
      vi.resetModules();
      const { logDebug } = await import('./logger');
      logDebug('test message');
      expect(consoleDebug).not.toHaveBeenCalled();
    });

    it('should include context in log message', async () => {
      process.env.LOG_LEVEL = 'debug';
      vi.resetModules();
      const { logDebug } = await import('./logger');
      logDebug('test', { userId: 'u1' });
      expect(consoleDebug).toHaveBeenCalledWith(
        expect.stringContaining('"userId":"u1"')
      );
    });
  });

  describe('logInfo', () => {
    it('should log info message', async () => {
      process.env.LOG_LEVEL = 'info';
      vi.resetModules();
      const { logInfo } = await import('./logger');
      logInfo('info message');
      expect(consoleInfo).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]')
      );
    });
  });

  describe('logWarn', () => {
    it('should log warning message', async () => {
      process.env.LOG_LEVEL = 'info';
      vi.resetModules();
      const { logWarn } = await import('./logger');
      logWarn('warning message');
      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('[WARN]')
      );
    });
  });

  describe('logError', () => {
    it('should log error message', async () => {
      process.env.LOG_LEVEL = 'info';
      vi.resetModules();
      const { logError } = await import('./logger');
      logError('error message');
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]')
      );
    });

    it('should log error object when provided', async () => {
      process.env.LOG_LEVEL = 'info';
      vi.resetModules();
      const { logError } = await import('./logger');
      const err = new Error('test error');
      logError('error message', err);
      expect(consoleError).toHaveBeenCalledWith(err);
    });

    it('should wrap non-Error objects', async () => {
      process.env.LOG_LEVEL = 'info';
      vi.resetModules();
      const { logError } = await import('./logger');
      logError('error message', 'string error');
      // Should call console.error twice: formatted message + error object
      expect(consoleError).toHaveBeenCalledTimes(2);
    });
  });

  describe('logger object', () => {
    it('should export all log functions', async () => {
      process.env.LOG_LEVEL = 'debug';
      vi.resetModules();
      const { logger } = await import('./logger');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.captureMessage).toBe('function');
      expect(typeof logger.setUserContext).toBe('function');
      expect(typeof logger.clearUserContext).toBe('function');
      expect(typeof logger.addBreadcrumb).toBe('function');
    });
  });

  describe('errorHandler middleware', () => {
    it('should return 500 and log error', async () => {
      process.env.LOG_LEVEL = 'info';
      process.env.NODE_ENV = 'development';
      vi.resetModules();
      const { errorHandler } = await import('./logger');

      const err = new Error('test error');
      const req = { method: 'GET', url: '/test', body: {}, id: 'req-1', userId: 'u1' } as never;
      const status = vi.fn().mockReturnThis();
      const json = vi.fn();
      const res = { status, json } as never;
      const next = vi.fn() as never;

      const middleware = errorHandler();
      middleware(err, req, res, next);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'test error' });
    });

    it('should hide error details in production', async () => {
      process.env.LOG_LEVEL = 'info';
      process.env.NODE_ENV = 'production';
      vi.resetModules();
      const { errorHandler } = await import('./logger');

      const err = new Error('sensitive info');
      const req = { method: 'GET', url: '/test', body: {} } as never;
      const status = vi.fn().mockReturnThis();
      const json = vi.fn();
      const res = { status, json } as never;
      const next = vi.fn() as never;

      const middleware = errorHandler();
      middleware(err, req, res, next);

      expect(json).toHaveBeenCalledWith({ error: 'Internal server error' });
      delete process.env.NODE_ENV;
    });
  });

  describe('Sentry functions (no DSN)', () => {
    it('captureMessage should be a no-op without Sentry', async () => {
      delete process.env.SENTRY_DSN;
      vi.resetModules();
      const { captureMessage } = await import('./logger');
      expect(() => captureMessage('test')).not.toThrow();
    });

    it('setUserContext should be a no-op without Sentry', async () => {
      delete process.env.SENTRY_DSN;
      vi.resetModules();
      const { setUserContext } = await import('./logger');
      expect(() => setUserContext('u1', 'test@test.com', 'test')).not.toThrow();
    });

    it('clearUserContext should be a no-op without Sentry', async () => {
      delete process.env.SENTRY_DSN;
      vi.resetModules();
      const { clearUserContext } = await import('./logger');
      expect(() => clearUserContext()).not.toThrow();
    });

    it('addBreadcrumb should be a no-op without Sentry', async () => {
      delete process.env.SENTRY_DSN;
      vi.resetModules();
      const { addBreadcrumb } = await import('./logger');
      expect(() => addBreadcrumb('cat', 'msg')).not.toThrow();
    });
  });
});
