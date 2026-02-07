import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { logger } from '../utils/logger';
import { logSecurityEvent, sanitizeBody, sanitizeInput, sanitizePlainText, validateEnvironment } from './security';

describe('middleware/security', () => {
  const envBackup = { ...process.env };

  type SanitizedBody = {
    content: string;
    name: string;
  };

  beforeEach(() => {
    process.env = { ...envBackup };
  });

  afterEach(() => {
    process.env = { ...envBackup };
    vi.restoreAllMocks();
  });

  it('sanitizeInput strips scripts and hardens links', () => {
    const input = '<script>alert(1)</script><a href="https://example.com">link</a>';
    const output = sanitizeInput(input);

    expect(output.toLowerCase()).not.toContain('<script');
    expect(output).toContain('href="https://example.com"');
    expect(output).toContain('target="_blank"');
    expect(output).toContain('rel="noopener noreferrer nofollow"');
  });

  it('sanitizePlainText strips all HTML', () => {
    expect(sanitizePlainText('<b>Hello</b> <i>World</i>')).toBe('Hello World');
  });

  it('sanitizeBody sanitizes common fields and plain text fields', () => {
    const req = {
      body: {
        content: '<script>alert(1)</script><b>ok</b>',
        name: '<b>Alice</b>',
      },
    } as unknown as Request<unknown, unknown, SanitizedBody>;

    const next = vi.fn() as unknown as NextFunction;

    sanitizeBody(req, {} as Response, next);

    expect(req.body.content.toLowerCase()).not.toContain('<script');
    expect(req.body.name).toBe('Alice');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('validateEnvironment throws when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;

    expect(() => validateEnvironment()).toThrow('Environment validation failed');
  });

  it('validateEnvironment warns when JWT_SECRET is missing', () => {
    process.env.DATABASE_URL = 'postgres://example';
    delete process.env.JWT_SECRET;

    const loggerWarn = vi.mocked(logger.warn);

    expect(() => validateEnvironment()).not.toThrow();
    expect(loggerWarn).toHaveBeenCalled();
  });

  it('logSecurityEvent writes structured event via logger', () => {
    const loggerInfo = vi.mocked(logger.info);

    logSecurityEvent('LOGIN_FAILED', { ip: '1.2.3.4' });

    expect(loggerInfo).toHaveBeenCalledWith(
      'Security event',
      expect.objectContaining({
        type: 'SECURITY_EVENT',
        event: 'LOGIN_FAILED',
        ip: '1.2.3.4',
      }),
    );
  });
});
