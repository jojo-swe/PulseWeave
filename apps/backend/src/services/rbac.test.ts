import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@pulseweave/database', () => ({
  prisma: {
    permission: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    role: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    rolePermission: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    workspaceMember: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { prisma } from '@pulseweave/database';
import {
  PERMISSIONS,
  DEFAULT_ROLES,
  initializeRbac,
  getUserPermissions,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  getUserRole,
  assignRole,
} from './rbac';

describe('rbac service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PERMISSIONS', () => {
    it('should export permissions organized by category', () => {
      expect(PERMISSIONS.workspace.create).toBe('workspace:create');
      expect(PERMISSIONS.channel.read).toBe('channel:read');
      expect(PERMISSIONS.message.delete).toBe('message:delete');
      expect(PERMISSIONS.user.ban).toBe('user:ban');
    });
  });

  describe('DEFAULT_ROLES', () => {
    it('should have owner role with all permissions', () => {
      const allPerms = Object.values(PERMISSIONS).flatMap(c => Object.values(c));
      expect(DEFAULT_ROLES.owner.permissions).toEqual(allPerms);
      expect(DEFAULT_ROLES.owner.isSystem).toBe(true);
    });

    it('should have guest role with minimal permissions', () => {
      expect(DEFAULT_ROLES.guest.permissions).toContain(PERMISSIONS.workspace.read);
      expect(DEFAULT_ROLES.guest.permissions).toContain(PERMISSIONS.message.read);
      expect(DEFAULT_ROLES.guest.permissions).not.toContain(PERMISSIONS.message.create);
    });

    it('should have member role with standard permissions', () => {
      expect(DEFAULT_ROLES.member.permissions).toContain(PERMISSIONS.message.create);
      expect(DEFAULT_ROLES.member.permissions).toContain(PERMISSIONS.message.delete);
      expect(DEFAULT_ROLES.member.permissions).not.toContain(PERMISSIONS.message.deleteAny);
    });
  });

  describe('initializeRbac', () => {
    it('should create all permissions and roles', async () => {
      vi.mocked(prisma.permission.upsert).mockResolvedValue({} as never);
      vi.mocked(prisma.role.upsert).mockResolvedValue({ id: 'role-1' } as never);
      vi.mocked(prisma.rolePermission.deleteMany).mockResolvedValue({ count: 0 } as never);
      vi.mocked(prisma.permission.findUnique).mockResolvedValue({ id: 'perm-1' } as never);
      vi.mocked(prisma.rolePermission.create).mockResolvedValue({} as never);

      await initializeRbac();

      // Should upsert all permissions (4 categories * varying perms = 20 total)
      expect(prisma.permission.upsert).toHaveBeenCalled();
      // Should upsert all 5 default roles
      expect(prisma.role.upsert).toHaveBeenCalled();
    });
  });

  describe('getUserPermissions', () => {
    it('should return empty array if user is not a workspace member', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue(null);

      const perms = await getUserPermissions('user-1', 'ws-1');

      expect(perms).toEqual([]);
    });

    it('should return role permissions when user has a role', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        role: {
          permissions: [
            { permission: { name: 'workspace:read' } },
            { permission: { name: 'channel:read' } },
          ],
        },
      } as never);

      const perms = await getUserPermissions('user-1', 'ws-1');

      expect(perms).toEqual(['workspace:read', 'channel:read']);
    });

    it('should fallback to roleName when role is null', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        role: null,
        roleName: 'admin',
      } as never);
      vi.mocked(prisma.role.findUnique).mockResolvedValue({
        permissions: [
          { permission: { name: 'workspace:read' } },
        ],
      } as never);

      const perms = await getUserPermissions('user-1', 'ws-1');

      expect(perms).toEqual(['workspace:read']);
      expect(prisma.role.findUnique).toHaveBeenCalledWith({
        where: { name: 'admin' },
        include: { permissions: { include: { permission: true } } },
      });
    });

    it('should return empty array if fallback role not found', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        role: null,
        roleName: 'nonexistent',
      } as never);
      vi.mocked(prisma.role.findUnique).mockResolvedValue(null);

      const perms = await getUserPermissions('user-1', 'ws-1');

      expect(perms).toEqual([]);
    });
  });

  describe('hasPermission', () => {
    it('should return true if user has the permission', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        role: {
          permissions: [
            { permission: { name: 'workspace:read' } },
          ],
        },
      } as never);

      const result = await hasPermission('user-1', 'ws-1', 'workspace:read');
      expect(result).toBe(true);
    });

    it('should return false if user does not have the permission', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        role: {
          permissions: [
            { permission: { name: 'workspace:read' } },
          ],
        },
      } as never);

      const result = await hasPermission('user-1', 'ws-1', 'workspace:delete');
      expect(result).toBe(false);
    });
  });

  describe('hasAnyPermission', () => {
    it('should return true if user has any of the required permissions', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        role: {
          permissions: [
            { permission: { name: 'workspace:read' } },
          ],
        },
      } as never);

      const result = await hasAnyPermission('user-1', 'ws-1', ['workspace:delete', 'workspace:read']);
      expect(result).toBe(true);
    });

    it('should return false if user has none of the required permissions', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        role: {
          permissions: [
            { permission: { name: 'workspace:read' } },
          ],
        },
      } as never);

      const result = await hasAnyPermission('user-1', 'ws-1', ['workspace:delete', 'user:ban']);
      expect(result).toBe(false);
    });
  });

  describe('hasAllPermissions', () => {
    it('should return true if user has all required permissions', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        role: {
          permissions: [
            { permission: { name: 'workspace:read' } },
            { permission: { name: 'channel:read' } },
          ],
        },
      } as never);

      const result = await hasAllPermissions('user-1', 'ws-1', ['workspace:read', 'channel:read']);
      expect(result).toBe(true);
    });

    it('should return false if user is missing any permission', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        role: {
          permissions: [
            { permission: { name: 'workspace:read' } },
          ],
        },
      } as never);

      const result = await hasAllPermissions('user-1', 'ws-1', ['workspace:read', 'channel:read']);
      expect(result).toBe(false);
    });
  });

  describe('getUserRole', () => {
    it('should return role name from role relation', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        role: { name: 'admin' },
        roleName: 'member',
      } as never);

      const role = await getUserRole('user-1', 'ws-1');
      expect(role).toBe('admin');
    });

    it('should fallback to roleName if role relation is null', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        role: null,
        roleName: 'member',
      } as never);

      const role = await getUserRole('user-1', 'ws-1');
      expect(role).toBe('member');
    });

    it('should return null if user is not a member', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue(null);

      const role = await getUserRole('user-1', 'ws-1');
      expect(role).toBeNull();
    });
  });

  describe('assignRole', () => {
    it('should update workspace member with role ID and name', async () => {
      vi.mocked(prisma.role.findUnique).mockResolvedValue({ id: 'role-admin' } as never);
      vi.mocked(prisma.workspaceMember.update).mockResolvedValue({} as never);

      await assignRole('user-1', 'ws-1', 'admin');

      expect(prisma.workspaceMember.update).toHaveBeenCalledWith({
        where: {
          userId_workspaceId: { userId: 'user-1', workspaceId: 'ws-1' },
        },
        data: {
          roleId: 'role-admin',
          roleName: 'admin',
        },
      });
    });

    it('should set roleId to null if role not found', async () => {
      vi.mocked(prisma.role.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.workspaceMember.update).mockResolvedValue({} as never);

      await assignRole('user-1', 'ws-1', 'nonexistent');

      expect(prisma.workspaceMember.update).toHaveBeenCalledWith({
        where: {
          userId_workspaceId: { userId: 'user-1', workspaceId: 'ws-1' },
        },
        data: {
          roleId: null,
          roleName: 'nonexistent',
        },
      });
    });
  });
});
