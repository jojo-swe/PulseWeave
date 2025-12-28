import { Request, Response, NextFunction } from 'express';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';

/**
 * SSL/TLS Configuration.
 */
export interface SslConfig {
  enabled: boolean;
  keyPath: string;
  certPath: string;
  caPath?: string;
  port: number;
  httpRedirect: boolean;
  minVersion?: string;
}

/**
 * Gets SSL configuration from environment variables.
 */
export function getSslConfig(): SslConfig {
  return {
    enabled: process.env.SSL_ENABLED === 'true',
    keyPath: process.env.SSL_KEY_PATH || './certs/server.key',
    certPath: process.env.SSL_CERT_PATH || './certs/server.crt',
    caPath: process.env.SSL_CA_PATH,
    port: parseInt(process.env.SSL_PORT || '3443', 10),
    httpRedirect: process.env.SSL_HTTP_REDIRECT !== 'false',
    minVersion: process.env.SSL_MIN_VERSION || 'TLSv1.2',
  };
}

/**
 * Loads SSL certificates from file system.
 */
export function loadSslCertificates(config: SslConfig): https.ServerOptions | null {
  if (!config.enabled) {
    return null;
  }

  try {
    const keyPath = path.resolve(config.keyPath);
    const certPath = path.resolve(config.certPath);

    if (!fs.existsSync(keyPath)) {
      console.error(`SSL key file not found: ${keyPath}`);
      return null;
    }

    if (!fs.existsSync(certPath)) {
      console.error(`SSL certificate file not found: ${certPath}`);
      return null;
    }

    const options: https.ServerOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
      minVersion: config.minVersion as any,
    };

    // Load CA certificate if provided (for client certificate validation)
    if (config.caPath && fs.existsSync(path.resolve(config.caPath))) {
      options.ca = fs.readFileSync(path.resolve(config.caPath));
      options.requestCert = true;
      options.rejectUnauthorized = true;
    }

    return options;
  } catch (error) {
    console.error('Failed to load SSL certificates:', error);
    return null;
  }
}

/**
 * Creates HTTPS server with the given Express app.
 */
export function createHttpsServer(
  app: Express.Application,
  sslOptions: https.ServerOptions
): https.Server {
  return https.createServer(sslOptions, app as any);
}

/**
 * Creates HTTP to HTTPS redirect server.
 */
export function createHttpRedirectServer(httpsPort: number): http.Server {
  return http.createServer((req, res) => {
    const host = req.headers.host?.replace(/:\d+$/, '') || 'localhost';
    const redirectUrl = `https://${host}:${httpsPort}${req.url}`;
    
    res.writeHead(301, { Location: redirectUrl });
    res.end();
  });
}

/**
 * Middleware to enforce HTTPS in production.
 */
export function requireHttps(req: Request, res: Response, next: NextFunction) {
  // Skip in development
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  const shouldEnforce = process.env.SSL_ENABLED === 'true' || process.env.BEHIND_PROXY === 'true';
  if (!shouldEnforce) {
    return next();
  }

  if (req.path === '/health' || req.path.startsWith('/health/') || req.path === '/metrics') {
    return next();
  }

  // Check if already HTTPS
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    return next();
  }

  const canonicalHost = process.env.CANONICAL_HOST || 'localhost';
  const allowedHosts = (process.env.ALLOWED_REDIRECT_HOSTS || '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);

  const isValidHost = (value: string): boolean =>
    /^[a-zA-Z0-9.-]+(:\d+)?$/.test(value) && (allowedHosts.length === 0 || allowedHosts.includes(value));

  const rawHost = req.get('host') || '';
  const safeHost = isValidHost(rawHost) ? rawHost : canonicalHost;
  const httpsUrl = new URL(req.originalUrl, `https://${safeHost}`).toString();
  res.redirect(301, httpsUrl);
}

/**
 * Middleware to add HSTS header.
 */
export function hstsMiddleware(maxAge: number = 31536000) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only add HSTS header on HTTPS connections
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      res.setHeader(
        'Strict-Transport-Security',
        `max-age=${maxAge}; includeSubDomains; preload`
      );
    }
    next();
  };
}

/**
 * Generates a self-signed certificate for development.
 * Requires openssl to be installed.
 */
export async function generateSelfSignedCert(outputDir: string = './certs'): Promise<boolean> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  const keyPath = path.join(outputDir, 'server.key');
  const certPath = path.join(outputDir, 'server.crt');

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate self-signed certificate
  const command = `openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=localhost"`;

  try {
    await execAsync(command);
    console.log('Self-signed certificate generated successfully');
    console.log(`Key: ${keyPath}`);
    console.log(`Certificate: ${certPath}`);
    return true;
  } catch (error) {
    console.error('Failed to generate self-signed certificate:', error);
    console.log('Make sure openssl is installed and in your PATH');
    return false;
  }
}
