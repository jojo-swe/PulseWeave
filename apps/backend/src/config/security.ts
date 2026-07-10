/**
 * Centralized security configuration for PulseWeave.
 * 
 * This module validates and exports all security-related configuration.
 * It enforces strict requirements in production and provides sensible
 * defaults for development.
 * 
 * @module config/security
 */

import crypto from 'crypto';
import { logger } from '../utils/logger';

// =============================================================================
// Environment Detection
// =============================================================================

export const isProduction = process.env.NODE_ENV === 'production';
export const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
export const isTest = process.env.NODE_ENV === 'test';

const shouldUseSecureCookies =
  isProduction && (process.env.SSL_ENABLED === 'true' || process.env.BEHIND_PROXY === 'true');

// =============================================================================
// Security Validation Errors
// =============================================================================

interface SecurityValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates all security configuration at startup.
 * In production, throws on critical errors.
 * In development, logs warnings but allows startup.
 */
export function validateSecurityConfig(): SecurityValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // JWT Secret validation
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    if (isProduction) {
      errors.push('CRITICAL: JWT_SECRET must be set in production');
    } else {
      warnings.push('JWT_SECRET not set - using insecure default for development');
    }
  } else {
    if (jwtSecret.length < 32) {
      if (isProduction) {
        errors.push('CRITICAL: JWT_SECRET must be at least 32 characters');
      } else {
        warnings.push('JWT_SECRET should be at least 32 characters');
      }
    }
    if (isInsecureSecret(jwtSecret)) {
      if (isProduction) {
        errors.push('CRITICAL: JWT_SECRET appears to be a default/insecure value');
      } else {
        warnings.push('JWT_SECRET appears to be a default value - change for production');
      }
    }
  }

  // Cookie Secret validation
  const cookieSecret = process.env.COOKIE_SECRET;
  if (!cookieSecret) {
    if (isProduction) {
      errors.push('CRITICAL: COOKIE_SECRET must be set in production');
    } else {
      warnings.push('COOKIE_SECRET not set - using insecure default for development');
    }
  } else if (isInsecureSecret(cookieSecret)) {
    if (isProduction) {
      errors.push('CRITICAL: COOKIE_SECRET appears to be a default/insecure value');
    } else {
      warnings.push('COOKIE_SECRET appears to be a default value - change for production');
    }
  }

  // Database URL validation
  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL must be set');
  }

  // HTTPS/SSL validation in production
  if (isProduction) {
    if (process.env.SSL_ENABLED !== 'true' && !process.env.BEHIND_PROXY) {
      warnings.push('SSL is not enabled and BEHIND_PROXY is not set - ensure HTTPS is handled by reverse proxy');
    }
    
    if (!process.env.FRONTEND_URL) {
      warnings.push('FRONTEND_URL not set - CORS may not work correctly');
    }
  }

  // Log results
  for (const warning of warnings) {
    logger.warn(`⚠️  ${warning}`);
  }

  if (errors.length > 0) {
    for (const error of errors) {
      logger.error(`❌ ${error}`);
    }
    if (isProduction) {
      throw new Error(`Security validation failed:\n${errors.join('\n')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Checks if a secret appears to be an insecure default value.
 */
function isInsecureSecret(secret: string): boolean {
  const insecurePatterns = [
    'change-in-production',
    'change-me',
    'default',
    'secret',
    'password',
    'pulseweave-dev',
    'your-secret',
    'example',
    'test',
    '123456',
    'abcdef',
  ];
  
  const lowerSecret = secret.toLowerCase();
  return insecurePatterns.some(pattern => lowerSecret.includes(pattern));
}

/**
 * Generates a cryptographically secure random secret.
 * Use this to generate secrets for production.
 */
export function generateSecureSecret(length: number = 64): string {
  return crypto.randomBytes(length).toString('base64url');
}

// =============================================================================
// JWT Configuration
// =============================================================================

const DEV_JWT_SECRET = 'pulseweave-dev-only-secret-do-not-use-in-production-' + crypto.randomBytes(16).toString('hex');

export const jwtConfig = {
  /** JWT signing secret */
  secret: process.env.JWT_SECRET || (isDevelopment ? DEV_JWT_SECRET : ''),
  
  /** Token issuer claim */
  issuer: 'pulseweave',
  
  /** Token audience claim */
  audience: 'pulseweave-api',
  
  /** Access token expiry (short-lived) */
  accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || process.env.JWT_EXPIRES_IN || '15m',
  
  /** Refresh token expiry (longer-lived) */
  refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  
  /** Algorithm for signing */
  algorithm: 'HS256' as const,
};

// =============================================================================
// Cookie Configuration
// =============================================================================

const DEV_COOKIE_SECRET = 'pulseweave-dev-cookie-' + crypto.randomBytes(16).toString('hex');

export const cookieConfig = {
  /** Cookie signing secret */
  secret: process.env.COOKIE_SECRET || (isDevelopment ? DEV_COOKIE_SECRET : ''),
  
  /** Common cookie options */
  options: {
    httpOnly: true,
    secure: shouldUseSecureCookies,
    sameSite: 'lax' as const,
    path: '/',
  },
  
  /** Access token cookie settings */
  accessToken: {
    name: 'token',
    maxAge: 15 * 60 * 1000, // 15 minutes (matches JWT expiry)
  },
  
  /** Refresh token cookie settings */
  refreshToken: {
    name: 'refreshToken',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
};

// =============================================================================
// CORS Configuration
// =============================================================================

const defaultAllowedOrigins = [
  'http://localhost:9797',
  'http://127.0.0.1:9797',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

export const corsConfig = {
  /** Allowed origins for CORS */
  allowedOrigins: Array.from(new Set([
    ...defaultAllowedOrigins,
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
    ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()) : []),
    ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : []),
  ].filter(Boolean))),
  
  /** Allowed HTTP methods */
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  
  /** Allowed request headers */
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-CSRF-Token',
    'X-Session-ID',
    'X-Signature',
    'X-Timestamp',
    'X-Workspace-ID',
    'X-Request-ID',
  ],
  
  /** Headers exposed to client */
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-CSRF-Token',
    'X-Request-ID',
  ],
  
  /** Allow credentials (cookies) */
  credentials: true,
};

// =============================================================================
// Rate Limiting Configuration
// =============================================================================

export const rateLimitConfig = {
  /** General API rate limit */
  general: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || process.env.RATE_LIMIT_MAX || (isProduction ? '200' : '1000')),
  },
  
  /** Authentication endpoints rate limit (stricter) */
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || (isProduction ? '10' : '50')),
    skipSuccessfulRequests: true, // Only count failed attempts
  },
  
  /** Message sending rate limit */
  messages: {
    windowMs: 60 * 1000, // 1 minute
    max: isProduction ? 30 : 100,
  },
  
  /** File upload rate limit */
  uploads: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: isProduction ? 20 : 100,
  },
  
  /** Password reset rate limit (very strict) */
  passwordReset: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
  },
};

// =============================================================================
// Session Configuration
// =============================================================================

export const sessionConfig = {
  /** Maximum concurrent sessions per user */
  maxSessionsPerUser: parseInt(process.env.MAX_SESSIONS_PER_USER || '5'),
  
  /** Session idle timeout (auto-logout after inactivity) */
  idleTimeoutMs: parseInt(process.env.SESSION_IDLE_TIMEOUT_MS || String(30 * 60 * 1000)), // 30 minutes
  
  /** Absolute session timeout (force re-auth) */
  absoluteTimeoutMs: parseInt(process.env.SESSION_ABSOLUTE_TIMEOUT_MS || String(24 * 60 * 60 * 1000)), // 24 hours
  
  /** Store sessions in database (recommended for production) */
  useDatabase: process.env.USE_DB_SESSIONS === 'true' || isProduction,
};

// =============================================================================
// Password Policy
// =============================================================================

export const passwordPolicy = {
  /** Minimum password length */
  minLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '8'),
  
  /** Require uppercase letter */
  requireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE !== 'false',
  
  /** Require lowercase letter */
  requireLowercase: process.env.PASSWORD_REQUIRE_LOWERCASE !== 'false',
  
  /** Require number */
  requireNumber: process.env.PASSWORD_REQUIRE_NUMBER !== 'false',
  
  /** Require special character */
  requireSpecial: process.env.PASSWORD_REQUIRE_SPECIAL !== 'false',
  
  /** Maximum password length (prevent DoS) */
  maxLength: 128,
  
  /** Number of previous passwords to check against */
  historyCount: parseInt(process.env.PASSWORD_HISTORY_COUNT || '5'),
};

/**
 * Validates a password against the policy.
 */
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (password.length < passwordPolicy.minLength) {
    errors.push(`Password must be at least ${passwordPolicy.minLength} characters`);
  }
  
  if (password.length > passwordPolicy.maxLength) {
    errors.push(`Password must not exceed ${passwordPolicy.maxLength} characters`);
  }
  
  if (passwordPolicy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (passwordPolicy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (passwordPolicy.requireNumber && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (passwordPolicy.requireSpecial && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return { valid: errors.length === 0, errors };
}

// =============================================================================
// Security Headers
// =============================================================================

export const securityHeaders = {
  /** Content Security Policy directives */
  csp: {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"], // Needed for some UI frameworks
    scriptSrc: ["'self'"],
    imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
    connectSrc: ["'self'", 'ws:', 'wss:', ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [])],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    upgradeInsecureRequests: isProduction ? [] : undefined,
  },
  
  /** HSTS configuration */
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: isProduction,
  },
  
  /** Referrer policy */
  referrerPolicy: 'strict-origin-when-cross-origin',
  
  /** X-Content-Type-Options */
  noSniff: true,
  
  /** X-Frame-Options */
  frameOptions: 'DENY',
  
  /** X-XSS-Protection (legacy, but still useful) */
  xssProtection: '1; mode=block',
};

// =============================================================================
// Exports
// =============================================================================

export default {
  isProduction,
  isDevelopment,
  isTest,
  validateSecurityConfig,
  generateSecureSecret,
  jwt: jwtConfig,
  cookie: cookieConfig,
  cors: corsConfig,
  rateLimit: rateLimitConfig,
  session: sessionConfig,
  password: passwordPolicy,
  validatePassword,
  headers: securityHeaders,
};
