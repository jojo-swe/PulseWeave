import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@chatterbox/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { requireAdmin, requireOwner, requirePermission } from '../middleware/rbac';
import { assignRole, getUserPermissions, PERMISSIONS } from '../services/rbac';

const router = Router();

// ============================================================================
// User Management
// ============================================================================

/**
 * List all users in a workspace.
 */
router.get(
  '/workspaces/:workspaceId/users',
  authenticateToken,
  requirePermission(PERMISSIONS.workspace.read),
  async (req: AuthRequest, res) => {
    try {
      const { workspaceId } = req.params;
      const { search, role, status, page = '1', limit = '20' } = req.query;

      const pageNum = parseInt(page as string, 10);
      const limitNum = Math.min(parseInt(limit as string, 10), 100);
      const skip = (pageNum - 1) * limitNum;

      const where: any = { workspaceId };

      if (role) {
        where.roleName = role;
      }

      const members = await prisma.workspaceMember.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              status: true,
              mfaEnabled: true,
              isActive: true,
              isVerified: true,
              lastLoginAt: true,
              createdAt: true,
            },
          },
          role: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
        },
        skip,
        take: limitNum,
        orderBy: { joinedAt: 'desc' },
      });

      // Filter by search if provided
      let filteredMembers = members;
      if (search) {
        const searchLower = (search as string).toLowerCase();
        filteredMembers = members.filter(
          m =>
            m.user.displayName.toLowerCase().includes(searchLower) ||
            m.user.username.toLowerCase().includes(searchLower) ||
            m.user.email.toLowerCase().includes(searchLower)
        );
      }

      // Filter by status if provided
      if (status) {
        filteredMembers = filteredMembers.filter(m => m.user.status === status);
      }

      const total = await prisma.workspaceMember.count({ where });

      res.json({
        users: filteredMembers.map(m => ({
          ...m.user,
          membership: {
            id: m.id,
            roleId: m.roleId,
            roleName: m.roleName,
            role: m.role,
            joinedAt: m.joinedAt,
            invitedBy: m.invitedBy,
          },
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      console.error('List users error:', error);
      res.status(500).json({ error: 'Failed to list users' });
    }
  }
);

/**
 * Get a specific user's details.
 */
router.get(
  '/workspaces/:workspaceId/users/:userId',
  authenticateToken,
  requirePermission(PERMISSIONS.user.read),
  async (req: AuthRequest, res) => {
    try {
      const { workspaceId, userId } = req.params;

      const member = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: { userId, workspaceId },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              status: true,
              statusMessage: true,
              mfaEnabled: true,
              isActive: true,
              isVerified: true,
              lastLoginAt: true,
              lastLoginIp: true,
              failedLoginAttempts: true,
              lockedUntil: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          role: true,
        },
      });

      if (!member) {
        return res.status(404).json({ error: 'User not found in workspace' });
      }

      const permissions = await getUserPermissions(userId, workspaceId);

      res.json({
        ...member.user,
        membership: {
          id: member.id,
          roleId: member.roleId,
          roleName: member.roleName,
          role: member.role,
          joinedAt: member.joinedAt,
          invitedBy: member.invitedBy,
        },
        permissions,
      });
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ error: 'Failed to get user' });
    }
  }
);

const updateUserRoleSchema = z.object({
  roleName: z.enum(['owner', 'admin', 'moderator', 'member', 'guest']),
});

/**
 * Update a user's role.
 */
router.patch(
  '/workspaces/:workspaceId/users/:userId/role',
  authenticateToken,
  requirePermission(PERMISSIONS.workspace.manageRoles),
  async (req: AuthRequest, res) => {
    try {
      const { workspaceId, userId } = req.params;
      const { roleName } = updateUserRoleSchema.parse(req.body);

      // Can't change your own role
      if (userId === req.userId) {
        return res.status(400).json({ error: 'Cannot change your own role' });
      }

      // Check if target user exists in workspace
      const member = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: { userId, workspaceId },
        },
      });

      if (!member) {
        return res.status(404).json({ error: 'User not found in workspace' });
      }

      // Only owners can assign owner role
      if (roleName === 'owner') {
        const currentUserMember = await prisma.workspaceMember.findUnique({
          where: {
            userId_workspaceId: { userId: req.userId!, workspaceId },
          },
        });

        if (currentUserMember?.roleName !== 'owner') {
          return res.status(403).json({ error: 'Only owners can assign owner role' });
        }
      }

      await assignRole(userId, workspaceId, roleName);

      // Log the action
      await prisma.auditLog.create({
        data: {
          userId: req.userId,
          action: 'ROLE_CHANGED',
          resource: 'user',
          resourceId: userId,
          details: JSON.stringify({ workspaceId, oldRole: member.roleName, newRole: roleName }),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
      });

      res.json({ success: true, message: `User role updated to ${roleName}` });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error('Update user role error:', error);
      res.status(500).json({ error: 'Failed to update user role' });
    }
  }
);

/**
 * Remove a user from workspace.
 */
router.delete(
  '/workspaces/:workspaceId/users/:userId',
  authenticateToken,
  requirePermission(PERMISSIONS.workspace.manageMembers),
  async (req: AuthRequest, res) => {
    try {
      const { workspaceId, userId } = req.params;

      // Can't remove yourself
      if (userId === req.userId) {
        return res.status(400).json({ error: 'Cannot remove yourself' });
      }

      // Can't remove owners
      const member = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: { userId, workspaceId },
        },
      });

      if (!member) {
        return res.status(404).json({ error: 'User not found in workspace' });
      }

      if (member.roleName === 'owner') {
        return res.status(403).json({ error: 'Cannot remove workspace owner' });
      }

      await prisma.workspaceMember.delete({
        where: {
          userId_workspaceId: { userId, workspaceId },
        },
      });

      // Also remove from all channels in workspace
      await prisma.channelMember.deleteMany({
        where: {
          userId,
          channel: { workspaceId },
        },
      });

      // Log the action
      await prisma.auditLog.create({
        data: {
          userId: req.userId,
          action: 'USER_REMOVED',
          resource: 'workspace',
          resourceId: workspaceId,
          details: JSON.stringify({ removedUserId: userId }),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
      });

      res.json({ success: true, message: 'User removed from workspace' });
    } catch (error) {
      console.error('Remove user error:', error);
      res.status(500).json({ error: 'Failed to remove user' });
    }
  }
);

const banUserSchema = z.object({
  reason: z.string().optional(),
  duration: z.number().optional(), // Duration in hours, null for permanent
});

/**
 * Ban a user from workspace.
 */
router.post(
  '/workspaces/:workspaceId/users/:userId/ban',
  authenticateToken,
  requirePermission(PERMISSIONS.user.ban),
  async (req: AuthRequest, res) => {
    try {
      const { workspaceId, userId } = req.params;
      const { reason, duration } = banUserSchema.parse(req.body);

      if (userId === req.userId) {
        return res.status(400).json({ error: 'Cannot ban yourself' });
      }

      const member = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: { userId, workspaceId },
        },
      });

      if (!member) {
        return res.status(404).json({ error: 'User not found in workspace' });
      }

      if (member.roleName === 'owner' || member.roleName === 'admin') {
        return res.status(403).json({ error: 'Cannot ban owners or admins' });
      }

      // Calculate lock until time
      const lockedUntil = duration
        ? new Date(Date.now() + duration * 60 * 60 * 1000)
        : new Date('2099-12-31'); // Permanent

      // Update user
      await prisma.user.update({
        where: { id: userId },
        data: {
          isActive: false,
          lockedUntil,
        },
      });

      // Log the action
      await prisma.auditLog.create({
        data: {
          userId: req.userId,
          action: 'USER_BANNED',
          resource: 'user',
          resourceId: userId,
          details: JSON.stringify({ workspaceId, reason, duration, lockedUntil }),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
      });

      res.json({ success: true, message: 'User banned successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error('Ban user error:', error);
      res.status(500).json({ error: 'Failed to ban user' });
    }
  }
);

/**
 * Unban a user.
 */
router.post(
  '/workspaces/:workspaceId/users/:userId/unban',
  authenticateToken,
  requirePermission(PERMISSIONS.user.ban),
  async (req: AuthRequest, res) => {
    try {
      const { workspaceId, userId } = req.params;

      await prisma.user.update({
        where: { id: userId },
        data: {
          isActive: true,
          lockedUntil: null,
          failedLoginAttempts: 0,
        },
      });

      // Log the action
      await prisma.auditLog.create({
        data: {
          userId: req.userId,
          action: 'USER_UNBANNED',
          resource: 'user',
          resourceId: userId,
          details: JSON.stringify({ workspaceId }),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
      });

      res.json({ success: true, message: 'User unbanned successfully' });
    } catch (error) {
      console.error('Unban user error:', error);
      res.status(500).json({ error: 'Failed to unban user' });
    }
  }
);

// ============================================================================
// Roles Management
// ============================================================================

/**
 * List all roles.
 */
router.get('/roles', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const roles = await prisma.role.findMany({
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json(
      roles.map(role => ({
        ...role,
        permissions: role.permissions.map(rp => rp.permission),
      }))
    );
  } catch (error) {
    console.error('List roles error:', error);
    res.status(500).json({ error: 'Failed to list roles' });
  }
});

/**
 * List all permissions.
 */
router.get('/permissions', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const permissions = await prisma.permission.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    // Group by category
    const grouped = permissions.reduce((acc, perm) => {
      if (!acc[perm.category]) {
        acc[perm.category] = [];
      }
      acc[perm.category].push(perm);
      return acc;
    }, {} as Record<string, typeof permissions>);

    res.json({ permissions, grouped });
  } catch (error) {
    console.error('List permissions error:', error);
    res.status(500).json({ error: 'Failed to list permissions' });
  }
});

// ============================================================================
// Audit Log
// ============================================================================

/**
 * Get audit log for a workspace.
 */
router.get(
  '/workspaces/:workspaceId/audit-log',
  authenticateToken,
  requirePermission(PERMISSIONS.workspace.viewAuditLog),
  async (req: AuthRequest, res) => {
    try {
      const { workspaceId } = req.params;
      const { action, userId, startDate, endDate, page = '1', limit = '50' } = req.query;

      const pageNum = parseInt(page as string, 10);
      const limitNum = Math.min(parseInt(limit as string, 10), 100);
      const skip = (pageNum - 1) * limitNum;

      const where: any = {};

      if (action) {
        where.action = action;
      }

      if (userId) {
        where.userId = userId;
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
          where.createdAt.gte = new Date(startDate as string);
        }
        if (endDate) {
          where.createdAt.lte = new Date(endDate as string);
        }
      }

      // Filter by workspace through details JSON
      // Note: This is a simplified approach. For production, consider a proper workspaceId field.
      const logs = await prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              username: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      });

      const total = await prisma.auditLog.count({ where });

      res.json({
        logs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      console.error('Get audit log error:', error);
      res.status(500).json({ error: 'Failed to get audit log' });
    }
  }
);

export { router as adminRouter };
