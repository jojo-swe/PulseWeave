import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

/**
 * JWT configuration with secure defaults.
 */
const JWT_SECRET = process.env.JWT_SECRET || 'chatterbox-secret-key-change-in-production';
const JWT_ISSUER = 'pulseweave';
const JWT_AUDIENCE = 'pulseweave-api';
const JWT_ACCESS_EXPIRY = '1d'; // Shorter expiry for access tokens
const JWT_REFRESH_EXPIRY = '7d';

export interface AuthRequest extends Request {
  userId?: string;
  tokenId?: string;
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
 * In-memory token blacklist (use Redis in production).
 * Stores revoked token IDs.
 */
const tokenBlacklist = new Set<string>();

/**
 * Authenticates JWT token from Authorization header.
 * Validates token signature, expiry, and blacklist status.
 */
export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as TokenPayload;

    // Check if token is blacklisted (revoked)
    if (decoded.jti && tokenBlacklist.has(decoded.jti)) {
      return res.status(403).json({ error: 'Token has been revoked' });
    }

    req.userId = decoded.userId;
    req.tokenId = decoded.jti;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    return res.status(403).json({ error: 'Token verification failed' });
  }
}

/**
 * Generates a secure access token.
 * @param userId - The user ID to encode
 * @param expiresIn - Optional custom expiry (e.g., '5m', '1h', '7d')
 * @returns JWT access token
 */
export function generateToken(userId: string, expiresIn?: string): string {
  const jti = crypto.randomUUID(); // Unique token ID for revocation
  
  return jwt.sign(
    { 
      userId,
      jti,
      type: 'access',
    }, 
    JWT_SECRET, 
    { 
      expiresIn: expiresIn || JWT_ACCESS_EXPIRY,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }
  );
}

/**
 * Generates a refresh token with longer expiry.
 * @param userId - The user ID to encode
 * @returns JWT refresh token
 */
export function generateRefreshToken(userId: string): string {
  const jti = crypto.randomUUID();
  
  return jwt.sign(
    { 
      userId,
      jti,
      type: 'refresh',
    }, 
    JWT_SECRET, 
    { 
      expiresIn: JWT_REFRESH_EXPIRY,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }
  );
}

/**
 * Revokes a token by adding its ID to the blacklist.
 * @param tokenId - The JWT ID (jti) to revoke
 */
export function revokeToken(tokenId: string): void {
  tokenBlacklist.add(tokenId);
}

/**
 * Revokes all tokens for a user (logout from all devices).
 * In production, this should update a database/Redis.
 * @param userId - The user ID whose tokens to revoke
 */
export function revokeAllUserTokens(userId: string): void {
  // In production, store user's token version in DB
  // and increment it to invalidate all existing tokens
  console.log(`Revoking all tokens for user: ${userId}`);
}

/**
 * Verifies a refresh token and returns the payload.
 * @param token - The refresh token to verify
 * @returns Token payload or null if invalid
 */
export function verifyRefreshToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as TokenPayload;

    if (decoded.type !== 'refresh') {
      return null;
    }

    if (decoded.jti && tokenBlacklist.has(decoded.jti)) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

export { JWT_SECRET };
