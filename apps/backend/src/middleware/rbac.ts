import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { hasPermission, hasAnyPermission, hasAllPermissions, getUserRole } from '../services/rbac';

/**
 * Middleware to check if user has a specific permission.
 * @param permission - The permission to check
 * @param getWorkspaceId - Function to extract workspace ID from request
 */
export function requirePermission(
  permission: string,
  getWorkspaceId: (req: AuthRequest) => string | undefined = (req) => req.params.workspaceId || req.body.workspaceId
) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const allowed = await hasPermission(req.userId, workspaceId, permission);
    if (!allowed) {
      return res.status(403).json({ error: 'Permission denied', requiredPermission: permission });
    }

    next();
  };
}

/**
 * Middleware to check if user has any of the specified permissions.
 * @param permissions - Array of permissions (any match)
 * @param getWorkspaceId - Function to extract workspace ID from request
 */
export function requireAnyPermission(
  permissions: string[],
  getWorkspaceId: (req: AuthRequest) => string | undefined = (req) => req.params.workspaceId || req.body.workspaceId
) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const allowed = await hasAnyPermission(req.userId, workspaceId, permissions);
    if (!allowed) {
      return res.status(403).json({ error: 'Permission denied', requiredPermissions: permissions });
    }

    next();
  };
}

/**
 * Middleware to check if user has all of the specified permissions.
 * @param permissions - Array of permissions (all required)
 * @param getWorkspaceId - Function to extract workspace ID from request
 */
export function requireAllPermissions(
  permissions: string[],
  getWorkspaceId: (req: AuthRequest) => string | undefined = (req) => req.params.workspaceId || req.body.workspaceId
) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const allowed = await hasAllPermissions(req.userId, workspaceId, permissions);
    if (!allowed) {
      return res.status(403).json({ error: 'Permission denied', requiredPermissions: permissions });
    }

    next();
  };
}

/**
 * Middleware to check if user has a specific role.
 * @param roles - Array of allowed role names
 * @param getWorkspaceId - Function to extract workspace ID from request
 */
export function requireRole(
  roles: string[],
  getWorkspaceId: (req: AuthRequest) => string | undefined = (req) => req.params.workspaceId || req.body.workspaceId
) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const userRole = await getUserRole(req.userId, workspaceId);
    if (!userRole || !roles.includes(userRole)) {
      return res.status(403).json({ 
        error: 'Role not authorized', 
        requiredRoles: roles,
        currentRole: userRole,
      });
    }

    next();
  };
}

/**
 * Middleware to check if user is workspace owner.
 * @param getWorkspaceId - Function to extract workspace ID from request
 */
export function requireOwner(
  getWorkspaceId: (req: AuthRequest) => string | undefined = (req) => req.params.workspaceId || req.body.workspaceId
) {
  return requireRole(['owner'], getWorkspaceId);
}

/**
 * Middleware to check if user is workspace admin or owner.
 * @param getWorkspaceId - Function to extract workspace ID from request
 */
export function requireAdmin(
  getWorkspaceId: (req: AuthRequest) => string | undefined = (req) => req.params.workspaceId || req.body.workspaceId
) {
  return requireRole(['owner', 'admin'], getWorkspaceId);
}

/**
 * Middleware to check if user is at least a moderator.
 * @param getWorkspaceId - Function to extract workspace ID from request
 */
export function requireModerator(
  getWorkspaceId: (req: AuthRequest) => string | undefined = (req) => req.params.workspaceId || req.body.workspaceId
) {
  return requireRole(['owner', 'admin', 'moderator'], getWorkspaceId);
}
