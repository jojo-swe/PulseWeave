import { Request, Response, NextFunction, Router } from 'express';
import { ZodError } from 'zod';
import { prisma, Prisma } from '@pulseweave/database';
import { logger } from '../utils/logger';
import type { AuthRequest } from './auth';

/**
 * Custom application error class with status code and error code.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Common error factory methods.
 */
export const Errors = {
  badRequest: (message: string, code = 'BAD_REQUEST') => 
    new AppError(message, 400, code),
  
  unauthorized: (message = 'Authentication required', code = 'UNAUTHORIZED') => 
    new AppError(message, 401, code),
  
  forbidden: (message = 'Access denied', code = 'FORBIDDEN') => 
    new AppError(message, 403, code),
  
  notFound: (resource = 'Resource', code = 'NOT_FOUND') => 
    new AppError(`${resource} not found`, 404, code),
  
  conflict: (message: string, code = 'CONFLICT') => 
    new AppError(message, 409, code),
  
  tooManyRequests: (message = 'Too many requests', code = 'RATE_LIMITED') => 
    new AppError(message, 429, code),
  
  internal: (message = 'Internal server error', code = 'INTERNAL_ERROR') => 
    new AppError(message, 500, code, false),
  
  validation: (message: string, code = 'VALIDATION_ERROR') => 
    new AppError(message, 400, code),
};

/**
 * Format Zod validation errors into a readable format.
 */
function formatZodError(error: ZodError): string {
  return error.errors
    .map((e) => `${e.path.join('.')}: ${e.message}`)
    .join(', ');
}

/**
 * Format Prisma errors into user-friendly messages.
 */
function formatPrismaError(error: Prisma.PrismaClientKnownRequestError): AppError {
  switch (error.code) {
    case 'P2002': {
      const target = (error.meta?.target as string[])?.join(', ') || 'field';
      return Errors.conflict(`A record with this ${target} already exists`);
    }
    case 'P2025':
      return Errors.notFound('Record');
    case 'P2003':
      return Errors.badRequest('Invalid reference to related record');
    case 'P2014':
      return Errors.badRequest('Invalid relation data');
    default:
      logger.error('Unhandled Prisma error', { code: error.code, meta: error.meta });
      return Errors.internal('Database operation failed');
  }
}

/**
 * Global error handling middleware.
 * Must be registered last in the middleware chain.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log the error
  const requestInfo = {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userId: (req as AuthRequest).userId,
  };

  // Handle known error types
  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error('Non-operational error', { error: err, ...requestInfo });
    } else {
      logger.warn('Operational error', { error: err.message, code: err.code, ...requestInfo });
    }
    
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  if (err instanceof ZodError) {
    const message = formatZodError(err);
    logger.warn('Validation error', { errors: err.errors, ...requestInfo });
    res.status(400).json({
      error: message,
      code: 'VALIDATION_ERROR',
      details: err.errors,
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const appError = formatPrismaError(err);
    logger.warn('Database error', { code: err.code, ...requestInfo });
    res.status(appError.statusCode).json({
      error: appError.message,
      code: appError.code,
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    logger.warn('Prisma validation error', { ...requestInfo });
    res.status(400).json({
      error: 'Invalid data provided',
      code: 'VALIDATION_ERROR',
    });
    return;
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      error: 'Invalid token',
      code: 'INVALID_TOKEN',
    });
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      error: 'Token expired',
      code: 'TOKEN_EXPIRED',
    });
    return;
  }

  // Unknown error - log full details but return generic message
  logger.error('Unhandled error', { 
    error: err.message, 
    stack: err.stack,
    ...requestInfo 
  });

  res.status(500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred' 
      : err.message,
    code: 'INTERNAL_ERROR',
  });
}

/**
 * Async route handler wrapper to catch errors.
 * Eliminates need for try-catch in every route.
 */
export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Wraps all async route handlers on an Express router to catch unhandled rejections.
 * This is a safety net for routes that aren't wrapped with asyncHandler individually.
 */
export function wrapRouter(router: Router): Router {
  const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;
  for (const method of methods) {
    const original = router[method].bind(router) as (path: string, ...handlers: unknown[]) => void;
    (router as unknown as Record<string, unknown>)[method] = (path: string, ...handlers: unknown[]) => {
      const wrappedHandlers = handlers.map((handler) => {
        if (typeof handler !== 'function') return handler;
        if (handler.constructor?.name === 'AsyncFunction') {
          return asyncHandler(handler as (req: Request, res: Response, next: NextFunction) => Promise<unknown>);
        }
        return handler;
      });
      return original(path, ...wrappedHandlers);
    };
  }
  return router;
}

/**
 * Not found handler for undefined routes.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: `Route ${req.method} ${req.path} not found`,
    code: 'ROUTE_NOT_FOUND',
  });
}
