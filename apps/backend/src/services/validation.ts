import { z } from 'zod';
import sanitizeHtml from 'sanitize-html';

/**
 * Common validation patterns.
 */
export const patterns = {
  /** Safe username: alphanumeric, underscores, 3-30 chars */
  username: /^[a-zA-Z0-9_]{3,30}$/,
  /** Slug: lowercase alphanumeric with hyphens */
  slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  /** UUID v4 format */
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  /** CUID format */
  cuid: /^c[a-z0-9]{24}$/,
  /** Safe file name */
  fileName: /^[a-zA-Z0-9_.-]+$/,
  /** No SQL injection patterns */
  noSqlInjection: /^[^'";\\]*$/,
  /** No script tags */
  noScript: /^(?!.*<script).*$/i,
};

/**
 * Reusable Zod schemas for common fields.
 */
export const schemas = {
  /** Email with normalization */
  email: z.string()
    .email('Invalid email address')
    .max(255, 'Email too long')
    .transform((e) => e.toLowerCase().trim()),

  /** Username with validation */
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(patterns.username, 'Username can only contain letters, numbers, and underscores')
    .transform((u) => u.toLowerCase()),

  /** Display name */
  displayName: z.string()
    .min(1, 'Display name is required')
    .max(50, 'Display name must be at most 50 characters')
    .transform((n) => sanitizePlainText(n).trim()),

  /** Strong password */
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),

  /** ID field (CUID or UUID) */
  id: z.string().min(1, 'ID is required'),

  /** Workspace/channel slug */
  slug: z.string()
    .min(2, 'Slug must be at least 2 characters')
    .max(50, 'Slug must be at most 50 characters')
    .regex(patterns.slug, 'Slug must be lowercase with hyphens only')
    .transform((s) => s.toLowerCase()),

  /** Message content with sanitization */
  messageContent: z.string()
    .min(1, 'Message cannot be empty')
    .max(4000, 'Message too long')
    .transform((c) => sanitizeRichText(c)),

  /** Plain text content */
  plainText: z.string()
    .max(1000, 'Text too long')
    .transform((t) => sanitizePlainText(t)),

  /** URL with validation */
  url: z.string()
    .url('Invalid URL')
    .max(2048, 'URL too long')
    .refine(
      (url) => url.startsWith('http://') || url.startsWith('https://'),
      'URL must use HTTP or HTTPS'
    ),

  /** Pagination */
  pagination: z.object({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(20),
  }),

  /** Sort order */
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
};

/**
 * Sanitization options for rich text (messages, descriptions).
 */
const richTextSanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: [
    'b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li',
    'code', 'pre', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'span', 'del', 's',
  ],
  allowedAttributes: {
    'a': ['href', 'title'],
    'span': ['class'],
    'code': ['class'],
    'pre': ['class'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    'a': (tagName, attribs) => ({
      tagName: 'a',
      attribs: {
        ...attribs,
        target: '_blank',
        rel: 'noopener noreferrer nofollow',
      },
    }),
  },
  // Strip all unknown tags
  disallowedTagsMode: 'discard',
};

/**
 * Sanitizes rich text content (allows safe HTML).
 */
export function sanitizeRichText(input: string): string {
  if (typeof input !== 'string') return '';
  return sanitizeHtml(input, richTextSanitizeOptions).trim();
}

/**
 * Sanitizes plain text (strips all HTML).
 */
export function sanitizePlainText(input: string): string {
  if (typeof input !== 'string') return '';
  return sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} }).trim();
}

/**
 * Escapes special characters for safe database queries.
 * Note: Prisma handles this automatically, but useful for raw queries.
 */
export function escapeForQuery(input: string): string {
  const NUL = String.fromCharCode(0);
  const SUB = String.fromCharCode(26);
  return input
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(new RegExp(NUL, 'g'), '\\0')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(new RegExp(SUB, 'g'), '\\Z');
}

/**
 * Validates and sanitizes a file name.
 */
export function sanitizeFileName(fileName: string): string {
  // Remove path components
  const name = fileName.split(/[/\\]/).pop() || '';
  // Remove dangerous characters
  return name
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(0, 255);
}

/**
 * Validates file type against allowed MIME types.
 */
export function isAllowedFileType(
  mimeType: string,
  allowedTypes: string[]
): boolean {
  const normalizedMime = mimeType.toLowerCase();
  return allowedTypes.some((allowed) => {
    if (allowed.endsWith('/*')) {
      // Wildcard match (e.g., "image/*")
      const prefix = allowed.slice(0, -1);
      return normalizedMime.startsWith(prefix);
    }
    return normalizedMime === allowed.toLowerCase();
  });
}

/**
 * Common allowed file types.
 */
export const allowedFileTypes = {
  images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  documents: ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  media: ['audio/*', 'video/*'],
  all: ['image/*', 'audio/*', 'video/*', 'application/pdf', 'text/plain'],
};

/**
 * Validates request body against a schema with detailed error messages.
 */
export function validateBody<T extends z.ZodType>(
  schema: T,
  body: unknown
): { success: true; data: z.infer<T> } | { success: false; errors: string[] } {
  const result = schema.safeParse(body);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.errors.map((e) => {
    const path = e.path.join('.');
    return path ? `${path}: ${e.message}` : e.message;
  });

  return { success: false, errors };
}

/**
 * Creates a validation middleware for a Zod schema.
 */
export function createValidator<T extends z.ZodType>(schema: T) {
  return (body: unknown): z.infer<T> => {
    return schema.parse(body);
  };
}

/**
 * Checks if a string contains potential injection patterns.
 */
export function containsInjectionPatterns(input: string): boolean {
  const dangerousPatterns = [
    /['";].*(--)/, // SQL comment
    /['";].*(\bOR\b|\bAND\b)/i, // SQL boolean
    /<script/i, // XSS
    /javascript:/i, // XSS
    /on\w+\s*=/i, // Event handlers
    /\$\{.*\}/, // Template injection
    /\{\{.*\}\}/, // Template injection
  ];

  return dangerousPatterns.some((pattern) => pattern.test(input));
}

/**
 * Validates and normalizes a search query.
 */
export function sanitizeSearchQuery(query: string): string {
  return sanitizePlainText(query)
    .replace(/[%_]/g, '') // Remove SQL wildcards
    .slice(0, 100); // Limit length
}
