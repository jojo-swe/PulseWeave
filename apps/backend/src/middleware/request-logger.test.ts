import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../utils/logger', () => ({
  logger: {
    request: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { logger } from '../utils/logger';
import { requestLogger } from './request-logger';

type ReqWithContext = Request & {
  requestId?: string;
  userId?: string;
};

type ResWithTracking = EventEmitter & {
  setHeader: (name: string, value: string) => void;
  statusCode: number;
  headers: Record<string, string>;
};

function makeRes(statusCode: number): ResWithTracking {
  const headers: Record<string, string> = {};
  return Object.assign(new EventEmitter(), {
    headers,
    statusCode,
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  }) as ResWithTracking;
}

describe('middleware/request-logger', () => {
  const dateNowSpy = vi.spyOn(Date, 'now');
  const randomSpy = vi.spyOn(Math, 'random');

  beforeEach(() => {
    vi.clearAllMocks();
    dateNowSpy.mockReturnValue(1700000000000);
    randomSpy.mockReturnValue(0.123456);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('attaches requestId and logs on finish', () => {
    const req = { method: 'GET', path: '/api/x' } as unknown as ReqWithContext;
    const resTracking = makeRes(200);
    const res = resTracking as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    requestLogger(req, res, next);

    expect(req.requestId).toBeDefined();
    expect(resTracking.headers['X-Request-ID']).toBe(req.requestId);

    resTracking.emit('finish');

    expect(logger.request).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('skips logging for /health', () => {
    const req = { method: 'GET', path: '/health' } as unknown as ReqWithContext;
    const resTracking = makeRes(200);
    const res = resTracking as unknown as Response;

    requestLogger(req, res, (() => undefined) as unknown as NextFunction);
    resTracking.emit('finish');

    expect(logger.request).not.toHaveBeenCalled();
  });

  it('skips logging for /uploads/*', () => {
    const req = { method: 'GET', path: '/uploads/file.png' } as unknown as ReqWithContext;
    const resTracking = makeRes(200);
    const res = resTracking as unknown as Response;

    requestLogger(req, res, (() => undefined) as unknown as NextFunction);
    resTracking.emit('finish');

    expect(logger.request).not.toHaveBeenCalled();
  });
});
