import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { prisma } from '@pulseweave/database';
import { AuthRequest } from './auth';

// Rate Limits per Minute
const TIER_LIMITS = {
  free: 100,
  pro: 1000,
  enterprise: 5000,
};

/**
 * Custom key generator that prioritizes Workspace ID.
 * Fallback to IP address if no workspace context.
 */
const keyGenerator = (req: Request): string => {
  const authReq = req as AuthRequest;
  if (authReq.workspaceId) {
    return `workspace:${authReq.workspaceId}`;
  }
  return `ip:${req.ip}`;
};

/**
 * Dynamic rate limit handler.
 * Fetches workspace tier (simulated or real) to determine limit.
 */
const handler = async (req: Request, res: Response, next: any, options: any) => {
  res.status(options.statusCode).json({
    error: 'Rate limit exceeded',
    message: 'Too many requests for this workspace/IP. Please upgrade your plan or slow down.',
    retryAfter: Math.ceil(options.windowMs / 1000),
  });
};

/**
 * Tenant-aware Rate Limiter.
 * Uses MemoryStore by default. For production, use RedisStore.
 */
export const tenantRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: async (req: Request) => {
    const authReq = req as AuthRequest;
    
    // If authenticated with workspace context
    if (authReq.workspaceId) {
      // TODO: Fetch real tier from database if we add a 'tier' field to Workspace
      // const workspace = await prisma.workspace.findUnique({ where: { id: authReq.workspaceId } });
      // const tier = workspace?.tier || 'free';
      
      // For now, assume 'pro' for all authenticated workspaces in this SaaS version
      return TIER_LIMITS.pro;
    }

    // Default for IP-based (unauthenticated or global)
    return TIER_LIMITS.free;
  },
  keyGenerator,
  handler,
  standardHeaders: true,
  legacyHeaders: false,
});
