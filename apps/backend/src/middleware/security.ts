import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import sanitizeHtml from 'sanitize-html';

/**
 * Rate limiter for general API requests.
 * Limits each IP to 100 requests per 15 minutes.
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Stricter rate limiter for authentication endpoints.
 * Limits each IP to 5 login/register attempts per 15 minutes.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed attempts
});

/**
 * Rate limiter for message sending.
 * Limits each IP to 30 messages per minute.
 */
export const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { error: 'Too many messages, please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for file uploads.
 * Limits each IP to 10 uploads per hour.
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: { error: 'Too many uploads, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Sanitize HTML options for user-generated content.
 * Allows basic formatting but strips dangerous elements.
 */
const sanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: [
    'b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li',
    'code', 'pre', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'span', 'del', 's',
  ],
  allowedAttributes: {
    'a': ['href', 'title', 'target', 'rel'],
    'span': ['class'],
    'code': ['class'],
    'pre': ['class'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: {
    a: ['http', 'https', 'mailto'],
  },
  // Force all links to open in new tab with security attributes
  transformTags: {
    'a': (tagName, attribs) => {
      return {
        tagName: 'a',
        attribs: {
          ...attribs,
          target: '_blank',
          rel: 'noopener noreferrer nofollow',
        },
      };
    },
  },
};

/**
 * Sanitizes user input to prevent XSS attacks.
 * @param input - The input string to sanitize
 * @returns Sanitized string
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return '';
  return sanitizeHtml(input, sanitizeOptions);
}

/**
 * Sanitizes plain text (strips all HTML).
 * @param input - The input string to sanitize
 * @returns Plain text without any HTML
 */
export function sanitizePlainText(input: string): string {
  if (typeof input !== 'string') return '';
  return sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} });
}

/**
 * Middleware to sanitize request body fields.
 * Automatically sanitizes common text fields.
 */
export function sanitizeBody(req: Request, res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') {
    const fieldsToSanitize = ['content', 'message', 'description', 'bio', 'statusMessage'];
    
    for (const field of fieldsToSanitize) {
      if (typeof req.body[field] === 'string') {
        req.body[field] = sanitizeInput(req.body[field]);
      }
    }

    // Plain text fields (no HTML allowed)
    const plainTextFields = ['name', 'displayName', 'username', 'title'];
    for (const field of plainTextFields) {
      if (typeof req.body[field] === 'string') {
        req.body[field] = sanitizePlainText(req.body[field]);
      }
    }
  }
  next();
}

/**
 * Validates that required environment variables are set.
 * Should be called at startup.
 */
export function validateEnvironment(): void {
  const requiredVars = ['DATABASE_URL'];
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }

  // Check for insecure defaults
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('change-in-production')) {
    warnings.push('⚠️  JWT_SECRET is using default value. Set a secure secret in production!');
  }

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters in production');
    }
  }

  // Log warnings
  for (const warning of warnings) {
    console.warn(warning);
  }

  // Throw on errors
  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * Security headers configuration for helmet.
 */
export const helmetConfig = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for file uploads
  crossOriginResourcePolicy: { policy: 'cross-origin' as const },
};

/**
 * Logs security-relevant events.
 */
export function logSecurityEvent(event: string, details: Record<string, any>) {
  const timestamp = new Date().toISOString();
  console.log(JSON.stringify({
    type: 'SECURITY_EVENT',
    timestamp,
    event,
    ...details,
  }));
}
