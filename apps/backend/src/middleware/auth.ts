import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '@pulseweave/database';
import { jwtConfig } from '../config/security';
import { logger } from '../utils/logger';

/**
 * SECURITY: All JWT configuration is centralized in config/security.ts.
 * Do NOT define separate secrets or expiry values here.
 */
const JWT_SECRET = jwtConfig.secret;
const JWT_ISSUER = jwtConfig.issuer;
const JWT_AUDIENCE = jwtConfig.audience;
const JWT_ACCESS_EXPIRY: jwt.SignOptions['expiresIn'] = jwtConfig.accessTokenExpiry as jwt.SignOptions['expiresIn'];
const JWT_REFRESH_EXPIRY: jwt.SignOptions['expiresIn'] = jwtConfig.refreshTokenExpiry as jwt.SignOptions['expiresIn'];

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
    logger.error('Auth middleware error:', error);
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
    logger.warn(`Failed to revoke token ${tokenId}:`, error);
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
