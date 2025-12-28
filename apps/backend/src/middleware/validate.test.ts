import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { NextFunction, Request, Response } from 'express';

import { validate, validateAll } from './validate';

function makeRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };

  res.status.mockImplementation(() => res);

  return res;
}

describe('validate middleware', () => {
  it('validate() parses target and replaces request data', () => {
    const schema = z.object({ count: z.coerce.number().int().min(1) });
    const middleware = validate(schema, 'query');

    const req = { query: { count: '2' } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();

    middleware(req, res as unknown as Response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect((req as unknown as { query: unknown }).query).toEqual({ count: 2 });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('validate() returns 400 with details on zod errors', () => {
    const schema = z.object({ name: z.string().min(2) });
    const middleware = validate(schema, 'body');

    const req = { body: { name: 'a' } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();

    middleware(req, res as unknown as Response, next as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('validateAll() aggregates errors across targets', () => {
    const middleware = validateAll({
      body: z.object({ a: z.string().min(2) }),
      query: z.object({ q: z.string().min(3) }),
    });

    const req = { body: { a: 'x' }, query: { q: 'y' } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();

    middleware(req, res as unknown as Response, next as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('validateAll() parses all targets when valid', () => {
    const middleware = validateAll({
      body: z.object({ a: z.string().min(2) }),
      query: z.object({ q: z.string().min(3) }),
    });

    const req = { body: { a: 'ok' }, query: { q: 'yes' } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();

    middleware(req, res as unknown as Response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
