import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextFunction, Response } from 'express';

vi.mock('../services/rbac', () => ({
  hasPermission: vi.fn(),
  hasAnyPermission: vi.fn(),
  hasAllPermissions: vi.fn(),
  getUserRole: vi.fn(),
}));

import { hasAllPermissions, hasAnyPermission, hasPermission, getUserRole } from '../services/rbac';
import { requireAdmin, requireAllPermissions, requireAnyPermission, requireModerator, requireOwner, requirePermission, requireRole } from './rbac';
import type { AuthRequest } from './auth';

type ResDouble = {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
};

function makeRes() {
  const res = {} as ResDouble;
  const json = vi.fn(() => res);
  const status = vi.fn(() => res);
  res.json = json;
  res.status = status;
  return { res, status, json };
}

describe('middleware/rbac', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requirePermission returns 401 when unauthenticated', async () => {
    const middleware = requirePermission('p1');

    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    const req = { userId: undefined, params: {}, body: {} } as unknown as AuthRequest;

    await middleware(req, res as unknown as Response, next);

    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('requirePermission returns 400 when workspaceId is missing', async () => {
    const middleware = requirePermission('p1');

    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    const req = { userId: 'u1', params: {}, body: {} } as unknown as AuthRequest;

    await middleware(req, res as unknown as Response, next);

    expect(status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('requirePermission returns 403 when permission denied', async () => {
    (hasPermission as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

    const middleware = requirePermission('p1');

    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    const req = { userId: 'u1', params: { workspaceId: 'w1' }, body: {} } as unknown as AuthRequest;

    await middleware(req, res as unknown as Response, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('requirePermission calls next when allowed', async () => {
    (hasPermission as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

    const middleware = requirePermission('p1');

    const { res } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    const req = { userId: 'u1', params: { workspaceId: 'w1' }, body: {} } as unknown as AuthRequest;

    await middleware(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('requireAnyPermission returns 403 when none match', async () => {
    (hasAnyPermission as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

    const middleware = requireAnyPermission(['p1', 'p2']);

    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    const req = { userId: 'u1', params: { workspaceId: 'w1' }, body: {} } as unknown as AuthRequest;

    await middleware(req, res as unknown as Response, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('requireAllPermissions returns 403 when missing any', async () => {
    (hasAllPermissions as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

    const middleware = requireAllPermissions(['p1', 'p2']);

    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    const req = { userId: 'u1', params: { workspaceId: 'w1' }, body: {} } as unknown as AuthRequest;

    await middleware(req, res as unknown as Response, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('requireRole returns 403 when role not authorized', async () => {
    (getUserRole as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce('member');

    const middleware = requireRole(['admin']);

    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    const req = { userId: 'u1', params: { workspaceId: 'w1' }, body: {} } as unknown as AuthRequest;

    await middleware(req, res as unknown as Response, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('requireRole calls next when role authorized', async () => {
    (getUserRole as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce('owner');

    const middleware = requireRole(['owner']);

    const { res } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    const req = { userId: 'u1', params: { workspaceId: 'w1' }, body: {} } as unknown as AuthRequest;

    await middleware(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('requireOwner/requireAdmin/requireModerator are role wrappers', async () => {
    (getUserRole as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce('owner');
    const { res } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await requireOwner()( { userId: 'u1', params: { workspaceId: 'w1' }, body: {} } as unknown as AuthRequest, res as unknown as Response, next);

    (getUserRole as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce('admin');
    await requireAdmin()( { userId: 'u1', params: { workspaceId: 'w1' }, body: {} } as unknown as AuthRequest, res as unknown as Response, next);

    (getUserRole as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce('moderator');
    await requireModerator()( { userId: 'u1', params: { workspaceId: 'w1' }, body: {} } as unknown as AuthRequest, res as unknown as Response, next);

    expect(next).toHaveBeenCalled();
  });
});
