import type { Request, Response, NextFunction } from 'express';
import { vi } from 'vitest';

/**
 * Creates a mock Express Request with optional overrides.
 */
export function createMockRequest(overrides: Partial<Request> & Record<string, unknown> = {}): Request {
  const req = {
    headers: {},
    params: {},
    query: {},
    body: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    app: { get: vi.fn() },
    get: vi.fn(),
    ...overrides,
  } as unknown as Request;
  return req;
}

/**
 * Creates a mock Express Response with chained methods.
 */
export function createMockResponse(): Response & {
  _getStatusCode: () => number;
  _getJson: () => unknown;
  _getHeaders: () => Record<string, string>;
} {
  let statusCode = 200;
  let jsonBody: unknown;
  const headers: Record<string, string> = {};

  const res = {
    status: vi.fn(function (this: unknown, code: number) {
      statusCode = code;
      return this;
    }),
    json: vi.fn(function (this: unknown, body: unknown) {
      jsonBody = body;
      return this;
    }),
    setHeader: vi.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    header: vi.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    send: vi.fn(),
    end: vi.fn(),
    redirect: vi.fn(),
    cookie: vi.fn(),
    clearCookie: vi.fn(),
    _getStatusCode: () => statusCode,
    _getJson: () => jsonBody,
    _getHeaders: () => headers,
  } as unknown as Response & {
    _getStatusCode: () => number;
    _getJson: () => unknown;
    _getHeaders: () => Record<string, string>;
  };

  return res;
}

/**
 * Creates a mock NextFunction.
 */
export function createMockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

/**
 * Creates a mock AuthRequest with userId and optional workspaceId.
 */
export function createMockAuthRequest(
  userId: string = 'test-user-id',
  overrides: Partial<Request> & Record<string, unknown> = {}
): Request {
  return createMockRequest({
    userId,
    tokenId: 'test-token-id',
    workspaceId: undefined,
    workspaceRole: undefined,
    ...overrides,
  });
}

/**
 * Waits for all pending microtasks to flush.
 */
export function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
