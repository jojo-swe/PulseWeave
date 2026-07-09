import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Request logging middleware.
 * Logs all incoming requests with timing information.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const requestId = generateRequestId();
  
  // Attach request ID for tracing
  (req as Request & { requestId?: string }).requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const userId = (req as Request & { userId?: string }).userId;
    
    // Skip logging for health checks and static files
    if (req.path === '/health' || req.path.startsWith('/uploads/')) {
      return;
    }

    logger.request(req.method, req.path, res.statusCode, duration, userId);
  });

  next();
}

/**
 * Generate a unique request ID for tracing.
 */
function generateRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}
