import http from 'http';
import { AddressInfo } from 'net';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

import {
  createHttpRedirectServer,
  getSslConfig,
  loadSslCertificates,
  requireHttps,
} from './ssl';

function restoreEnv(envBackup: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, envBackup);
}

describe('ssl middleware', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    restoreEnv(envBackup);
  });

  afterEach(() => {
    restoreEnv(envBackup);
  });

  it('getSslConfig returns defaults when env vars are not set', () => {
    delete process.env.SSL_ENABLED;
    delete process.env.SSL_KEY_PATH;
    delete process.env.SSL_CERT_PATH;
    delete process.env.SSL_CA_PATH;
    delete process.env.SSL_PORT;
    delete process.env.SSL_HTTP_REDIRECT;
    delete process.env.SSL_MIN_VERSION;

    const config = getSslConfig();

    expect(config.enabled).toBe(false);
    expect(config.keyPath).toBe('./certs/server.key');
    expect(config.certPath).toBe('./certs/server.crt');
    expect(config.caPath).toBeUndefined();
    expect(config.port).toBe(3443);
    expect(config.httpRedirect).toBe(true);
    expect(config.minVersion).toBe('TLSv1.2');
  });

  it('loadSslCertificates returns null when SSL is disabled', () => {
    const options = loadSslCertificates({
      enabled: false,
      keyPath: 'unused',
      certPath: 'unused',
      port: 3443,
      httpRedirect: true,
    });

    expect(options).toBeNull();
  });

  it('loadSslCertificates loads key and cert when present', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulseweave-ssl-'));
    const keyPath = path.join(tmpDir, 'server.key');
    const certPath = path.join(tmpDir, 'server.crt');

    fs.writeFileSync(keyPath, 'test-key');
    fs.writeFileSync(certPath, 'test-cert');

    const options = loadSslCertificates({
      enabled: true,
      keyPath,
      certPath,
      port: 3443,
      httpRedirect: true,
      minVersion: 'TLSv1.2',
    });

    expect(options).not.toBeNull();
    expect(Buffer.isBuffer(options?.key)).toBe(true);
    expect(Buffer.isBuffer(options?.cert)).toBe(true);
  });

  it('createHttpRedirectServer redirects to canonical host when host is not allowlisted', async () => {
    process.env.CANONICAL_HOST = 'canonical.example';
    process.env.ALLOWED_REDIRECT_HOSTS = 'allowed.example';

    const server = createHttpRedirectServer(9443);

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected server to be listening on a TCP port');
    }
    const port = (address as AddressInfo).port;

    const location = await new Promise<string>((resolve, reject) => {
      const req = http.get(
        {
          hostname: '127.0.0.1',
          port,
          path: '/test',
          headers: { Host: 'evil.example' },
        },
        (res) => {
          const header = res.headers.location;
          res.resume();
          res.on('end', () => resolve(String(header || '')));
        }
      );
      req.on('error', reject);
    });

    await new Promise<void>((resolve) => server.close(() => resolve()));

    expect(location).toBe('https://canonical.example:9443/test');
  });

  it('requireHttps calls next outside production', () => {
    process.env.NODE_ENV = 'development';

    const next = vi.fn();
    const res = { redirect: vi.fn() } as unknown as Pick<Response, 'redirect'>;
    const req = { path: '/', headers: {}, secure: false } as unknown as Pick<Request, 'path' | 'headers' | 'secure'>;

    requireHttps(req as unknown as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('requireHttps redirects using canonical host when not secure', () => {
    process.env.NODE_ENV = 'production';
    process.env.SSL_ENABLED = 'true';
    process.env.CANONICAL_HOST = 'canonical.example';
    process.env.ALLOWED_REDIRECT_HOSTS = 'allowed.example';

    const next = vi.fn();
    const res = { redirect: vi.fn() } as unknown as Pick<Response, 'redirect'>;

    const req = {
      path: '/channels',
      originalUrl: '/channels?x=1',
      secure: false,
      hostname: 'ignored.example',
      headers: {},
      get: (name: string) => (name.toLowerCase() === 'host' ? 'evil.example' : undefined),
    } as unknown;

    requireHttps(req as Request, res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(301, 'https://canonical.example/channels?x=1');
  });

  it('requireHttps redirects using allowlisted host when present', () => {
    process.env.NODE_ENV = 'production';
    process.env.SSL_ENABLED = 'true';
    process.env.CANONICAL_HOST = 'canonical.example';
    process.env.ALLOWED_REDIRECT_HOSTS = 'allowed.example';

    const next = vi.fn();
    const res = { redirect: vi.fn() } as unknown as Pick<Response, 'redirect'>;

    const req = {
      path: '/channels',
      originalUrl: '/channels',
      secure: false,
      hostname: 'ignored.example',
      headers: {},
      get: (name: string) => (name.toLowerCase() === 'host' ? 'Allowed.Example:1234' : undefined),
    } as unknown;

    requireHttps(req as Request, res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(301, 'https://allowed.example/channels');
  });
});
