/**
 * Centralized logging and error reporting service.
 * Supports console logging and optional Sentry integration.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  userId?: string;
  workspaceId?: string;
  requestId?: string;
  [key: string]: unknown;
}

interface ErrorContext extends LogContext {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

// Sentry SDK will be dynamically imported if DSN is configured
let Sentry: typeof import('@sentry/node') | null = null;

const LOG_LEVEL = (process.env.LOG_LEVEL || 'info') as LogLevel;
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Initialize Sentry if DSN is configured
 */
export async function initErrorReporting(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  
  if (!dsn) {
    console.log('[Logger] Sentry DSN not configured, error reporting disabled');
    return;
  }

  try {
    Sentry = await import('@sentry/node');
    
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.npm_package_version || '1.0.0',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      integrations: [
        // Add any custom integrations here
      ],
      beforeSend(event) {
        // Scrub sensitive data
        if (event.request?.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
        }
        return event;
      },
    });

    console.log('[Logger] Sentry initialized successfully');
  } catch (error) {
    console.error('[Logger] Failed to initialize Sentry:', error);
  }
}

/**
 * Check if a log level should be output
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[LOG_LEVEL];
}

/**
 * Format log message with timestamp and context
 */
function formatMessage(level: LogLevel, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` ${JSON.stringify(context)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
}

/**
 * Log a debug message
 */
export function logDebug(message: string, context?: LogContext): void {
  if (shouldLog('debug')) {
    console.debug(formatMessage('debug', message, context));
  }
}

/**
 * Log an info message
 */
export function logInfo(message: string, context?: LogContext): void {
  if (shouldLog('info')) {
    console.info(formatMessage('info', message, context));
  }
}

/**
 * Log a warning message
 */
export function logWarn(message: string, context?: LogContext): void {
  if (shouldLog('warn')) {
    console.warn(formatMessage('warn', message, context));
  }
  
  // Also send to Sentry as breadcrumb
  if (Sentry) {
    Sentry.addBreadcrumb({
      category: 'warning',
      message,
      level: 'warning',
      data: context,
    });
  }
}

/**
 * Log an error and optionally report to Sentry
 */
export function logError(
  message: string,
  error?: Error | unknown,
  context?: ErrorContext
): void {
  const errorObj = error instanceof Error ? error : new Error(String(error || message));
  
  if (shouldLog('error')) {
    console.error(formatMessage('error', message, context));
    if (error) {
      console.error(errorObj);
    }
  }

  // Report to Sentry
  if (Sentry) {
    const sentry = Sentry;
    sentry.withScope((scope) => {
      if (context?.userId) {
        scope.setUser({ id: context.userId });
      }
      if (context?.tags) {
        Object.entries(context.tags).forEach(([key, value]) => {
          scope.setTag(key, value);
        });
      }
      if (context?.extra) {
        Object.entries(context.extra).forEach(([key, value]) => {
          scope.setExtra(key, value);
        });
      }
      if (context?.workspaceId) {
        scope.setTag('workspaceId', context.workspaceId);
      }
      if (context?.requestId) {
        scope.setTag('requestId', context.requestId);
      }

      sentry.captureException(errorObj);
    });
  }
}

/**
 * Capture a message in Sentry (for non-error events)
 */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  context?: LogContext
): void {
  if (Sentry) {
    const sentry = Sentry;
    sentry.withScope((scope) => {
      if (context?.userId) {
        scope.setUser({ id: context.userId });
      }
      if (context) {
        Object.entries(context).forEach(([key, value]) => {
          if (key !== 'userId') {
            scope.setExtra(key, value);
          }
        });
      }

      sentry.captureMessage(message, level);
    });
  }
}

/**
 * Set user context for Sentry
 */
export function setUserContext(userId: string, email?: string, username?: string): void {
  if (Sentry) {
    Sentry.setUser({
      id: userId,
      email,
      username,
    });
  }
}

/**
 * Clear user context (on logout)
 */
export function clearUserContext(): void {
  if (Sentry) {
    Sentry.setUser(null);
  }
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>
): void {
  if (Sentry) {
    Sentry.addBreadcrumb({
      category,
      message,
      data,
      level: 'info',
    });
  }
}

/**
 * Express error handler middleware
 */
export function errorHandler() {
  return (err: Error, req: any, res: any, next: any) => {
    logError('Unhandled error', err, {
      requestId: req.id,
      userId: req.userId,
      extra: {
        method: req.method,
        url: req.url,
        body: req.body,
      },
    });

    // Don't expose error details in production
    const message = process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message;

    res.status(500).json({ error: message });
  };
}

// Export a default logger object for convenience
export const logger = {
  debug: logDebug,
  info: logInfo,
  warn: logWarn,
  error: logError,
  captureMessage,
  setUserContext,
  clearUserContext,
  addBreadcrumb,
};
