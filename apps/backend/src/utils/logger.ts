/**
 * Structured logger for the backend.
 * In production, this could be replaced with Winston, Pino, or sent to a logging service.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

/**
 * Format log entry for output.
 */
function formatLog(entry: LogEntry): string {
  const contextStr = entry.context 
    ? ` ${JSON.stringify(entry.context)}` 
    : '';
  return `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}${contextStr}`;
}

/**
 * Create a log entry and output it.
 */
function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) {
    return;
  }

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
  };

  const formatted = formatLog(entry);

  switch (level) {
    case 'error':
      console.error(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    default:
      console.log(formatted);
  }
}

function argsToMessage(args: unknown[]): string {
  return args.map(arg =>
    typeof arg === 'string' ? arg :
    arg instanceof Error ? arg.message :
    JSON.stringify(arg)
  ).join(' ');
}

export const logger = {
  debug: (...args: unknown[]) => log('debug', argsToMessage(args)),
  info: (...args: unknown[]) => log('info', argsToMessage(args)),
  warn: (...args: unknown[]) => log('warn', argsToMessage(args)),
  error: (...args: unknown[]) => log('error', argsToMessage(args)),
  
  /**
   * Log an HTTP request.
   */
  request: (method: string, path: string, statusCode: number, duration: number, userId?: string) => {
    const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    log(level, `${method} ${path} ${statusCode}`, { duration: `${duration}ms`, userId });
  },

  /**
   * Log a database query (for debugging).
   */
  query: (query: string, duration: number) => {
    if (process.env.LOG_QUERIES === 'true') {
      log('debug', 'Database query', { query: query.substring(0, 200), duration: `${duration}ms` });
    }
  },
};
