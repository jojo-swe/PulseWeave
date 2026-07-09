import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '@pulseweave/database';
import { slowDown } from 'express-slow-down';
import hpp from 'hpp';
import { logger } from '../utils/logger';

// ============================================================================
// IP-based Security
// ============================================================================

/**
 * In-memory store for blocked IPs (use Redis in production).
 */
const blockedIps = new Map<string, { until: Date; reason: string }>();
const failedAttempts = new Map<string, { count: number; firstAttempt: Date }>();

// Maximum cache sizes to prevent memory leaks
const MAX_BLOCKED_IPS = 10000;
const MAX_FAILED_ATTEMPTS = 50000;

/**
 * Cleanup expired entries from security caches.
 */
function cleanupSecurityCaches(): void {
  const now = new Date();
  let blockedRemoved = 0;
  let attemptsRemoved = 0;

  // Cleanup expired blocked IPs
  for (const [ip, block] of blockedIps) {
    if (now > block.until) {
      blockedIps.delete(ip);
      blockedRemoved++;
    }
  }

  // Cleanup stale failed attempts (older than attempt window)
  const windowMs = (parseInt(process.env.ATTEMPT_WINDOW_MINUTES || '15', 10) + 5) * 60 * 1000;
  for (const [ip, data] of failedAttempts) {
    if (now.getTime() - data.firstAttempt.getTime() > windowMs) {
      failedAttempts.delete(ip);
      attemptsRemoved++;
    }
  }

  if (blockedRemoved > 0 || attemptsRemoved > 0) {
    logger.info(`[SecurityCache] Cleaned up ${blockedRemoved} blocked IPs, ${attemptsRemoved} failed attempts`);
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupSecurityCaches, 5 * 60 * 1000);

/**
 * Configuration for IP blocking.
 */
const IP_BLOCK_CONFIG = {
  maxFailedAttempts: parseInt(process.env.MAX_FAILED_ATTEMPTS || '10', 10),
  blockDurationMinutes: parseInt(process.env.IP_BLOCK_DURATION_MINUTES || '30', 10),
  attemptWindowMinutes: parseInt(process.env.ATTEMPT_WINDOW_MINUTES || '15', 10),
};

/**
 * Gets the client IP address from the request.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]!.trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Checks if an IP is currently blocked.
 */
export function isIpBlocked(ip: string): { blocked: boolean; reason?: string; until?: Date } {
  const block = blockedIps.get(ip);
  if (!block) {
    return { blocked: false };
  }

  if (new Date() > block.until) {
    blockedIps.delete(ip);
    return { blocked: false };
  }

  return { blocked: true, reason: block.reason, until: block.until };
}

/**
 * Blocks an IP address.
 */
export function blockIp(ip: string, reason: string, durationMinutes?: number): void {
  const duration = durationMinutes || IP_BLOCK_CONFIG.blockDurationMinutes;
  const until = new Date(Date.now() + duration * 60 * 1000);
  
  blockedIps.set(ip, { until, reason });
  logger.warn(`IP blocked: ${ip} - Reason: ${reason} - Until: ${until.toISOString()}`);
}

/**
 * Records a failed authentication attempt.
 */
export function recordFailedAttempt(ip: string): void {
  const now = new Date();
  const windowStart = new Date(now.getTime() - IP_BLOCK_CONFIG.attemptWindowMinutes * 60 * 1000);
  
  const attempts = failedAttempts.get(ip);
  
  if (!attempts || attempts.firstAttempt < windowStart) {
    // Reset counter if window has passed
    failedAttempts.set(ip, { count: 1, firstAttempt: now });
  } else {
    attempts.count++;
    
    if (attempts.count >= IP_BLOCK_CONFIG.maxFailedAttempts) {
      blockIp(ip, 'Too many failed authentication attempts');
      failedAttempts.delete(ip);
    }
  }
}

/**
 * Clears failed attempts for an IP (on successful auth).
 */
export function clearFailedAttempts(ip: string): void {
  failedAttempts.delete(ip);
}

/**
 * Middleware to check if IP is blocked.
 */
export function ipBlockMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = getClientIp(req);
  const blockStatus = isIpBlocked(ip);

  if (blockStatus.blocked) {
    return res.status(403).json({
      error: 'Access denied',
      reason: 'Your IP has been temporarily blocked due to suspicious activity',
      blockedUntil: blockStatus.until,
    });
  }

  next();
}

// ============================================================================
// Account Lockout
// ============================================================================

/**
 * Configuration for account lockout.
 */
const LOCKOUT_CONFIG = {
  maxFailedAttempts: parseInt(process.env.ACCOUNT_MAX_FAILED_ATTEMPTS || '5', 10),
  lockoutDurationMinutes: parseInt(process.env.ACCOUNT_LOCKOUT_DURATION_MINUTES || '15', 10),
  progressiveMultiplier: parseFloat(process.env.LOCKOUT_PROGRESSIVE_MULTIPLIER || '2'),
};

/**
 * Checks if a user account is locked.
 */
export async function isAccountLocked(userId: string): Promise<{
  locked: boolean;
  lockedUntil?: Date;
  failedAttempts?: number;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lockedUntil: true, failedLoginAttempts: true, isActive: true },
  });

  if (!user) {
    return { locked: false };
  }

  if (!user.isActive) {
    return { locked: true, failedAttempts: user.failedLoginAttempts };
  }

  if (user.lockedUntil && new Date() < user.lockedUntil) {
    return {
      locked: true,
      lockedUntil: user.lockedUntil,
      failedAttempts: user.failedLoginAttempts,
    };
  }

  return { locked: false, failedAttempts: user.failedLoginAttempts };
}

/**
 * Records a failed login attempt for a user.
 */
export async function recordFailedLogin(userId: string): Promise<{
  locked: boolean;
  lockedUntil?: Date;
  failedAttempts: number;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { failedLoginAttempts: true },
  });

  const newAttempts = (user?.failedLoginAttempts || 0) + 1;
  let lockedUntil: Date | null = null;

  if (newAttempts >= LOCKOUT_CONFIG.maxFailedAttempts) {
    // Progressive lockout: duration increases with each lockout
    const lockoutCount = Math.floor(newAttempts / LOCKOUT_CONFIG.maxFailedAttempts);
    const multiplier = Math.pow(LOCKOUT_CONFIG.progressiveMultiplier, lockoutCount - 1);
    const duration = LOCKOUT_CONFIG.lockoutDurationMinutes * multiplier;
    
    lockedUntil = new Date(Date.now() + duration * 60 * 1000);
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: newAttempts,
      lockedUntil,
    },
  });

  return {
    locked: lockedUntil !== null,
    lockedUntil: lockedUntil || undefined,
    failedAttempts: newAttempts,
  };
}

/**
 * Clears failed login attempts on successful login.
 */
export async function clearFailedLogins(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });
}

// ============================================================================
// Request Signing & Validation
// ============================================================================

/**
 * Generates a request signature for API integrity.
 */
export function generateRequestSignature(
  method: string,
  path: string,
  body: unknown,
  timestamp: number,
  secret: string
): string {
  const payload = `${method}:${path}:${JSON.stringify(body)}:${timestamp}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Middleware to validate request signatures (for high-security endpoints).
 */
export function validateRequestSignature(secret: string, maxAgeSeconds: number = 300) {
  return (req: Request, res: Response, next: NextFunction) => {
    const signature = req.headers['x-signature'] as string;
    const timestamp = parseInt(req.headers['x-timestamp'] as string, 10);

    if (!signature || !timestamp) {
      return res.status(401).json({ error: 'Missing request signature' });
    }

    // Check timestamp freshness
    const now = Date.now();
    if (Math.abs(now - timestamp) > maxAgeSeconds * 1000) {
      return res.status(401).json({ error: 'Request timestamp expired' });
    }

    // Validate signature
    const expectedSignature = generateRequestSignature(
      req.method,
      req.path,
      req.body,
      timestamp,
      secret
    );

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return res.status(401).json({ error: 'Invalid request signature' });
    }

    next();
  };
}

// ============================================================================
// Security Headers & Middleware
// ============================================================================

/**
 * Enhanced security headers middleware.
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // XSS protection (legacy browsers)
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions policy
  res.setHeader(
    'Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
  );
  
  // Cache control for sensitive data
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  next();
}

/**
 * HTTP Parameter Pollution protection.
 */
export const hppMiddleware = hpp({
  whitelist: ['sort', 'filter', 'fields'], // Allow these to be arrays
});

/**
 * Slow down repeated requests (before rate limiting kicks in).
 */
export const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 100, // Allow 100 requests per window without delay
  delayMs: (hits) => hits * 100, // Add 100ms delay per request above threshold
  maxDelayMs: 5000, // Maximum 5 second delay
});

// ============================================================================
// CSRF Protection
// ============================================================================

/**
 * Simple CSRF token generation and validation.
 * Uses double-submit cookie pattern.
 */
const csrfTokens = new Map<string, { token: string; expires: Date }>();
const CSRF_TOKEN_MAX_SIZE = 50000;

/**
 * Cleanup expired CSRF tokens.
 */
function cleanupCsrfTokens(): void {
  const now = new Date();
  let removed = 0;
  
  for (const [sessionId, data] of csrfTokens) {
    if (now > data.expires) {
      csrfTokens.delete(sessionId);
      removed++;
    }
  }
  
  if (removed > 0) {
    logger.info(`[CsrfTokens] Cleaned up ${removed} expired tokens, ${csrfTokens.size} remaining`);
  }
}

// Run cleanup every 15 minutes
setInterval(cleanupCsrfTokens, 15 * 60 * 1000);

/**
 * Generates a CSRF token for a session.
 */
export function generateCsrfToken(sessionId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  
  // Enforce max size by removing oldest entry if needed
  if (csrfTokens.size >= CSRF_TOKEN_MAX_SIZE) {
    const firstKey = csrfTokens.keys().next().value;
    if (firstKey) csrfTokens.delete(firstKey);
  }
  
  csrfTokens.set(sessionId, { token, expires });
  
  return token;
}

/**
 * Validates a CSRF token.
 */
export function validateCsrfToken(sessionId: string, token: string): boolean {
  const stored = csrfTokens.get(sessionId);
  
  if (!stored) {
    return false;
  }
  
  if (new Date() > stored.expires) {
    csrfTokens.delete(sessionId);
    return false;
  }
  
  const storedBuf = Buffer.from(stored.token);
  const tokenBuf = Buffer.from(token);
  if (storedBuf.length !== tokenBuf.length) return false;
  return crypto.timingSafeEqual(storedBuf, tokenBuf);
}

/**
 * CSRF protection middleware.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Skip for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip for API routes with Bearer token (token-based auth is CSRF-safe)
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return next();
  }

  const sessionId = req.cookies?.sessionId || req.headers['x-session-id'] as string;
  const csrfToken = req.headers['x-csrf-token'] as string || req.body?._csrf;

  if (!sessionId || !csrfToken) {
    return res.status(403).json({ error: 'CSRF token missing' });
  }

  if (!validateCsrfToken(sessionId, csrfToken)) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  next();
}

// ============================================================================
// Audit Logging
// ============================================================================

/**
 * Security event types.
 */
export type SecurityEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'PASSWORD_CHANGED'
  | 'MFA_ENABLED'
  | 'MFA_DISABLED'
  | 'MFA_CHALLENGE_SUCCESS'
  | 'MFA_CHALLENGE_FAILED'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_UNLOCKED'
  | 'IP_BLOCKED'
  | 'SUSPICIOUS_ACTIVITY'
  | 'PERMISSION_DENIED'
  | 'ROLE_CHANGED'
  | 'USER_CREATED'
  | 'USER_DELETED'
  | 'LDAP_LOGIN_SUCCESS'
  | 'LDAP_LOGIN_FAILED';

/**
 * Logs a security event to the audit log.
 */
export async function logSecurityAudit(
  event: SecurityEventType,
  details: {
    userId?: string | null;
    ip?: string;
    userAgent?: string;
    resource?: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: details.userId,
        action: event,
        resource: details.resource || 'system',
        resourceId: details.resourceId,
        details: details.metadata ? JSON.stringify(details.metadata) : null,
        ipAddress: details.ip,
        userAgent: details.userAgent,
      },
    });
  } catch (error) {
    logger.error('Failed to log security audit:', error);
  }

  // Also log to console for immediate visibility
  logger.info(JSON.stringify({
    type: 'SECURITY_AUDIT',
    timestamp: new Date().toISOString(),
    event,
    ...details,
  }));
}

/**
 * Middleware to log all requests for audit trail.
 */
export function requestAuditMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'],
    };

    // Log errors and suspicious activity
    if (res.statusCode >= 400) {
      logger.warn(JSON.stringify({ type: 'REQUEST_ERROR', ...logEntry }));
    }
  });

  next();
}

// ============================================================================
// Password Security
// ============================================================================

/**
 * Checks if a password has been compromised using k-anonymity.
 * Uses the HaveIBeenPwned API without sending the full password.
 */
export async function isPasswordCompromised(password: string): Promise<{
  compromised: boolean;
  count?: number;
}> {
  try {
    const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = hash.substring(0, 5);
    const suffix = hash.substring(5);

    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
    });

    if (!response.ok) {
      logger.error('HIBP API error:', response.status);
      return { compromised: false }; // Fail open to not block users
    }

    const text = await response.text();
    const lines = text.split('\n');

    for (const line of lines) {
      const [hashSuffix, count] = line.split(':');
      if (hashSuffix && hashSuffix.trim() === suffix) {
        return { compromised: true, count: parseInt((count || '').trim(), 10) };
      }
    }

    return { compromised: false };
  } catch (error) {
    logger.error('Password breach check failed:', error);
    return { compromised: false }; // Fail open
  }
}

/**
 * Validates password strength with detailed feedback.
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  score: number;
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;

  // Length checks
  if (password.length < 8) {
    feedback.push('Password must be at least 8 characters');
  } else if (password.length >= 12) {
    score += 2;
  } else {
    score += 1;
  }

  // Complexity checks
  if (/[a-z]/.test(password)) score += 1;
  else feedback.push('Add lowercase letters');

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('Add uppercase letters');

  if (/[0-9]/.test(password)) score += 1;
  else feedback.push('Add numbers');

  if (/[^A-Za-z0-9]/.test(password)) score += 2;
  else feedback.push('Add special characters');

  // Entropy bonus
  if (password.length >= 16) score += 2;

  // Common pattern penalties
  if (/(.)\1{2,}/.test(password)) {
    score -= 1;
    feedback.push('Avoid repeated characters');
  }

  if (/^[a-zA-Z]+$/.test(password) || /^[0-9]+$/.test(password)) {
    score -= 1;
    feedback.push('Mix different character types');
  }

  return {
    valid: score >= 5 && feedback.length === 0,
    score: Math.max(0, Math.min(10, score)),
    feedback,
  };
}
