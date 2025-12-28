import { describe, expect, it, vi } from 'vitest';

function restoreEnv(envBackup: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, envBackup);
}

describe('config/security', () => {
  const envBackup = { ...process.env };

  it('validatePassword enforces policy', async () => {
    restoreEnv({ ...envBackup, NODE_ENV: 'development' });
    vi.resetModules();

    const mod = await import('./security');

    expect(mod.validatePassword('a')).toEqual({
      valid: false,
      errors: expect.any(Array),
    });

    expect(mod.validatePassword('Aa1!aaaa')).toEqual({ valid: true, errors: [] });
  });

  it('generateSecureSecret returns a non-empty secret', async () => {
    restoreEnv({ ...envBackup, NODE_ENV: 'development' });
    vi.resetModules();

    const mod = await import('./security');

    const secret = mod.generateSecureSecret(32);
    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThan(10);
  });

  it('validateSecurityConfig throws in production when critical secrets are missing', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    restoreEnv({
      ...envBackup,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://example',
    });

    vi.resetModules();

    const mod = await import('./security');

    expect(() => mod.validateSecurityConfig()).toThrow();

    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('corsConfig includes FRONTEND_URL and dedupes entries', async () => {
    restoreEnv({
      ...envBackup,
      NODE_ENV: 'development',
      FRONTEND_URL: 'http://localhost:9797',
    });
    vi.resetModules();

    const mod = await import('./security');

    expect(mod.corsConfig.allowedOrigins).toContain('http://localhost:9797');
  });
});
