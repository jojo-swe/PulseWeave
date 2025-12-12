import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '@pulseweave/database';

/**
 * JWT configuration with secure defaults.
 * SECURITY: In production, JWT_SECRET must be set and be at least 32 characters.
 */
const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  
  // In production, require a proper secret
  if (process.env.NODE_ENV === 'production') {
    if (!secret) {
      throw new Error('CRITICAL: JWT_SECRET environment variable must be set in production');
    }
    if (secret.length < 32) {
      throw new Error('CRITICAL: JWT_SECRET must be at least 32 characters in production');
    }
    if (secret.includes('change-in-production') || secret.includes('default') || secret.includes('secret')) {
      throw new Error('CRITICAL: JWT_SECRET appears to be a default value. Set a secure random secret.');
    }
  }
  
  // In development, allow fallback but warn
  if (!secret) {
    console.warn('⚠️  WARNING: JWT_SECRET not set. Using insecure default. DO NOT USE IN PRODUCTION!');
    return 'pulseweave-dev-only-secret-do-not-use-in-production';
  }
  
  return secret;
})();

const JWT_ISSUER = 'pulseweave';
const JWT_AUDIENCE = 'pulseweave-api';
const JWT_ACCESS_EXPIRY: jwt.SignOptions['expiresIn'] = (process.env.JWT_ACCESS_EXPIRY || process.env.JWT_EXPIRES_IN || '1d') as jwt.SignOptions['expiresIn']; // Shorter expiry for access tokens
const JWT_REFRESH_EXPIRY: jwt.SignOptions['expiresIn'] = (process.env.JWT_REFRESH_EXPIRY || process.env.JWT_REFRESH_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'];

export interface AuthRequest extends Request {
  userId?: string;
  tokenId?: string;
  workspaceId?: string;
  workspaceRole?: string;
}

interface TokenPayload {
  userId: string;
  jti: string; // JWT ID for token revocation
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

/**
 * Authenticates JWT token from Authorization header.
 * Validates token signature, expiry, and session status in database.
 * Also checks for X-Workspace-ID header to set workspace context.
 */
export async function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || req.cookies?.token;
  const workspaceIdHeader = req.headers['x-workspace-id'] as string;

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as TokenPayload;

    // Check if session is valid in database
    if (decoded.jti) {
      const session = await prisma.session.findUnique({
        where: { tokenId: decoded.jti },
      });

      if (!session || !session.isValid) {
        return res.status(403).json({ error: 'Token has been revoked' });
      }
    }

    req.userId = decoded.userId;
    req.tokenId = decoded.jti;

    // Handle Workspace Context if header is present
    if (workspaceIdHeader) {
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: decoded.userId,
            workspaceId: workspaceIdHeader,
          },
        },
        select: { roleName: true },
      });

      if (!membership) {
        return res.status(403).json({ 
          error: 'Access denied to this workspace',
          code: 'WORKSPACE_ACCESS_DENIED'
        });
      }

      req.workspaceId = workspaceIdHeader;
      req.workspaceRole = membership.roleName;
    }

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Generates a secure access token.
 * @param userId - The user ID to encode
 * @param expiresIn - Optional custom expiry (e.g., '5m', '1h', '7d')
 * @param jti - Optional JWT ID (if not provided, one will be generated)
 * @returns Object containing the JWT token and the jti used
 */
export function generateToken(userId: string, expiresIn?: string, jti?: string): { token: string; jti: string } {
  const tokenJti = jti || crypto.randomUUID(); // Unique token ID for revocation
  
  const token = jwt.sign(
    { 
      userId,
      jti: tokenJti,
      type: 'access',
    }, 
    JWT_SECRET, 
    { 
      expiresIn: (expiresIn || JWT_ACCESS_EXPIRY) as jwt.SignOptions['expiresIn'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }
  );

  return { token, jti: tokenJti };
}

/**
 * Generates a refresh token with longer expiry.
 * @param userId - The user ID to encode
 * @param jti - Optional JWT ID
 * @returns Object containing the JWT token and the jti used
 */
export function generateRefreshToken(userId: string, jti?: string): { token: string; jti: string } {
  const tokenJti = jti || crypto.randomUUID();
  
  const token = jwt.sign(
    { 
      userId,
      jti: tokenJti,
      type: 'refresh',
    }, 
    JWT_SECRET, 
    { 
      expiresIn: JWT_REFRESH_EXPIRY,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }
  );

  return { token, jti: tokenJti };
}

/**
 * Revokes a token by marking the session as invalid in the database.
 * @param tokenId - The JWT ID (jti) to revoke
 */
export async function revokeToken(tokenId: string): Promise<void> {
  try {
    await prisma.session.update({
      where: { tokenId },
      data: { isValid: false },
    });
  } catch (error) {
    // Ignore error if session doesn't exist (already deleted or never stored)
    console.warn(`Failed to revoke token ${tokenId}:`, error);
  }
}

/**
 * Revokes all tokens for a user (logout from all devices).
 * @param userId - The user ID whose tokens to revoke
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, isValid: true },
    data: { isValid: false },
  });
}

/**
 * Verifies a refresh token and returns the payload.
 * @param token - The refresh token to verify
 * @returns Token payload or null if invalid
 */
export async function verifyRefreshToken(token: string): Promise<TokenPayload | null> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as TokenPayload;

    if (decoded.type !== 'refresh') {
      return null;
    }

    if (decoded.jti) {
      const session = await prisma.session.findUnique({
        where: { tokenId: decoded.jti },
      });
      if (!session || !session.isValid) {
        return null;
      }
    }

    return decoded;
  } catch {
    return null;
  }
}

export { JWT_SECRET };
