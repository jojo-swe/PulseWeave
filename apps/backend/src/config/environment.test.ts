import { describe, expect, it, vi } from 'vitest';

vi.mock('../utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

function restoreEnv(envBackup: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, envBackup);
}

describe('config/environment', () => {
  const envBackup = { ...process.env };

  it('getConfig throws before loadEnvironment', async () => {
    restoreEnv({ ...envBackup, NODE_ENV: 'development', DATABASE_URL: 'postgres://example' });
    vi.resetModules();

    const mod = await import('./environment');

    expect(() => mod.getConfig()).toThrow('Environment not loaded');
  });

  it('loadEnvironment generates secrets in development when missing', async () => {
    restoreEnv({
      ...envBackup,
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://example',
    });
    delete process.env.JWT_SECRET;
    delete process.env.COOKIE_SECRET;

    vi.resetModules();

    const mod = await import('./environment');
    const config = mod.loadEnvironment();

    expect(config.NODE_ENV).toBe('development');
    expect(typeof config.JWT_SECRET).toBe('string');
    expect(config.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(config.PORT).toBe(9090);

    expect(mod.isDevelopment()).toBe(true);
    expect(mod.getCorsOrigins().length).toBeGreaterThan(0);
  });

  it('loadEnvironment throws in production when COOKIE_SECRET is missing', async () => {
    restoreEnv({
      ...envBackup,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://example',
      JWT_SECRET: 'a'.repeat(64),
    });
    delete process.env.COOKIE_SECRET;

    vi.resetModules();

    const mod = await import('./environment');

    expect(() => mod.loadEnvironment()).toThrow();
  });

  it('maskSecret masks short and long secrets', async () => {
    restoreEnv({
      ...envBackup,
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://example',
      JWT_SECRET: 'a'.repeat(64),
      COOKIE_SECRET: 'b'.repeat(64),
    });

    vi.resetModules();
    const mod = await import('./environment');

    expect(mod.maskSecret('short')).toBe('****');
    expect(mod.maskSecret('1234567890abcdef')).toBe('1234...cdef');
  });
});
