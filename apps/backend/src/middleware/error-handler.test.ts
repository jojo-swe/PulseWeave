import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { NextFunction, Request, Response } from 'express';

vi.mock('@pulseweave/database', () => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    meta?: unknown;

    constructor(code: string, meta?: unknown) {
      super('KnownRequestError');
      this.code = code;
      this.meta = meta;
    }
  }

  class PrismaClientValidationError extends Error {
    constructor() {
      super('ValidationError');
    }
  }

  return {
    prisma: {},
    Prisma: {
      PrismaClientKnownRequestError,
      PrismaClientValidationError,
    },
  };
});

vi.mock('../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { AppError, Errors, asyncHandler, errorHandler, notFoundHandler } from './error-handler';
import { Prisma } from '@pulseweave/database';

type PrismaErrorCtors = {
  PrismaClientKnownRequestError: new (code: string, meta?: unknown) => Error;
  PrismaClientValidationError: new () => Error;
};

function makeRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };

  res.status.mockImplementation(() => res);

  return res;
}

describe('error-handler middleware', () => {
  it('handles AppError', () => {
    const err = new AppError('bad', 400, 'BAD');
    const req = { method: 'GET', path: '/x', ip: '1.2.3.4' } as unknown as Request;
    const res = makeRes();

    errorHandler(err, req, res as unknown as Response, (() => undefined) as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'bad', code: 'BAD' });
  });

  it('handles ZodError', () => {
    let zodError: unknown;
    try {
      z.object({ name: z.string().min(2) }).parse({ name: 'a' });
    } catch (e) {
      zodError = e;
    }

    const req = { method: 'POST', path: '/x', ip: '1.2.3.4' } as unknown as Request;
    const res = makeRes();

    errorHandler(zodError as Error, req, res as unknown as Response, (() => undefined) as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalled();
  });

  it('handles Prisma known request errors (P2002)', () => {
    const prismaErrors = Prisma as unknown as PrismaErrorCtors;
    const err = new prismaErrors.PrismaClientKnownRequestError('P2002', { target: ['email'] });
    const req = { method: 'POST', path: '/x', ip: '1.2.3.4' } as unknown as Request;
    const res = makeRes();

    errorHandler(err, req, res as unknown as Response, (() => undefined) as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'A record with this email already exists',
      code: 'CONFLICT',
    });
  });

  it('handles Prisma validation errors', () => {
    const prismaErrors = Prisma as unknown as PrismaErrorCtors;
    const err = new prismaErrors.PrismaClientValidationError();
    const req = { method: 'POST', path: '/x', ip: '1.2.3.4' } as unknown as Request;
    const res = makeRes();

    errorHandler(err, req, res as unknown as Response, (() => undefined) as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid data provided',
      code: 'VALIDATION_ERROR',
    });
  });

  it('handles JWT errors', () => {
    const invalidToken = new Error('bad');
    invalidToken.name = 'JsonWebTokenError';

    const req = { method: 'GET', path: '/x', ip: '1.2.3.4' } as unknown as Request;
    const res = makeRes();

    errorHandler(invalidToken, req, res as unknown as Response, (() => undefined) as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token', code: 'INVALID_TOKEN' });
  });

  it('handles unknown errors with 500', () => {
    const err = new Error('boom');
    const req = { method: 'GET', path: '/x', ip: '1.2.3.4' } as unknown as Request;
    const res = makeRes();

    errorHandler(err, req, res as unknown as Response, (() => undefined) as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalled();
  });

  it('notFoundHandler responds with 404', () => {
    const req = { method: 'GET', path: '/missing' } as unknown as Request;
    const res = makeRes();

    notFoundHandler(req, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Route GET /missing not found',
      code: 'ROUTE_NOT_FOUND',
    });
  });

  it('asyncHandler forwards rejections to next', async () => {
    const expected = new Error('reject');
    const handler = asyncHandler(async () => {
      throw expected;
    });

    const next = vi.fn();
    handler({} as Request, {} as Response, next);

    await Promise.resolve();
    expect(next).toHaveBeenCalledWith(expected);
  });

  it('Errors factories produce AppError with expected codes', () => {
    expect(Errors.unauthorized().statusCode).toBe(401);
    expect(Errors.forbidden().statusCode).toBe(403);
    expect(Errors.notFound('X').statusCode).toBe(404);
  });
});
