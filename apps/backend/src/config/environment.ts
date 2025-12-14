import { z } from 'zod';
import crypto from 'crypto';
import { logger } from '../utils/logger';

/**
 * Environment configuration schema with validation.
 */
const envSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Server
  PORT: z.string().transform(Number).default('9090'),
  HOST: z.string().default('0.0.0.0'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // JWT Configuration
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRY: z.string().default('1d'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // Cookie Configuration
  COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 characters').optional(),
  COOKIE_DOMAIN: z.string().optional(),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:9797'),

  // SSL/TLS
  SSL_ENABLED: z.string().transform((v) => v === 'true').default('false'),
  BEHIND_PROXY: z.string().transform((v) => v === 'true').default('false'),
  SSL_KEY_PATH: z.string().optional(),
  SSL_CERT_PATH: z.string().optional(),
  SSL_CA_PATH: z.string().optional(),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('900000'), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),
  AUTH_RATE_LIMIT_MAX: z.string().transform(Number).default('10'),

  // Security
  MAX_FAILED_ATTEMPTS: z.string().transform(Number).default('10'),
  IP_BLOCK_DURATION_MINUTES: z.string().transform(Number).default('30'),
  ACCOUNT_MAX_FAILED_ATTEMPTS: z.string().transform(Number).default('5'),
  ACCOUNT_LOCKOUT_DURATION_MINUTES: z.string().transform(Number).default('15'),

  // Session
  USE_DB_SESSIONS: z.string().transform((v) => v === 'true').default('false'),
  SESSION_EXPIRY_HOURS: z.string().transform(Number).default('24'),

  // File Upload
  MAX_FILE_SIZE_MB: z.string().transform(Number).default('10'),
  UPLOAD_DIR: z.string().default('./uploads'),

  // LDAP (optional)
  LDAP_ENABLED: z.string().transform((v) => v === 'true').default('false'),
  LDAP_URL: z.string().optional(),
  LDAP_BIND_DN: z.string().optional(),
  LDAP_BIND_PASSWORD: z.string().optional(),
  LDAP_SEARCH_BASE: z.string().optional(),

  // External Services (optional)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform(Number).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  // Monitoring (optional)
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validated environment configuration.
 */
let config: EnvConfig | null = null;

/**
 * Security warnings for non-production configurations.
 */
interface SecurityWarning {
  level: 'warn' | 'error';
  message: string;
  recommendation: string;
}

/**
 * Validates and loads environment configuration.
 * Throws on critical errors, logs warnings for non-critical issues.
 */
export function loadEnvironment(): EnvConfig {
  if (config) return config;

  const warnings: SecurityWarning[] = [];
  const errors: string[] = [];

  if (!process.env.JWT_ACCESS_EXPIRY && process.env.JWT_EXPIRES_IN) {
    process.env.JWT_ACCESS_EXPIRY = process.env.JWT_EXPIRES_IN;
  }

  if (!process.env.JWT_REFRESH_EXPIRY && process.env.JWT_REFRESH_EXPIRES_IN) {
    process.env.JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRES_IN;
  }

  if (!process.env.RATE_LIMIT_MAX_REQUESTS && process.env.RATE_LIMIT_MAX) {
    process.env.RATE_LIMIT_MAX_REQUESTS = process.env.RATE_LIMIT_MAX;
  }

  if (!process.env.CORS_ORIGINS && process.env.ALLOWED_ORIGINS) {
    process.env.CORS_ORIGINS = process.env.ALLOWED_ORIGINS;
  }

  // Set defaults for development
  if (!process.env.JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      errors.push('JWT_SECRET is required in production');
    } else {
      process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
      warnings.push({
        level: 'warn',
        message: 'JWT_SECRET not set, using random value',
        recommendation: 'Set JWT_SECRET in .env for persistent sessions',
      });
    }
  }

  if (!process.env.COOKIE_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      errors.push('COOKIE_SECRET is required in production');
    } else {
      process.env.COOKIE_SECRET = crypto.randomBytes(32).toString('hex');
    }
  }

  // Validate schema
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formattedErrors = result.error.errors.map(
      (e) => `  - ${e.path.join('.')}: ${e.message}`
    );
    throw new Error(
      `Environment validation failed:\n${formattedErrors.join('\n')}`
    );
  }

  config = result.data;

  // Production-specific checks
  if (config.NODE_ENV === 'production') {
    // Check JWT secret strength
    if (config.JWT_SECRET.length < 64) {
      warnings.push({
        level: 'warn',
        message: 'JWT_SECRET is shorter than recommended',
        recommendation: 'Use at least 64 characters for production',
      });
    }

    // Check for common weak secrets
    const weakSecrets = ['secret', 'password', 'change-me', 'development'];
    if (weakSecrets.some((weak) => config!.JWT_SECRET.toLowerCase().includes(weak))) {
      errors.push('JWT_SECRET appears to contain a weak/default value');
    }

    // SSL check
    if (!config.SSL_ENABLED && !config.BEHIND_PROXY) {
      warnings.push({
        level: 'warn',
        message: 'SSL is not enabled',
        recommendation: 'Enable SSL_ENABLED=true and configure certificates, or set BEHIND_PROXY=true when terminating TLS in a reverse proxy',
      });
    }

    // Database sessions check
    if (!config.USE_DB_SESSIONS) {
      warnings.push({
        level: 'warn',
        message: 'In-memory sessions are being used',
        recommendation: 'Set USE_DB_SESSIONS=true for production',
      });
    }
  }

  // Log warnings
  for (const warning of warnings) {
    if (warning.level === 'error') {
      logger.error(`🔴 ${warning.message}`, { recommendation: warning.recommendation });
    } else {
      logger.warn(`⚠️  ${warning.message}`, { recommendation: warning.recommendation });
    }
  }

  // Throw on errors
  if (errors.length > 0) {
    throw new Error(`Environment configuration errors:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }

  logger.info('Environment configuration loaded', {
    nodeEnv: config.NODE_ENV,
    port: config.PORT,
    sslEnabled: config.SSL_ENABLED,
    behindProxy: config.BEHIND_PROXY,
    dbSessions: config.USE_DB_SESSIONS,
  });

  return config;
}

/**
 * Gets the current environment configuration.
 * Throws if not yet loaded.
 */
export function getConfig(): EnvConfig {
  if (!config) {
    throw new Error('Environment not loaded. Call loadEnvironment() first.');
  }
  return config;
}

/**
 * Checks if running in production mode.
 */
export function isProduction(): boolean {
  return getConfig().NODE_ENV === 'production';
}

/**
 * Checks if running in development mode.
 */
export function isDevelopment(): boolean {
  return getConfig().NODE_ENV === 'development';
}

/**
 * Gets allowed CORS origins as an array.
 */
export function getCorsOrigins(): string[] {
  return getConfig().CORS_ORIGINS.split(',').map((o) => o.trim());
}

/**
 * Generates a secure random secret.
 */
export function generateSecret(length: number = 64): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Masks a secret for logging (shows first 4 and last 4 chars).
 */
export function maskSecret(secret: string): string {
  if (secret.length <= 8) return '****';
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}
