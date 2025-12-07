import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '@pulseweave/database';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { asyncHandler, Errors } from '../middleware/error-handler';
import { validate } from '../middleware/validate';

const router = Router();

/**
 * Checks if a user has admin access to a workspace.
 * Admin access is granted if the user is the workspace owner OR has admin/owner role.
 */
async function hasAdminAccess(userId: string, workspaceId: string): Promise<boolean> {
  const [membership, workspace] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId, workspaceId },
      },
    }),
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerId: true },
    }),
  ]);

  // Check if user is workspace owner
  if (workspace?.ownerId === userId) {
    return true;
  }

  // Check if user has admin or owner role
  if (membership && ['admin', 'owner'].includes(membership.roleName)) {
    return true;
  }

  return false;
}

/**
 * Available API key scopes.
 */
export const API_SCOPES = {
  'messages:read': 'Read messages in channels',
  'messages:write': 'Send messages to channels',
  'channels:read': 'List and view channels',
  'channels:write': 'Create and manage channels',
  'users:read': 'View user information',
  'members:read': 'List workspace members',
  'webhooks:read': 'View webhook configurations',
  'webhooks:write': 'Manage webhooks',
  '*': 'Full access (all scopes)',
} as const;

export type ApiScope = keyof typeof API_SCOPES;

/**
 * Generates a secure API key.
 * @returns Object with key, hash, and prefix
 */
function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `pw_${crypto.randomBytes(32).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const prefix = key.slice(0, 11); // "pw_" + 8 chars
  return { key, hash, prefix };
}

/**
 * Verifies an API key and returns the associated data.
 * @param key - The API key to verify
 * @returns API key data or null
 */
export async function verifyApiKey(key: string): Promise<{
  apiKey: any;
  scopes: string[];
  workspaceId: string;
  userId: string;
} | null> {
  if (!key.startsWith('pw_')) {
    return null;
  }

  const hash = crypto.createHash('sha256').update(key).digest('hex');

  const apiKey = await prisma.apiKey.findFirst({
    where: {
      keyHash: hash,
      isActive: true,
    },
    include: {
      workspace: {
        select: { id: true, name: true },
      },
      user: {
        select: { id: true, username: true, displayName: true },
      },
    },
  });

  if (!apiKey) {
    return null;
  }

  // Check expiration
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return null;
  }

  // Update last used
  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  });

  const scopes: string[] = JSON.parse(apiKey.scopes);

  return {
    apiKey,
    scopes,
    workspaceId: apiKey.workspaceId,
    userId: apiKey.userId,
  };
}

/**
 * Checks if scopes include the required scope.
 * @param scopes - User's scopes
 * @param required - Required scope
 * @returns True if authorized
 */
export function hasScope(scopes: string[], required: string): boolean {
  return scopes.includes('*') || scopes.includes(required);
}

/**
 * Middleware to authenticate via API key.
 */
export function authenticateApiKey(requiredScope?: ApiScope) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'API key required' });
    }

    const key = authHeader.slice(7);
    const result = await verifyApiKey(key);

    if (!result) {
      return res.status(401).json({ error: 'Invalid or expired API key' });
    }

    if (requiredScope && !hasScope(result.scopes, requiredScope)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: requiredScope,
        granted: result.scopes,
      });
    }

    // Attach to request
    (req as any).apiKey = result.apiKey;
    (req as any).apiScopes = result.scopes;
    (req as any).workspaceId = result.workspaceId;
    (req as any).userId = result.userId;

    next();
  };
}

// ============================================================================
// API Key Management Routes
// ============================================================================

const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).min(1),
  expiresAt: z.string().datetime().optional(),
});

const updateApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  scopes: z.array(z.string()).min(1).optional(),
  isActive: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

/**
 * Get available scopes.
 */
router.get('/scopes', authenticateToken, (req, res) => {
  res.json(API_SCOPES);
});

/**
 * List API keys for a workspace.
 */
router.get(
  '/workspace/:workspaceId',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res) => {
    const { workspaceId } = req.params;

    // Verify admin access (workspace owner OR admin role)
    if (!(await hasAdminAccess(req.userId!, workspaceId))) {
      throw Errors.forbidden('Admin access required');
    }

    const keys = await prisma.apiKey.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        isActive: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
        user: {
          select: { id: true, displayName: true, username: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(
      keys.map((k) => ({
        ...k,
        scopes: JSON.parse(k.scopes),
      }))
    );
  })
);

/**
 * Create an API key.
 */
router.post(
  '/workspace/:workspaceId',
  authenticateToken,
  validate(createApiKeySchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { workspaceId } = req.params;
    const { name, scopes, expiresAt } = req.body;

    // Verify admin access (workspace owner OR admin role)
    if (!(await hasAdminAccess(req.userId!, workspaceId))) {
      throw Errors.forbidden('Admin access required');
    }

    // Validate scopes
    const validScopes = Object.keys(API_SCOPES);
    for (const scope of scopes) {
      if (!validScopes.includes(scope)) {
        throw Errors.badRequest(`Invalid scope: ${scope}`);
      }
    }

    const { key, hash, prefix } = generateApiKey();

    const apiKey = await prisma.apiKey.create({
      data: {
        name,
        key, // Store full key (will be shown only once)
        keyHash: hash,
        keyPrefix: prefix,
        scopes: JSON.stringify(scopes),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        workspaceId,
        userId: req.userId!,
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        isActive: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    // Return the full key only on creation
    res.status(201).json({
      ...apiKey,
      key, // Full key - shown only once!
      scopes: JSON.parse(apiKey.scopes),
    });
  })
);

/**
 * Update an API key.
 */
router.patch(
  '/:id',
  authenticateToken,
  validate(updateApiKeySchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { name, scopes, isActive, expiresAt } = req.body;

    const apiKey = await prisma.apiKey.findUnique({
      where: { id },
    });

    if (!apiKey) {
      throw Errors.notFound('API key');
    }

    // Verify admin access (workspace owner OR admin role)
    if (!(await hasAdminAccess(req.userId!, apiKey.workspaceId))) {
      throw Errors.forbidden('Admin access required');
    }

    // Validate scopes if provided
    if (scopes) {
      const validScopes = Object.keys(API_SCOPES);
      for (const scope of scopes) {
        if (!validScopes.includes(scope)) {
          throw Errors.badRequest(`Invalid scope: ${scope}`);
        }
      }
    }

    const updated = await prisma.apiKey.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(scopes !== undefined && { scopes: JSON.stringify(scopes) }),
        ...(isActive !== undefined && { isActive }),
        ...(expiresAt !== undefined && {
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        }),
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        isActive: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    res.json({
      ...updated,
      scopes: JSON.parse(updated.scopes),
    });
  })
);

/**
 * Delete an API key.
 */
router.delete(
  '/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res) => {
    const { id } = req.params;

    const apiKey = await prisma.apiKey.findUnique({
      where: { id },
    });

    if (!apiKey) {
      throw Errors.notFound('API key');
    }

    // Verify admin access (workspace owner OR admin role)
    if (!(await hasAdminAccess(req.userId!, apiKey.workspaceId))) {
      throw Errors.forbidden('Admin access required');
    }

    await prisma.apiKey.delete({ where: { id } });

    res.json({ success: true });
  })
);

/**
 * Regenerate an API key.
 */
router.post(
  '/:id/regenerate',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res) => {
    const { id } = req.params;

    const apiKey = await prisma.apiKey.findUnique({
      where: { id },
    });

    if (!apiKey) {
      throw Errors.notFound('API key');
    }

    // Verify admin access (workspace owner OR admin role)
    if (!(await hasAdminAccess(req.userId!, apiKey.workspaceId))) {
      throw Errors.forbidden('Admin access required');
    }

    const { key, hash, prefix } = generateApiKey();

    const updated = await prisma.apiKey.update({
      where: { id },
      data: {
        key,
        keyHash: hash,
        keyPrefix: prefix,
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        isActive: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    res.json({
      ...updated,
      key, // New key - shown only once!
      scopes: JSON.parse(updated.scopes),
    });
  })
);

export default router;
