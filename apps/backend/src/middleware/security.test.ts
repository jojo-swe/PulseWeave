import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

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

    // logger.warn internally calls console.warn with formatted output
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() => validateEnvironment()).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('logSecurityEvent writes structured JSON to console', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    logSecurityEvent('LOGIN_FAILED', { ip: '1.2.3.4' });

    const callArg = String(logSpy.mock.calls[0]?.[0]);
    // logger.info formats as [timestamp] INFO: <message>, extract the JSON part
    const jsonStart = callArg.indexOf('{');
    const jsonStr = jsonStart >= 0 ? callArg.slice(jsonStart) : callArg;
    const parsed = JSON.parse(jsonStr) as { type: string; event: string; ip: string };

    expect(parsed.type).toBe('SECURITY_EVENT');
    expect(parsed.event).toBe('LOGIN_FAILED');
    expect(parsed.ip).toBe('1.2.3.4');
  });
});
