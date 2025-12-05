import { prisma } from '@pulseweave/database';

/**
 * Permission categories and their permissions.
 */
export const PERMISSIONS = {
  workspace: {
    create: 'workspace:create',
    read: 'workspace:read',
    update: 'workspace:update',
    delete: 'workspace:delete',
    manageMembers: 'workspace:manage_members',
    manageRoles: 'workspace:manage_roles',
    manageSettings: 'workspace:manage_settings',
    viewAuditLog: 'workspace:view_audit_log',
  },
  channel: {
    create: 'channel:create',
    read: 'channel:read',
    update: 'channel:update',
    delete: 'channel:delete',
    manageMembers: 'channel:manage_members',
    manageSettings: 'channel:manage_settings',
  },
  message: {
    create: 'message:create',
    read: 'message:read',
    update: 'message:update',
    delete: 'message:delete',
    deleteAny: 'message:delete_any',
    pin: 'message:pin',
  },
  user: {
    read: 'user:read',
    update: 'user:update',
    manageMfa: 'user:manage_mfa',
    manageAny: 'user:manage_any',
    ban: 'user:ban',
    kick: 'user:kick',
  },
} as const;

/**
 * Default role configurations.
 */
export const DEFAULT_ROLES = {
  owner: {
    name: 'owner',
    description: 'Full access to all workspace features',
    isSystem: true,
    permissions: Object.values(PERMISSIONS).flatMap(category => Object.values(category)),
  },
  admin: {
    name: 'admin',
    description: 'Administrative access with most permissions',
    isSystem: true,
    permissions: [
      PERMISSIONS.workspace.read,
      PERMISSIONS.workspace.update,
      PERMISSIONS.workspace.manageMembers,
      PERMISSIONS.workspace.manageSettings,
      PERMISSIONS.workspace.viewAuditLog,
      ...Object.values(PERMISSIONS.channel),
      ...Object.values(PERMISSIONS.message),
      PERMISSIONS.user.read,
      PERMISSIONS.user.update,
      PERMISSIONS.user.kick,
    ],
  },
  moderator: {
    name: 'moderator',
    description: 'Can manage messages and moderate users',
    isSystem: true,
    permissions: [
      PERMISSIONS.workspace.read,
      PERMISSIONS.channel.read,
      PERMISSIONS.channel.update,
      PERMISSIONS.channel.manageMembers,
      PERMISSIONS.message.create,
      PERMISSIONS.message.read,
      PERMISSIONS.message.update,
      PERMISSIONS.message.delete,
      PERMISSIONS.message.deleteAny,
      PERMISSIONS.message.pin,
      PERMISSIONS.user.read,
      PERMISSIONS.user.kick,
    ],
  },
  member: {
    name: 'member',
    description: 'Standard workspace member',
    isSystem: true,
    permissions: [
      PERMISSIONS.workspace.read,
      PERMISSIONS.channel.read,
      PERMISSIONS.message.create,
      PERMISSIONS.message.read,
      PERMISSIONS.message.update,
      PERMISSIONS.message.delete,
      PERMISSIONS.user.read,
      PERMISSIONS.user.update,
      PERMISSIONS.user.manageMfa,
    ],
  },
  guest: {
    name: 'guest',
    description: 'Limited access guest',
    isSystem: true,
    permissions: [
      PERMISSIONS.workspace.read,
      PERMISSIONS.channel.read,
      PERMISSIONS.message.read,
      PERMISSIONS.user.read,
    ],
  },
};

/**
 * Initializes default roles and permissions in the database.
 */
export async function initializeRbac(): Promise<void> {
  console.log('Initializing RBAC system...');

  // Create all permissions
  const allPermissions = Object.entries(PERMISSIONS).flatMap(([category, perms]) =>
    Object.entries(perms).map(([key, name]) => ({
      name,
      description: `${category} ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}`,
      category,
    }))
  );

  for (const perm of allPermissions) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      update: { description: perm.description, category: perm.category },
      create: perm,
    });
  }

  // Create default roles with their permissions
  for (const [, roleConfig] of Object.entries(DEFAULT_ROLES)) {
    const role = await prisma.role.upsert({
      where: { name: roleConfig.name },
      update: { description: roleConfig.description },
      create: {
        name: roleConfig.name,
        description: roleConfig.description,
        isSystem: roleConfig.isSystem,
      },
    });

    // Clear existing role permissions and recreate
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id },
    });

    for (const permName of roleConfig.permissions) {
      const permission = await prisma.permission.findUnique({
        where: { name: permName },
      });
      if (permission) {
        await prisma.rolePermission.create({
          data: {
            roleId: role.id,
            permissionId: permission.id,
          },
        });
      }
    }
  }

  console.log('RBAC system initialized successfully');
}

/**
 * Gets user permissions for a specific workspace.
 * @param userId - The user ID
 * @param workspaceId - The workspace ID
 * @returns Array of permission names
 */
export async function getUserPermissions(
  userId: string,
  workspaceId: string
): Promise<string[]> {
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: { userId, workspaceId },
    },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  });

  if (!membership) {
    return [];
  }

  // If user has a role assigned, use role permissions
  if (membership.role) {
    return membership.role.permissions.map(rp => rp.permission.name);
  }

  // Fallback to roleName for legacy support
  const fallbackRole = await prisma.role.findUnique({
    where: { name: membership.roleName },
    include: {
      permissions: {
        include: {
          permission: true,
        },
      },
    },
  });

  return fallbackRole?.permissions.map(rp => rp.permission.name) || [];
}

/**
 * Checks if a user has a specific permission in a workspace.
 * @param userId - The user ID
 * @param workspaceId - The workspace ID
 * @param permission - The permission to check
 * @returns True if user has the permission
 */
export async function hasPermission(
  userId: string,
  workspaceId: string,
  permission: string
): Promise<boolean> {
  const permissions = await getUserPermissions(userId, workspaceId);
  return permissions.includes(permission);
}

/**
 * Checks if a user has any of the specified permissions.
 * @param userId - The user ID
 * @param workspaceId - The workspace ID
 * @param requiredPermissions - Array of permissions (any match)
 * @returns True if user has any of the permissions
 */
export async function hasAnyPermission(
  userId: string,
  workspaceId: string,
  requiredPermissions: string[]
): Promise<boolean> {
  const permissions = await getUserPermissions(userId, workspaceId);
  return requiredPermissions.some(p => permissions.includes(p));
}

/**
 * Checks if a user has all of the specified permissions.
 * @param userId - The user ID
 * @param workspaceId - The workspace ID
 * @param requiredPermissions - Array of permissions (all required)
 * @returns True if user has all permissions
 */
export async function hasAllPermissions(
  userId: string,
  workspaceId: string,
  requiredPermissions: string[]
): Promise<boolean> {
  const permissions = await getUserPermissions(userId, workspaceId);
  return requiredPermissions.every(p => permissions.includes(p));
}

/**
 * Gets the user's role in a workspace.
 * @param userId - The user ID
 * @param workspaceId - The workspace ID
 * @returns Role name or null
 */
export async function getUserRole(
  userId: string,
  workspaceId: string
): Promise<string | null> {
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: { userId, workspaceId },
    },
    include: {
      role: true,
    },
  });

  return membership?.role?.name || membership?.roleName || null;
}

/**
 * Assigns a role to a user in a workspace.
 * @param userId - The user ID
 * @param workspaceId - The workspace ID
 * @param roleName - The role name to assign
 */
export async function assignRole(
  userId: string,
  workspaceId: string,
  roleName: string
): Promise<void> {
  const role = await prisma.role.findUnique({
    where: { name: roleName },
  });

  await prisma.workspaceMember.update({
    where: {
      userId_workspaceId: { userId, workspaceId },
    },
    data: {
      roleId: role?.id || null,
      roleName: roleName,
    },
  });
}
