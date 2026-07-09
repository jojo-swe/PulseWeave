import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('@pulseweave/database', () => ({
  prisma: {
    workspaceMember: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    channelMember: {
      deleteMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    role: {
      findMany: vi.fn(),
    },
    permission: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  Prisma: {},
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-password'),
    compare: vi.fn(),
  },
}));

const { assignRole, getUserPermissions, PERMISSIONS } = vi.hoisted(() => ({
  assignRole: vi.fn(),
  getUserPermissions: vi.fn(),
  PERMISSIONS: {
    workspace: { read: 'workspace.read', manageRoles: 'workspace.manageRoles', manageMembers: 'workspace.manageMembers', viewAuditLog: 'workspace.viewAuditLog' },
    user: { read: 'user.read', ban: 'user.ban' },
  },
}));
vi.mock('../services/rbac', () => ({ assignRole, getUserPermissions, PERMISSIONS }));

vi.mock('../middleware/auth', () => ({
  authenticateToken: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { userId: string }).userId = 'test-user-id';
    next();
  },
  AuthRequest: class AuthRequest {},
}));

vi.mock('../middleware/rbac', () => ({
  requireAdmin: (...args: unknown[]) => {
    if (typeof args[0] === 'function') {
      return (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();
    }
    if (args.length >= 3 && typeof args[2] === 'function') {
      (args[2] as express.NextFunction)();
      return;
    }
    return (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();
  },
  requireOwner: (...args: unknown[]) => {
    if (typeof args[0] === 'function') {
      return (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();
    }
    if (args.length >= 3 && typeof args[2] === 'function') {
      (args[2] as express.NextFunction)();
      return;
    }
    return (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();
  },
  requirePermission: (_perm: string) => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { prisma } from '@pulseweave/database';
import bcrypt from 'bcryptjs';
import { adminRouter } from './admin';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof Error) {
      const status = (err as Error & { statusCode?: number }).statusCode ?? 500;
      res.status(status).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Unknown error' });
    }
  });
  return app;
}

describe('admin routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /admin/workspaces/:workspaceId/users', () => {
    it('should list users in workspace', async () => {
      vi.mocked(prisma.workspaceMember.findMany).mockResolvedValue([
        {
          id: 'mem-1', roleId: 'r1', roleName: 'member', joinedAt: new Date(), invitedBy: null,
          user: { id: 'u1', email: 'u1@test.com', username: 'user1', displayName: 'User 1', avatarUrl: null, status: 'online', mfaEnabled: false, isActive: true, isVerified: true, lastLoginAt: null, createdAt: new Date() },
          role: { id: 'r1', name: 'member', description: 'Member' },
        },
      ] as never);
      vi.mocked(prisma.workspaceMember.count).mockResolvedValue(1);

      const res = await request(createApp()).get('/admin/workspaces/ws-1/users');

      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(1);
      expect(res.body.pagination.total).toBe(1);
    });
  });

  describe('GET /admin/workspaces/:workspaceId/users/:userId', () => {
    it('should return user details', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        id: 'mem-1', roleId: 'r1', roleName: 'member', joinedAt: new Date(), invitedBy: null,
        user: { id: 'u1', email: 'u1@test.com', username: 'user1', displayName: 'User 1', avatarUrl: null, status: 'online', statusMessage: null, mfaEnabled: false, isActive: true, isVerified: true, lastLoginAt: null, lastLoginIp: null, failedLoginAttempts: 0, lockedUntil: null, createdAt: new Date(), updatedAt: new Date() },
        role: { id: 'r1', name: 'member', description: 'Member' },
      } as never);
      getUserPermissions.mockResolvedValue(['workspace.read']);

      const res = await request(createApp()).get('/admin/workspaces/ws-1/users/u1');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('u1');
      expect(res.body.permissions).toEqual(['workspace.read']);
    });

    it('should return 404 if user not in workspace', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).get('/admin/workspaces/ws-1/users/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /admin/workspaces/:workspaceId/users/:userId/role', () => {
    it('should update user role', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        id: 'mem-1', roleName: 'member',
      } as never);
      assignRole.mockResolvedValue(undefined);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const res = await request(createApp())
        .patch('/admin/workspaces/ws-1/users/u2/role')
        .send({ roleName: 'admin' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 if changing own role', async () => {
      const res = await request(createApp())
        .patch('/admin/workspaces/ws-1/users/test-user-id/role')
        .send({ roleName: 'admin' });

      expect(res.status).toBe(400);
    });

    it('should return 404 if user not in workspace', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue(null);

      const res = await request(createApp())
        .patch('/admin/workspaces/ws-1/users/nonexistent/role')
        .send({ roleName: 'admin' });

      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid role', async () => {
      const res = await request(createApp())
        .patch('/admin/workspaces/ws-1/users/u2/role')
        .send({ roleName: 'superadmin' });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /admin/workspaces/:workspaceId/users/:userId', () => {
    it('should remove user from workspace', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        id: 'mem-1', roleName: 'member',
      } as never);
      vi.mocked(prisma.workspaceMember.delete).mockResolvedValue({} as never);
      vi.mocked(prisma.channelMember.deleteMany).mockResolvedValue(0 as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const res = await request(createApp()).delete('/admin/workspaces/ws-1/users/u2');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 if removing yourself', async () => {
      const res = await request(createApp()).delete('/admin/workspaces/ws-1/users/test-user-id');

      expect(res.status).toBe(400);
    });

    it('should return 403 if removing owner', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        id: 'mem-1', roleName: 'owner',
      } as never);

      const res = await request(createApp()).delete('/admin/workspaces/ws-1/users/u2');

      expect(res.status).toBe(403);
    });
  });

  describe('POST /admin/workspaces/:workspaceId/users/:userId/ban', () => {
    it('should ban a user', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        id: 'mem-1', roleName: 'member',
      } as never);
      vi.mocked(prisma.$transaction).mockImplementation(async (fn) => fn({
        channelMember: { deleteMany: vi.fn().mockResolvedValue(0) },
        workspaceMember: { delete: vi.fn().mockResolvedValue({}) },
      }));
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const res = await request(createApp())
        .post('/admin/workspaces/ws-1/users/u2/ban')
        .send({ reason: 'spam', duration: 24 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 if banning yourself', async () => {
      const res = await request(createApp())
        .post('/admin/workspaces/ws-1/users/test-user-id/ban')
        .send({ reason: 'test' });

      expect(res.status).toBe(400);
    });

    it('should return 403 if banning admin', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        id: 'mem-1', roleName: 'admin',
      } as never);

      const res = await request(createApp())
        .post('/admin/workspaces/ws-1/users/u2/ban')
        .send({ reason: 'test' });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /admin/workspaces/:workspaceId/users/:userId/unban', () => {
    it('should unban a user', async () => {
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const res = await request(createApp()).post('/admin/workspaces/ws-1/users/u2/unban');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /admin/workspaces/:workspaceId/users', () => {
    it('should create a new user', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-pw' as never);
      vi.mocked(prisma.user.create).mockResolvedValue({
        id: 'new-user', email: 'new@test.com', username: 'newuser',
      } as never);
      vi.mocked(prisma.workspaceMember.create).mockResolvedValue({} as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const res = await request(createApp())
        .post('/admin/workspaces/ws-1/users')
        .send({ email: 'new@test.com', username: 'newuser', displayName: 'New User', password: 'password123' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 if user already exists', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        id: 'existing', email: 'existing@test.com',
      } as never);

      const res = await request(createApp())
        .post('/admin/workspaces/ws-1/users')
        .send({ email: 'existing@test.com', username: 'existing', displayName: 'Existing', password: 'password123' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /admin/workspaces/:workspaceId/users/:userId/reset-password', () => {
    it('should reset password', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        id: 'mem-1', roleName: 'member',
      } as never);
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-pw' as never);
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const res = await request(createApp())
        .post('/admin/workspaces/ws-1/users/u2/reset-password')
        .send({ newPassword: 'newpassword123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 if user not in workspace', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue(null);

      const res = await request(createApp())
        .post('/admin/workspaces/ws-1/users/nonexistent/reset-password')
        .send({ newPassword: 'newpassword123' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /admin/users/:userId', () => {
    it('should delete a user', async () => {
      vi.mocked(prisma.workspaceMember.findMany).mockResolvedValue([] as never);
      vi.mocked(prisma.user.delete).mockResolvedValue({} as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const res = await request(createApp()).delete('/admin/users/u2');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 if deleting yourself', async () => {
      const res = await request(createApp()).delete('/admin/users/test-user-id');

      expect(res.status).toBe(400);
    });

    it('should return 400 if user owns workspaces', async () => {
      vi.mocked(prisma.workspaceMember.findMany).mockResolvedValue([
        { id: 'mem-1', roleName: 'owner' },
      ] as never);

      const res = await request(createApp()).delete('/admin/users/u2');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /admin/roles', () => {
    it('should list roles', async () => {
      vi.mocked(prisma.role.findMany).mockResolvedValue([
        {
          id: 'r1', name: 'member', description: 'Member',
          permissions: [{ permission: { id: 'p1', name: 'workspace.read', category: 'workspace' } }],
        },
      ] as never);

      const res = await request(createApp()).get('/admin/roles');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].permissions).toHaveLength(1);
    });
  });

  describe('GET /admin/permissions', () => {
    it('should list permissions grouped by category', async () => {
      vi.mocked(prisma.permission.findMany).mockResolvedValue([
        { id: 'p1', name: 'workspace.read', category: 'workspace', description: 'Read' },
        { id: 'p2', name: 'user.read', category: 'user', description: 'Read user' },
      ] as never);

      const res = await request(createApp()).get('/admin/permissions');

      expect(res.status).toBe(200);
      expect(res.body.permissions).toHaveLength(2);
      expect(res.body.grouped).toHaveProperty('workspace');
      expect(res.body.grouped).toHaveProperty('user');
    });
  });

  describe('GET /admin/workspaces/:workspaceId/audit-log', () => {
    it('should return audit logs', async () => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
        {
          id: 'log-1', action: 'USER_CREATED', userId: 'test-user-id',
          user: { id: 'u1', displayName: 'User', username: 'user', avatarUrl: null },
        },
      ] as never);
      vi.mocked(prisma.auditLog.count).mockResolvedValue(1);

      const res = await request(createApp()).get('/admin/workspaces/ws-1/audit-log');

      expect(res.status).toBe(200);
      expect(res.body.logs).toHaveLength(1);
      expect(res.body.pagination.total).toBe(1);
    });
  });
});
