import express from 'express';
import { createServer } from 'http';
import https from 'https';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { prisma } from '@pulseweave/database';
import { authRouter } from './routes/auth';
import { userRouter } from './routes/user';
import { workspaceRouter } from './routes/workspace';
import { channelRouter } from './routes/channel';
import { messageRouter } from './routes/message';
import { dmRouter } from './routes/dm';
import { encryptionRouter } from './routes/encryption';
import uploadRouter from './routes/upload';
import { mfaRouter } from './routes/mfa';
import { adminRouter } from './routes/admin';
import { securityRouter } from './routes/security';
import categoryRouter from './routes/category';
import scheduledRouter from './routes/scheduled';
import webhookRouter from './routes/webhook';
import apiKeyRouter from './routes/apikey';
import externalRouter from './routes/external';
import integrationRouter from './routes/integration';
import paymentRouter from './routes/payments';
import { initializeRbac } from './services/rbac';
import path from 'path';
import { setupSocketHandlers } from './socket';
import { authenticateToken } from './middleware/auth';
import { 
  generalLimiter, 
  authLimiter, 
  sanitizeBody,
  helmetConfig,
  validateEnvironment,
} from './middleware/security';
import {
  getSslConfig,
  loadSslCertificates,
  hstsMiddleware,
  requireHttps,
} from './middleware/ssl';
import {
  ipBlockMiddleware,
  securityHeaders,
  hppMiddleware,
  speedLimiter,
  requestAuditMiddleware,
} from './middleware/advanced-security';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import { setupGracefulShutdown, checkDatabaseHealth } from './utils/graceful-shutdown';
import { logger } from './utils/logger';
import { 
  getHealthStatus, 
  getLivenessStatus, 
  getReadinessStatus, 
  getMetrics,
  startHealthLogging,
  updateWsConnectionCount,
} from './services/health';

// Validate environment on startup
try {
  validateEnvironment();
} catch (error) {
  console.error('Environment validation failed:', error);
  // Don't exit in development, but warn
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

const app = express();

// SSL Configuration
const sslConfig = getSslConfig();
const sslOptions = loadSslCertificates(sslConfig);

// Create appropriate server based on SSL config
const httpServer = sslOptions 
  ? https.createServer(sslOptions, app) 
  : createServer(app);

const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://localhost:3000',
  'https://127.0.0.1:3000',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// =============================================================================
// Security Middleware Stack (order matters!)
// =============================================================================

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Request logging (first, to log all requests)
app.use(requestLogger);

// Request audit logging for security
app.use(requestAuditMiddleware);

// IP blocking check (block malicious IPs early)
app.use(ipBlockMiddleware);

// Helmet security headers
app.use(helmet(helmetConfig));

// Additional security headers
app.use(securityHeaders);

// HSTS (HTTP Strict Transport Security)
app.use(hstsMiddleware());

// Enforce HTTPS in production
if (process.env.NODE_ENV === 'production') {
  app.use(requireHttps);
}

// Cookie parser (for CSRF and sessions)
// SECURITY: Cookie secret must be set in production
const cookieSecret = (() => {
  const secret = process.env.COOKIE_SECRET;
  if (process.env.NODE_ENV === 'production' && !secret) {
    throw new Error('CRITICAL: COOKIE_SECRET must be set in production');
  }
  if (!secret) {
    console.warn('⚠️  WARNING: COOKIE_SECRET not set. Using insecure default.');
    return 'pulseweave-dev-cookie-secret';
  }
  return secret;
})();
app.use(cookieParser(cookieSecret));

// CORS configuration
// SECURITY: More restrictive in production
app.use(cors({
  origin: (origin, callback) => {
    // In production, require explicit origin
    if (process.env.NODE_ENV === 'production') {
      if (!origin) {
        // Block requests with no origin in production (except for same-origin)
        return callback(null, false);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    }
    
    // In development, allow localhost on any port
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || 
        origin.startsWith('http://127.0.0.1:') || 
        origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Session-ID', 'X-Signature', 'X-Timestamp'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'X-CSRF-Token'],
}));

// Body parsing with size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// HTTP Parameter Pollution protection
app.use(hppMiddleware);

// Sanitize all request bodies
app.use(sanitizeBody);

// Progressive slow down for repeated requests
app.use(speedLimiter);

// Apply general rate limiting to all routes
app.use(generalLimiter);

// Health endpoints (Kubernetes-compatible)
// Full health check with all services
app.get('/health', async (req, res) => {
  const health = await getHealthStatus();
  const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Liveness probe - is the server running?
app.get('/health/live', (req, res) => {
  res.json(getLivenessStatus());
});

// Readiness probe - is the server ready to accept traffic?
app.get('/health/ready', async (req, res) => {
  const readiness = await getReadinessStatus();
  res.status(readiness.ready ? 200 : 503).json(readiness);
});

// Prometheus metrics endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(getMetrics());
});

// Make io available to routes
app.set('io', io);

// Routes with specific rate limiters
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/users', authenticateToken, userRouter);
app.use('/api/workspaces', authenticateToken, workspaceRouter);
app.use('/api/channels', authenticateToken, channelRouter);
app.use('/api/messages', authenticateToken, messageRouter);
app.use('/api/dm', authenticateToken, dmRouter);
app.use('/api/encryption', authenticateToken, encryptionRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/mfa', mfaRouter);
app.use('/api/admin', authenticateToken, adminRouter);
app.use('/api/security', authenticateToken, securityRouter);
app.use('/api/categories', authenticateToken, categoryRouter);
app.use('/api/scheduled', authenticateToken, scheduledRouter);
app.use('/api/webhooks', authenticateToken, webhookRouter);
app.use('/api/apikeys', authenticateToken, apiKeyRouter);
app.use('/api/integrations', authenticateToken, integrationRouter);
app.use('/api/external', externalRouter); // External API (uses API key auth)
app.use('/api/hooks', webhookRouter); // Incoming webhooks (no auth - uses token)
app.use('/api/payments', paymentRouter);

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// 404 handler for undefined routes
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Socket.io setup
setupSocketHandlers(io);

const PORT = process.env.PORT || 3001;
const protocol = sslOptions ? 'https' : 'http';

// Verify database connection before starting
async function startServer(): Promise<void> {
  try {
    // Test database connection
    logger.info('Connecting to database...');
    await prisma.$connect();
    logger.info('Database connected successfully');

    // Start HTTP server
    httpServer.listen(PORT, async () => {
      logger.info(`🚀 PulseWeave API running on ${protocol}://localhost:${PORT}`);
      logger.info('📡 WebSocket server ready');
      
      if (sslOptions) {
        logger.info(`🔒 SSL/TLS enabled with ${sslConfig.minVersion || 'TLSv1.2'}+`);
      } else if (process.env.NODE_ENV === 'production') {
        logger.warn('⚠️  SSL is not enabled! Set SSL_ENABLED=true in production');
      }
      
      // Log security status
      logger.info('🛡️  Security features enabled:');
      console.log('   - Rate limiting');
      console.log('   - IP blocking');
      console.log('   - Request auditing');
      console.log('   - HSTS headers');
      console.log('   - XSS protection');
      console.log('   - CSRF protection ready');
      
      // Initialize RBAC system
      try {
        await initializeRbac();
      } catch (error) {
        logger.error('Failed to initialize RBAC', { error: String(error) });
      }

      // Setup graceful shutdown
      setupGracefulShutdown(httpServer, io);

      // Start periodic health logging (every 5 minutes in production)
      if (process.env.NODE_ENV === 'production') {
        startHealthLogging(5 * 60 * 1000);
      }

      // Track WebSocket connections for health metrics
      io.on('connection', () => {
        updateWsConnectionCount(io.engine.clientsCount);
      });
      io.on('disconnect', () => {
        updateWsConnectionCount(io.engine.clientsCount);
      });
    });
  } catch (error) {
    logger.error('Failed to start server', { error: String(error) });
    process.exit(1);
  }
}

startServer();

export { io };
