import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

/**
 * Request validation targets.
 */
type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Validation middleware factory.
 * Creates middleware that validates request data against a Zod schema.
 * 
 * @example
 * const createUserSchema = z.object({
 *   email: z.string().email(),
 *   name: z.string().min(1),
 * });
 * 
 * router.post('/users', validate(createUserSchema), createUser);
 */
export function validate<T extends ZodSchema>(
  schema: T,
  target: ValidationTarget = 'body'
) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = schema.parse(req[target]);
      // Replace with parsed (and transformed) data
      req[target] = data;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      next(error);
    }
  };
}

/**
 * Validate multiple targets at once.
 */
export function validateAll(schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: Array<{ target: string; field: string; message: string }> = [];

    for (const [target, schema] of Object.entries(schemas)) {
      if (!schema) continue;
      
      try {
        const data = schema.parse(req[target as ValidationTarget]);
        req[target as ValidationTarget] = data;
      } catch (error) {
        if (error instanceof z.ZodError) {
          errors.push(
            ...error.errors.map((e) => ({
              target,
              field: e.path.join('.'),
              message: e.message,
            }))
          );
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors,
      });
    }

    next();
  };
}

// ============================================================================
// Common validation schemas
// ============================================================================

/**
 * UUID validation schema.
 */
export const uuidSchema = z.string().uuid('Invalid ID format');

/**
 * Pagination query schema.
 */
export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * ID params schema.
 */
export const idParamsSchema = z.object({
  id: uuidSchema,
});

/**
 * Password validation schema with security requirements.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be less than 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

/**
 * Email validation schema.
 */
export const emailSchema = z.string().email().max(255).toLowerCase();

/**
 * Username validation schema.
 */
export const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be less than 30 characters')
  .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
  .toLowerCase();
