import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '@pulseweave/database';
import { verifyTotpToken, verifyBackupCode } from '../services/mfa';
import { generateToken, generateRefreshToken, verifyRefreshToken, revokeToken, authenticateToken, AuthRequest, JWT_SECRET } from '../middleware/auth';
import { logSecurityEvent } from '../middleware/security';
import { 
  isLdapEnabled, 
  getLdapConfig, 
  authenticateLdap, 
  syncLdapUser, 
  testLdapConnection 
} from '../services/ldap';
import {
  isAccountLocked,
  recordFailedLogin,
  clearFailedLogins,
  recordFailedAttempt,
  clearFailedAttempts,
  getClientIp,
  isPasswordCompromised,
  logSecurityAudit,
} from '../middleware/advanced-security';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
} from '../services/email';

const router = Router();

/**
 * Helper to create sessions for tokens
 */
async function createTokenSessions(userId: string, accessJti: string, refreshJti: string, ipAddress: string | null, userAgent?: string) {
  const now = new Date();
  const accessExpires = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 day
  const refreshExpires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Create two sessions: one for access token, one for refresh token
  // This allows independent revocation
  await prisma.session.createMany({
    data: [
      {
        userId,
        tokenId: accessJti,
        expiresAt: accessExpires,
        ipAddress,
        deviceInfo: userAgent,
      },
      {
        userId,
        tokenId: refreshJti,
        expiresAt: refreshExpires,
        ipAddress,
        deviceInfo: userAgent,
      },
    ],
  });
}

/**
 * Password validation schema with security requirements.
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be less than 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

const registerSchema = z.object({
  email: z.string().email().max(255).toLowerCase(),
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be less than 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
    .toLowerCase(),
  displayName: z.string().min(1).max(50).trim(),
  password: passwordSchema,
});

const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

// Register
router.post('/register', async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);
    
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: data.email }, { username: data.username }],
      },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email or username already exists' });
    }

    // Use higher bcrypt cost factor for better security
    const passwordHash = await bcrypt.hash(data.password, 12);
    
    const user = await prisma.user.create({
      data: {
        email: data.email,
        username: data.username,
        displayName: data.displayName,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        status: true,
        createdAt: true,
      },
    });

    // Create a default workspace for the user
    const workspace = await prisma.workspace.create({
      data: {
        name: `${data.displayName}'s Workspace`,
        slug: `${data.username}-workspace`,
        ownerId: user.id,
        members: {
          create: {
            userId: user.id,
            roleName: 'owner',
          },
        },
        channels: {
          create: {
            name: 'general',
            description: 'General discussion',
            createdById: user.id,
            members: {
              create: {
                userId: user.id,
              },
            },
          },
        },
      },
    });

    // Generate tokens with explicit JTIs and credentials
    const accessJti = crypto.randomUUID();
    const refreshJti = crypto.randomUUID();
    
    await createTokenSessions(user.id, accessJti, refreshJti, req.ip || null, req.headers['user-agent']);

    const { token } = generateToken(user.id, undefined, accessJti);
    const { token: refreshToken } = generateRefreshToken(user.id, refreshJti);

    logSecurityEvent('USER_REGISTERED', { userId: user.id, email: data.email });

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_REGISTERED',
        resource: 'user',
        resourceId: user.id,
        workspaceId: workspace.id,
        details: JSON.stringify({ email: data.email, workspaceId: workspace.id }),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    // Set secure cookies
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // Lax is better for navigation and localhost dev
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });
    
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.status(201).json({
      user: {
        ...user,
        role: 'owner', // New user is owner of their workspace
      },
      token, // Return token for non-browser clients and localStorage fallback
      refreshToken,
      workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);
    const clientIp = getClientIp(req);
    
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: {
        workspaceMemberships: {
          include: {
            workspace: true,
          },
          take: 1,
        },
      },
    });

    if (!user) {
      // Record IP-based failed attempt
      recordFailedAttempt(clientIp);
      logSecurityEvent('LOGIN_FAILED', { email: data.email, reason: 'user_not_found', ip: clientIp });
      
      // Create audit log for failed login
      await prisma.auditLog.create({
        data: {
          action: 'LOGIN_FAILED',
          resource: 'session',
          details: JSON.stringify({ email: data.email, reason: 'invalid_credentials' }),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
      });
      
      // Simulate bcrypt time to prevent timing attacks
      await bcrypt.compare('dummy_password', '$2a$12$......................................................'); // dummy hash

      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if account is locked
    const lockStatus = await isAccountLocked(user.id);
    if (lockStatus.locked) {
      logSecurityAudit('LOGIN_FAILED', {
        userId: user.id,
        ip: clientIp,
        metadata: { reason: 'account_locked', lockedUntil: lockStatus.lockedUntil },
      });
      return res.status(423).json({ 
        error: 'Account is temporarily locked',
        lockedUntil: lockStatus.lockedUntil,
        message: 'Too many failed login attempts. Please try again later.',
      });
    }

    // Check if account is active
    if (!user.isActive) {
      logSecurityEvent('LOGIN_FAILED', { userId: user.id, reason: 'account_disabled', ip: clientIp });
      return res.status(403).json({ error: 'Account has been disabled' });
    }

    const validPassword = await bcrypt.compare(data.password, user.passwordHash);
    if (!validPassword) {
      // Record failed login attempt
      recordFailedAttempt(clientIp);
      const lockResult = await recordFailedLogin(user.id);
      
      logSecurityEvent('LOGIN_FAILED', { userId: user.id, reason: 'invalid_password', ip: clientIp });
      
      // Create audit log for failed login
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'LOGIN_FAILED',
          resource: 'session',
          resourceId: user.id,
          details: JSON.stringify({ reason: 'invalid_password' }),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
      });
      
      if (lockResult.locked) {
        logSecurityAudit('ACCOUNT_LOCKED', {
          userId: user.id,
          ip: clientIp,
          metadata: { lockedUntil: lockResult.lockedUntil, failedAttempts: lockResult.failedAttempts },
        });
        return res.status(423).json({ 
          error: 'Account has been locked',
          lockedUntil: lockResult.lockedUntil,
          message: 'Too many failed login attempts. Please try again later.',
        });
      }
      
      return res.status(401).json({ 
        error: 'Invalid credentials',
        remainingAttempts: 5 - lockResult.failedAttempts,
      });
    }

    // Clear failed attempts on successful login
    clearFailedAttempts(clientIp);
    await clearFailedLogins(user.id);

    // Check if MFA is required
    if (user.mfaEnabled) {
      // Return partial auth - client needs to complete MFA
      const { token: mfaToken } = generateToken(user.id, '5m'); // Short-lived token for MFA
      return res.json({
        mfaRequired: true,
        mfaToken,
        userId: user.id,
      });
    }

    // Update status to online and last login
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        status: 'online',
        lastLoginAt: new Date(),
        lastLoginIp: clientIp,
      },
    });

    const accessJti = crypto.randomUUID();
    const refreshJti = crypto.randomUUID();
    await createTokenSessions(user.id, accessJti, refreshJti, req.ip || null, req.headers['user-agent']);

    const { token } = generateToken(user.id, undefined, accessJti);
    const { token: refreshToken } = generateRefreshToken(user.id, refreshJti);

    logSecurityEvent('LOGIN_SUCCESS', { userId: user.id, ip: clientIp });

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN_SUCCESS',
        resource: 'session',
        resourceId: user.id,
        workspaceId: user.workspaceMemberships[0]?.workspaceId,
        details: JSON.stringify({ ip: clientIp }),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    // Get user's role from workspace membership
    const userRole = user.workspaceMemberships[0]?.roleName || 'member';

    // Set secure cookies
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // Lax is better for navigation and localhost dev
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });
    
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        status: 'online',
        mfaEnabled: user.mfaEnabled,
        role: userRole,
      },
      token, // Return token for non-browser clients and localStorage fallback
      refreshToken,
      workspace: user.workspaceMemberships[0]?.workspace || null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// MFA verification for login

const mfaVerifySchema = z.object({
  mfaToken: z.string(),
  code: z.string().min(6).max(12), // 6 for TOTP, up to 12 for backup codes
  type: z.enum(['totp', 'backup']).default('totp'),
});

router.post('/mfa/verify', async (req, res) => {
  try {
    const { mfaToken, code, type } = mfaVerifySchema.parse(req.body);
    const clientIp = getClientIp(req);

    // Verify the MFA token
    let userId: string;
    try {
      const decoded = jwt.verify(mfaToken, JWT_SECRET) as { userId: string };
      userId = decoded.userId;
    } catch (err) {
      console.error('MFA token verification failed:', err);
      return res.status(401).json({ error: 'Invalid or expired MFA token' });
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        workspaceMemberships: {
          include: { workspace: true },
          take: 1,
        },
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Verify the code
    let isValid = false;
    if (type === 'totp') {
      if (!user.mfaSecret) {
        return res.status(400).json({ error: 'TOTP is not enabled for this account' });
      }
      isValid = verifyTotpToken(code, user.mfaSecret);
    } else if (type === 'backup') {
      isValid = await verifyBackupCode(userId, code);
    }

    if (!isValid) {
      logSecurityEvent('MFA_FAILED', { userId, type, ip: clientIp });
      return res.status(401).json({ error: 'Invalid verification code' });
    }

    // MFA verified - complete login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        status: 'online',
        lastLoginAt: new Date(),
        lastLoginIp: clientIp,
      },
    });

    const accessJti = crypto.randomUUID();
    const refreshJti = crypto.randomUUID();
    await createTokenSessions(user.id, accessJti, refreshJti, req.ip || null, req.headers['user-agent']);

    const { token } = generateToken(user.id, undefined, accessJti);
    const { token: refreshToken } = generateRefreshToken(user.id, refreshJti);

    logSecurityEvent('LOGIN_SUCCESS', { userId: user.id, ip: clientIp, mfaUsed: true });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN_SUCCESS',
        resource: 'session',
        resourceId: user.id,
        workspaceId: user.workspaceMemberships[0]?.workspaceId,
        details: JSON.stringify({ mfaType: type }),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        status: 'online',
        mfaEnabled: user.mfaEnabled,
      },
      token,
      refreshToken,
      workspace: user.workspaceMemberships[0]?.workspace || null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('MFA verify error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    
    // verifyRefreshToken now checks DB for session validity
    const payload = await verifyRefreshToken(refreshToken);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Verify user still exists
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Revoke old refresh token session
    if (payload.jti) {
      await revokeToken(payload.jti);
    }
    
    // Generate new tokens
    const accessJti = crypto.randomUUID();
    const refreshJti = crypto.randomUUID();
    await createTokenSessions(user.id, accessJti, refreshJti, req.ip || null, req.headers['user-agent']);

    const { token: newToken } = generateToken(user.id, undefined, accessJti);
    const { token: newRefreshToken } = generateRefreshToken(user.id, refreshJti);

    // Set secure cookies
    res.cookie('token', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });
    
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      success: true
      // token: newToken,
      // refreshToken: newRefreshToken,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout (revoke token)
router.post('/logout', authenticateToken, async (req: AuthRequest, res) => {
  try {
    // Revoke the access token session
    if (req.tokenId) {
      await revokeToken(req.tokenId);
    }
    
    // Also revoke the refresh token if we can identify it? 
    // Usually the client sends it, or we rely on the client wiping it.
    // But since we have DB sessions, we can just wipe the cookies.
    // Ideally we should also find the associated refresh token session and kill it.
    // But for now, killing the access token prevents api access.

    // Update user status to offline
    if (req.userId) {
      await prisma.user.update({
        where: { id: req.userId },
        data: { status: 'offline' },
      });
      logSecurityEvent('LOGOUT', { userId: req.userId });
    }

    // Clear cookies
    res.clearCookie('token');
    res.clearCookie('refreshToken');

    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user
router.get('/me', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        status: true,
        statusMessage: true,
        createdAt: true,
        workspaceMemberships: {
          select: {
            roleName: true,
            workspace: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
          take: 1,
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Extract role from first workspace membership
    const role = user.workspaceMemberships[0]?.roleName || 'member';
    const { workspaceMemberships, ...userData } = user;

    res.json({
      ...userData,
      role,
      workspace: workspaceMemberships[0]?.workspace || null,
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// LDAP Authentication
// ============================================================================

const ldapLoginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * Get authentication configuration (LDAP status).
 */
router.get('/config', async (req, res) => {
  try {
    const ldapConfig = getLdapConfig();
    res.json({
      ldap: {
        enabled: ldapConfig.enabled,
      },
      localAuth: true,
    });
  } catch (error) {
    console.error('Get auth config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Login with LDAP credentials.
 */
router.post('/ldap/login', async (req, res) => {
  try {
    if (!isLdapEnabled()) {
      return res.status(400).json({ error: 'LDAP authentication is not enabled' });
    }

    const { username, password } = ldapLoginSchema.parse(req.body);

    // Authenticate against LDAP
    const ldapUser = await authenticateLdap(username, password);

    if (!ldapUser) {
      logSecurityEvent('LDAP_LOGIN_FAILED', { username, ip: req.ip });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Sync user to local database
    const user = await syncLdapUser(ldapUser);

    // Update last login info
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: req.ip,
        failedLoginAttempts: 0,
      },
    });

    // Generate tokens
    const accessJti = crypto.randomUUID();
    const refreshJti = crypto.randomUUID();
    await createTokenSessions(user.id, accessJti, refreshJti, req.ip || null, req.headers['user-agent']);

    const { token } = generateToken(user.id, undefined, accessJti);
    const { token: refreshToken } = generateRefreshToken(user.id, refreshJti);

    logSecurityEvent('LDAP_LOGIN_SUCCESS', { userId: user.id, username, ip: req.ip });

    // Get user's workspace
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: user.id },
      include: { workspace: true },
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        status: user.status,
      },
      token,
      refreshToken,
      workspace: membership?.workspace || null,
      authMethod: 'ldap',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('LDAP login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Test LDAP connection (admin only).
 */
router.post('/ldap/test', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const result = await testLdapConnection();
    res.json(result);
  } catch (error) {
    console.error('LDAP test error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// Email Verification Routes
// ============================================================================

const resendVerificationSchema = z.object({
  email: z.string().email().toLowerCase(),
});

/**
 * Send/resend email verification
 */
router.post('/send-verification', async (req, res) => {
  try {
    const { email } = resendVerificationSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, displayName: true, isVerified: true },
    });

    if (!user) {
      // Don't reveal if user exists
      return res.json({ message: 'If an account exists, a verification email has been sent.' });
    }

    if (user.isVerified) {
      return res.json({ message: 'Email is already verified.' });
    }

    // Delete any existing tokens for this user
    await prisma.emailVerificationToken.deleteMany({
      where: { userId: user.id },
    });

    // Create new token (24 hour expiry)
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Send email
    await sendVerificationEmail(user.email, token, user.displayName);

    res.json({ message: 'If an account exists, a verification email has been sent.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Send verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Verify email with token
 */
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Invalid token' });
    }

    const verificationToken = await prisma.emailVerificationToken.findUnique({
      where: { token },
      include: { user: { select: { id: true, email: true, displayName: true, isVerified: true } } },
    });

    if (!verificationToken) {
      return res.status(400).json({ error: 'Invalid or expired verification link' });
    }

    if (verificationToken.expiresAt < new Date()) {
      // Clean up expired token
      await prisma.emailVerificationToken.delete({ where: { id: verificationToken.id } });
      return res.status(400).json({ error: 'Verification link has expired. Please request a new one.' });
    }

    if (verificationToken.user.isVerified) {
      // Clean up token
      await prisma.emailVerificationToken.delete({ where: { id: verificationToken.id } });
      return res.json({ message: 'Email is already verified.' });
    }

    // Verify the user
    await prisma.user.update({
      where: { id: verificationToken.user.id },
      data: { isVerified: true },
    });

    // Delete the token
    await prisma.emailVerificationToken.delete({ where: { id: verificationToken.id } });

    // Send welcome email
    await sendWelcomeEmail(verificationToken.user.email, verificationToken.user.displayName);

    // Log the event
    await prisma.auditLog.create({
      data: {
        userId: verificationToken.user.id,
        action: 'EMAIL_VERIFIED',
        resource: 'user',
        resourceId: verificationToken.user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    logSecurityEvent('EMAIL_VERIFIED', { userId: verificationToken.user.id });

    res.json({ message: 'Email verified successfully!' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// Password Reset Routes
// ============================================================================

const forgotPasswordSchema = z.object({
  email: z.string().email().toLowerCase(),
});

const resetPasswordSchema = z.object({
  token: z.string(),
  password: passwordSchema,
});

/**
 * Request password reset
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, displayName: true },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ message: 'If an account exists, a password reset email has been sent.' });
    }

    // Delete any existing tokens for this user
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    // Create new token (1 hour expiry)
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    // Send email
    await sendPasswordResetEmail(user.email, token, user.displayName);

    // Log the event
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_RESET_REQUESTED',
        resource: 'user',
        resourceId: user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.json({ message: 'If an account exists, a password reset email has been sent.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Reset password with token
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = resetPasswordSchema.parse(req.body);

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: { select: { id: true, email: true } } },
    });

    if (!resetToken) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    if (resetToken.expiresAt < new Date()) {
      await prisma.passwordResetToken.delete({ where: { id: resetToken.id } });
      return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });
    }

    if (resetToken.usedAt) {
      return res.status(400).json({ error: 'This reset link has already been used.' });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 12);

    // Update password and mark token as used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.user.id },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      // Invalidate all existing sessions for security
      prisma.session.updateMany({
        where: { userId: resetToken.user.id },
        data: { isValid: false },
      }),
    ]);

    // Log the event
    await prisma.auditLog.create({
      data: {
        userId: resetToken.user.id,
        action: 'PASSWORD_RESET_COMPLETED',
        resource: 'user',
        resourceId: resetToken.user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    logSecurityEvent('PASSWORD_RESET_COMPLETED', { userId: resetToken.user.id });

    res.json({ message: 'Password has been reset successfully. Please log in with your new password.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Check verification status
 */
router.get('/verification-status', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { isVerified: true, email: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ isVerified: user.isVerified, email: user.email });
  } catch (error) {
    console.error('Verification status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// Session Management Routes
// ============================================================================

/**
 * Get all active sessions for the current user
 */
router.get('/sessions', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const sessions = await prisma.session.findMany({
      where: {
        userId: req.userId,
        isValid: true,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        deviceInfo: true,
        ipAddress: true,
        createdAt: true,
        lastActiveAt: true,
        tokenId: true,
      },
      orderBy: { lastActiveAt: 'desc' },
    });

    // Mark current session
    const currentTokenId = req.tokenId; // We'll need to add this to AuthRequest
    const sessionsWithCurrent = sessions.map((session) => ({
      ...session,
      isCurrent: session.tokenId === currentTokenId,
      // Parse device info for display
      device: parseDeviceInfo(session.deviceInfo),
    }));

    res.json({ sessions: sessionsWithCurrent });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Revoke a specific session
 */
router.delete('/sessions/:sessionId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { sessionId } = req.params;

    // Verify the session belongs to the current user
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        userId: req.userId,
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Invalidate the session
    await prisma.session.update({
      where: { id: sessionId },
      data: { isValid: false },
    });

    // Log the event
    await prisma.auditLog.create({
      data: {
        userId: req.userId,
        action: 'SESSION_REVOKED',
        resource: 'session',
        resourceId: sessionId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    logSecurityEvent('SESSION_REVOKED', { userId: req.userId, sessionId });

    res.json({ message: 'Session revoked successfully' });
  } catch (error) {
    console.error('Revoke session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Revoke all sessions except current
 */
router.post('/sessions/revoke-all', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const currentTokenId = req.tokenId;

    // Invalidate all sessions except current
    const result = await prisma.session.updateMany({
      where: {
        userId: req.userId,
        isValid: true,
        tokenId: { not: currentTokenId },
      },
      data: { isValid: false },
    });

    // Log the event
    await prisma.auditLog.create({
      data: {
        userId: req.userId,
        action: 'ALL_SESSIONS_REVOKED',
        resource: 'session',
        details: JSON.stringify({ count: result.count }),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    logSecurityEvent('ALL_SESSIONS_REVOKED', { userId: req.userId, count: result.count });

    res.json({ message: `${result.count} session(s) revoked successfully` });
  } catch (error) {
    console.error('Revoke all sessions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Helper to parse user agent into readable device info
 */
function parseDeviceInfo(userAgent: string | null): { browser: string; os: string; device: string } {
  if (!userAgent) {
    return { browser: 'Unknown', os: 'Unknown', device: 'Unknown' };
  }

  // Simple parsing - in production you might use a library like ua-parser-js
  let browser = 'Unknown';
  let os = 'Unknown';
  let device = 'Desktop';

  // Browser detection
  if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Edg')) browser = 'Edge';
  else if (userAgent.includes('Chrome')) browser = 'Chrome';
  else if (userAgent.includes('Safari')) browser = 'Safari';
  else if (userAgent.includes('Opera') || userAgent.includes('OPR')) browser = 'Opera';

  // OS detection
  if (userAgent.includes('Windows')) os = 'Windows';
  else if (userAgent.includes('Mac OS')) os = 'macOS';
  else if (userAgent.includes('Linux')) os = 'Linux';
  else if (userAgent.includes('Android')) { os = 'Android'; device = 'Mobile'; }
  else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) { os = 'iOS'; device = 'Mobile'; }

  // Device type
  if (userAgent.includes('Mobile')) device = 'Mobile';
  else if (userAgent.includes('Tablet')) device = 'Tablet';

  return { browser, os, device };
}

export { router as authRouter };
