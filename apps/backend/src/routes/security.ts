import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@chatterbox/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { PERMISSIONS } from '../services/rbac';
import {
  isIpBlocked,
  blockIp,
  getClientIp,
} from '../middleware/advanced-security';
import { getSslConfig } from '../middleware/ssl';

const router = Router();

// ============================================================================
// Security Status & Configuration
// ============================================================================

/**
 * Get current security status and configuration.
 * Available to admins only.
 */
router.get('/status', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const sslConfig = getSslConfig();
    
    // Get recent security events
    const recentEvents = await prisma.auditLog.findMany({
      where: {
        action: {
          in: ['LOGIN_FAILED', 'ACCOUNT_LOCKED', 'IP_BLOCKED', 'PERMISSION_DENIED'],
        },
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        user: {
          select: { displayName: true, email: true },
        },
      },
    });

    // Get failed login count
    const failedLogins = await prisma.auditLog.count({
      where: {
        action: 'LOGIN_FAILED',
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });

    // Get locked accounts
    const lockedAccounts = await prisma.user.count({
      where: {
        lockedUntil: {
          gt: new Date(),
        },
      },
    });

    // Get MFA adoption rate
    const totalUsers = await prisma.user.count();
    const mfaEnabledUsers = await prisma.user.count({
      where: { mfaEnabled: true },
    });

    res.json({
      ssl: {
        enabled: sslConfig.enabled,
        minVersion: sslConfig.minVersion,
      },
      features: {
        rateLimiting: true,
        ipBlocking: true,
        accountLockout: true,
        mfa: true,
        auditLogging: true,
        csrfProtection: true,
        hstsEnabled: true,
      },
      stats: {
        failedLoginsLast24h: failedLogins,
        lockedAccounts,
        mfaAdoptionRate: totalUsers > 0 ? Math.round((mfaEnabledUsers / totalUsers) * 100) : 0,
        totalUsers,
        mfaEnabledUsers,
      },
      recentSecurityEvents: recentEvents,
    });
  } catch (error) {
    console.error('Get security status error:', error);
    res.status(500).json({ error: 'Failed to get security status' });
  }
});

// ============================================================================
// IP Management
// ============================================================================

const blockIpSchema = z.object({
  ip: z.string().ip(),
  reason: z.string().min(1).max(255),
  durationMinutes: z.number().min(1).max(43200).optional(), // Max 30 days
});

/**
 * Block an IP address.
 */
router.post('/block-ip', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { ip, reason, durationMinutes } = blockIpSchema.parse(req.body);

    // Don't allow blocking localhost in development
    if (process.env.NODE_ENV !== 'production' && 
        (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost')) {
      return res.status(400).json({ error: 'Cannot block localhost in development' });
    }

    blockIp(ip, reason, durationMinutes);

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: req.userId,
        action: 'IP_BLOCKED',
        resource: 'ip',
        resourceId: ip,
        details: JSON.stringify({ reason, durationMinutes }),
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'],
      },
    });

    res.json({ success: true, message: `IP ${ip} has been blocked` });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Block IP error:', error);
    res.status(500).json({ error: 'Failed to block IP' });
  }
});

/**
 * Check if an IP is blocked.
 */
router.get('/check-ip/:ip', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { ip } = req.params;
    const status = isIpBlocked(ip);

    res.json({
      ip,
      blocked: status.blocked,
      reason: status.reason,
      blockedUntil: status.until,
    });
  } catch (error) {
    console.error('Check IP error:', error);
    res.status(500).json({ error: 'Failed to check IP status' });
  }
});

// ============================================================================
// Account Management
// ============================================================================

/**
 * Get locked accounts.
 */
router.get('/locked-accounts', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const lockedAccounts = await prisma.user.findMany({
      where: {
        OR: [
          { lockedUntil: { gt: new Date() } },
          { isActive: false },
        ],
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        lockedUntil: true,
        isActive: true,
        failedLoginAttempts: true,
        lastLoginAt: true,
        lastLoginIp: true,
      },
      orderBy: { lockedUntil: 'desc' },
    });

    res.json(lockedAccounts);
  } catch (error) {
    console.error('Get locked accounts error:', error);
    res.status(500).json({ error: 'Failed to get locked accounts' });
  }
});

/**
 * Unlock a user account.
 */
router.post('/unlock-account/:userId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;

    await prisma.user.update({
      where: { id: userId },
      data: {
        lockedUntil: null,
        failedLoginAttempts: 0,
        isActive: true,
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: req.userId,
        action: 'ACCOUNT_UNLOCKED',
        resource: 'user',
        resourceId: userId,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'],
      },
    });

    res.json({ success: true, message: 'Account unlocked' });
  } catch (error) {
    console.error('Unlock account error:', error);
    res.status(500).json({ error: 'Failed to unlock account' });
  }
});

// ============================================================================
// Security Audit
// ============================================================================

/**
 * Get security audit log with filters.
 */
router.get('/audit', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { 
      action, 
      userId, 
      startDate, 
      endDate, 
      ip,
      page = '1', 
      limit = '50' 
    } = req.query;

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

    if (ip) {
      where.ipAddress = ip;
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

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              username: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.auditLog.count({ where }),
    ]);

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
});

/**
 * Get security event summary.
 */
router.get('/summary', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      logins24h,
      failedLogins24h,
      logins7d,
      failedLogins7d,
      logins30d,
      failedLogins30d,
    ] = await Promise.all([
      prisma.auditLog.count({
        where: { action: 'LOGIN_SUCCESS', createdAt: { gte: last24h } },
      }),
      prisma.auditLog.count({
        where: { action: 'LOGIN_FAILED', createdAt: { gte: last24h } },
      }),
      prisma.auditLog.count({
        where: { action: 'LOGIN_SUCCESS', createdAt: { gte: last7d } },
      }),
      prisma.auditLog.count({
        where: { action: 'LOGIN_FAILED', createdAt: { gte: last7d } },
      }),
      prisma.auditLog.count({
        where: { action: 'LOGIN_SUCCESS', createdAt: { gte: last30d } },
      }),
      prisma.auditLog.count({
        where: { action: 'LOGIN_FAILED', createdAt: { gte: last30d } },
      }),
    ]);

    res.json({
      last24Hours: {
        successfulLogins: logins24h,
        failedLogins: failedLogins24h,
      },
      last7Days: {
        successfulLogins: logins7d,
        failedLogins: failedLogins7d,
      },
      last30Days: {
        successfulLogins: logins30d,
        failedLogins: failedLogins30d,
      },
    });
  } catch (error) {
    console.error('Get summary error:', error);
    res.status(500).json({ error: 'Failed to get security summary' });
  }
});

export { router as securityRouter };
