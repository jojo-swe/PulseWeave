import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('memory-manager', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup, LOG_LEVEL: 'error' };
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('BoundedCache enforces expiration on get()', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

    vi.resetModules();
    const { BoundedCache } = await import('./memory-manager');

    const cache = new BoundedCache<string, { value: string; expiresAt?: number }>({ maxSize: 10 });

    cache.set('k1', { value: 'v1', expiresAt: Date.now() + 1000 });
    expect(cache.get('k1')?.value).toBe('v1');

    vi.setSystemTime(Date.now() + 2000);
    expect(cache.get('k1')).toBeUndefined();

    vi.useRealTimers();
  });

  it('BoundedCache evicts oldest entries when maxSize is exceeded', async () => {
    vi.resetModules();
    const { BoundedCache } = await import('./memory-manager');

    const cache = new BoundedCache<string, { value: string }>({ maxSize: 2 });

    cache.set('k1', { value: 'v1' });
    cache.set('k2', { value: 'v2' });
    cache.set('k3', { value: 'v3' });

    expect(cache.get('k1')).toBeUndefined();
    expect(cache.get('k2')?.value).toBe('v2');
    expect(cache.get('k3')?.value).toBe('v3');
    expect(cache.size).toBe(2);
  });

  it('BoundedCache cleanup() removes expired entries', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

    vi.resetModules();
    const { BoundedCache } = await import('./memory-manager');

    const cache = new BoundedCache<string, { value: string; expiresAt?: number }>({ maxSize: 10 });

    cache.set('k1', { value: 'v1', expiresAt: Date.now() - 1 });
    cache.set('k2', { value: 'v2', expiresAt: Date.now() + 1000 });

    const removed = cache.cleanup();
    expect(removed).toBe(1);
    expect(cache.get('k1')).toBeUndefined();
    expect(cache.get('k2')?.value).toBe('v2');

    vi.useRealTimers();
  });
});
