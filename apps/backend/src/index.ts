import express from 'express';
import { createServer } from 'http';
import https from 'https';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth';
import { userRouter } from './routes/user';
import { workspaceRouter } from './routes/workspace';
import { channelRouter } from './routes/channel';
import { messageRouter } from './routes/message';
import { dmRouter } from './routes/dm';
import uploadRouter from './routes/upload';
import { mfaRouter } from './routes/mfa';
import { adminRouter } from './routes/admin';
import { securityRouter } from './routes/security';
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

// Request audit logging (first, to log all requests)
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
app.use(cookieParser(process.env.COOKIE_SECRET || 'change-me-in-production'));

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || 
        origin.startsWith('http://127.0.0.1:') || 
        origin.startsWith('http://localhost:') ||
        origin.startsWith('https://127.0.0.1:') ||
        origin.startsWith('https://localhost:')) {
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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
app.use('/api/upload', uploadRouter);
app.use('/api/mfa', mfaRouter);
app.use('/api/admin', authenticateToken, adminRouter);
app.use('/api/security', authenticateToken, securityRouter);

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Socket.io setup
setupSocketHandlers(io);

const PORT = process.env.PORT || 3001;
const protocol = sslOptions ? 'https' : 'http';

httpServer.listen(PORT, async () => {
  console.log(`🚀 PulseWeave API running on ${protocol}://localhost:${PORT}`);
  console.log(`📡 WebSocket server ready`);
  
  if (sslOptions) {
    console.log(`🔒 SSL/TLS enabled with ${sslConfig.minVersion || 'TLSv1.2'}+`);
  } else if (process.env.NODE_ENV === 'production') {
    console.warn('⚠️  SSL is not enabled! Set SSL_ENABLED=true in production');
  }
  
  // Log security status
  console.log('🛡️  Security features enabled:');
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
    console.error('Failed to initialize RBAC:', error);
  }
});

export { io };
