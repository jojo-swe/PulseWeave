'use client';

import { useMemo } from 'react';
import { useStore } from '@/store';

/**
 * Permission categories matching backend RBAC.
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
 * Role hierarchy for permission checks.
 * Higher index = more permissions.
 */
const ROLE_HIERARCHY = ['guest', 'member', 'moderator', 'admin', 'owner'] as const;
type RoleName = (typeof ROLE_HIERARCHY)[number];

/**
 * Permissions granted to each role.
 */
const ROLE_PERMISSIONS: Record<RoleName, string[]> = {
  owner: Object.values(PERMISSIONS).flatMap((category) => Object.values(category)),
  admin: [
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
  moderator: [
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
    PERMISSIONS.user.ban,
  ],
  member: [
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
  guest: [
    PERMISSIONS.workspace.read,
    PERMISSIONS.channel.read,
    PERMISSIONS.message.read,
    PERMISSIONS.user.read,
  ],
};

/**
 * Hook for checking user permissions and roles.
 * @returns Permission checking utilities
 */
export function usePermissions() {
  const { user } = useStore();

  const role = useMemo(() => {
    return (user?.role as RoleName) || 'member';
  }, [user?.role]);

  const permissions = useMemo(() => {
    return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.member;
  }, [role]);

  /**
   * Check if user has a specific permission.
   */
  const hasPermission = (permission: string): boolean => {
    return permissions.includes(permission);
  };

  /**
   * Check if user has any of the specified permissions.
   */
  const hasAnyPermission = (requiredPermissions: string[]): boolean => {
    return requiredPermissions.some((p) => permissions.includes(p));
  };

  /**
   * Check if user has all of the specified permissions.
   */
  const hasAllPermissions = (requiredPermissions: string[]): boolean => {
    return requiredPermissions.every((p) => permissions.includes(p));
  };

  /**
   * Check if user has a specific role or higher.
   */
  const hasRole = (requiredRole: RoleName): boolean => {
    const userRoleIndex = ROLE_HIERARCHY.indexOf(role);
    const requiredRoleIndex = ROLE_HIERARCHY.indexOf(requiredRole);
    return userRoleIndex >= requiredRoleIndex;
  };

  /**
   * Check if user is exactly one of the specified roles.
   */
  const isRole = (...roles: RoleName[]): boolean => {
    return roles.includes(role);
  };

  /**
   * Check if user is admin or owner.
   */
  const isAdmin = role === 'admin' || role === 'owner';

  /**
   * Check if user is owner.
   */
  const isOwner = role === 'owner';

  /**
   * Check if user is at least a moderator.
   */
  const isModerator = hasRole('moderator');

  /**
   * Check if user can manage workspace settings.
   */
  const canManageWorkspace = hasPermission(PERMISSIONS.workspace.manageSettings);

  /**
   * Check if user can manage channels.
   */
  const canManageChannels = hasPermission(PERMISSIONS.channel.create) || hasPermission(PERMISSIONS.channel.delete);

  /**
   * Check if user can manage members.
   */
  const canManageMembers = hasPermission(PERMISSIONS.workspace.manageMembers);

  /**
   * Check if user can manage roles.
   */
  const canManageRoles = hasPermission(PERMISSIONS.workspace.manageRoles);

  /**
   * Check if user can delete any message.
   */
  const canDeleteAnyMessage = hasPermission(PERMISSIONS.message.deleteAny);

  /**
   * Check if user can pin messages.
   */
  const canPinMessages = hasPermission(PERMISSIONS.message.pin);

  /**
   * Check if user can kick users.
   */
  const canKickUsers = hasPermission(PERMISSIONS.user.kick);

  /**
   * Check if user can ban users.
   */
  const canBanUsers = hasPermission(PERMISSIONS.user.ban);

  /**
   * Check if user can view audit log.
   */
  const canViewAuditLog = hasPermission(PERMISSIONS.workspace.viewAuditLog);

  return {
    role,
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasRole,
    isRole,
    isAdmin,
    isOwner,
    isModerator,
    canManageWorkspace,
    canManageChannels,
    canManageMembers,
    canManageRoles,
    canDeleteAnyMessage,
    canPinMessages,
    canKickUsers,
    canBanUsers,
    canViewAuditLog,
  };
}

/**
 * Type for permission check result.
 */
export type PermissionCheck = ReturnType<typeof usePermissions>;
