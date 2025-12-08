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

// Cache for subscription tiers to avoid DB lookups on every request
const tierCache = new Map<string, { tier: string; expiresAt: number }>();
const TIER_CACHE_TTL = 60 * 1000; // 1 minute cache

/**
 * Get user's subscription tier from cache or database.
 */
async function getUserTier(userId: string): Promise<string> {
  const cached = tierCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tier;
  }

  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      select: { plan: true, status: true },
    });

    // Only count active subscriptions
    const tier = (subscription?.status === 'active' || subscription?.status === 'trialing')
      ? subscription.plan
      : 'free';

    tierCache.set(userId, { tier, expiresAt: Date.now() + TIER_CACHE_TTL });
    return tier;
  } catch {
    // On error, default to free tier
    return 'free';
  }
}

/**
 * Tenant-aware Rate Limiter.
 * Uses MemoryStore by default. For production, use RedisStore.
 * 
 * Rate limits are based on user subscription tier:
 * - free: 100 requests/minute
 * - pro: 1000 requests/minute
 * - enterprise: 5000 requests/minute
 */
export const tenantRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  validate: { xForwardedForHeader: false, ip: false }, // We handle IPv6 normalization ourselves
  max: async (req: Request) => {
    const authReq = req as AuthRequest;
    
    // If authenticated user, check their subscription tier
    if (authReq.userId) {
      const tier = await getUserTier(authReq.userId);
      return TIER_LIMITS[tier as keyof typeof TIER_LIMITS] || TIER_LIMITS.free;
    }

    // Default for IP-based (unauthenticated)
    return TIER_LIMITS.free;
  },
  keyGenerator,
  handler,
  standardHeaders: true,
  legacyHeaders: false,
});
