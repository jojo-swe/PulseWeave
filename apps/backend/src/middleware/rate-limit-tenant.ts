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
 * Normalize IPv6 addresses to prevent bypass attacks.
 * Converts ::ffff:127.0.0.1 style addresses to consistent format.
 */
const normalizeIp = (ip: string | undefined): string => {
  if (!ip) return 'unknown';
  // Handle IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
  if (ip.startsWith('::ffff:')) {
    return ip.slice(7);
  }
  // For IPv6, use the /64 prefix to group requests
  if (ip.includes(':')) {
    const parts = ip.split(':');
    // Use first 4 segments (64-bit prefix)
    return parts.slice(0, 4).join(':') + '::';
  }
  return ip;
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
  return `ip:${normalizeIp(req.ip)}`;
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
  validate: { xForwardedForHeader: false, ip: false }, // We handle IPv6 normalization ourselves
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
