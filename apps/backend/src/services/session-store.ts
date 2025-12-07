import crypto from 'crypto';
import { prisma } from '@pulseweave/database';
import { logger } from '../utils/logger';

/**
 * Session data structure.
 */
export interface SessionData {
  userId: string;
  tokenId: string;
  deviceInfo?: string;
  ipAddress?: string;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
}

/**
 * Session store interface for pluggable backends.
 */
interface SessionStore {
  create(session: SessionData): Promise<string>;
  get(sessionId: string): Promise<SessionData | null>;
  update(sessionId: string, data: Partial<SessionData>): Promise<void>;
  delete(sessionId: string): Promise<void>;
  deleteAllForUser(userId: string): Promise<number>;
  isValid(sessionId: string): Promise<boolean>;
  cleanup(): Promise<number>;
}

/**
 * In-memory session store for development.
 * WARNING: Not suitable for production - sessions lost on restart.
 */
class MemorySessionStore implements SessionStore {
  private sessions = new Map<string, SessionData>();

  async create(session: SessionData): Promise<string> {
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, session);
    return sessionId;
  }

  async get(sessionId: string): Promise<SessionData | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (new Date() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return null;
    }
    return session;
  }

  async update(sessionId: string, data: Partial<SessionData>): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.set(sessionId, { ...session, ...data });
    }
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async deleteAllForUser(userId: string): Promise<number> {
    let count = 0;
    for (const [id, session] of this.sessions) {
      if (session.userId === userId) {
        this.sessions.delete(id);
        count++;
      }
    }
    return count;
  }

  async isValid(sessionId: string): Promise<boolean> {
    const session = await this.get(sessionId);
    return session !== null;
  }

  async cleanup(): Promise<number> {
    const now = new Date();
    let count = 0;
    for (const [id, session] of this.sessions) {
      if (now > session.expiresAt) {
        this.sessions.delete(id);
        count++;
      }
    }
    return count;
  }
}

/**
 * Database-backed session store for production.
 * Persists sessions across restarts and supports clustering.
 */
class DatabaseSessionStore implements SessionStore {
  async create(session: SessionData): Promise<string> {
    const sessionId = crypto.randomUUID();
    await prisma.session.create({
      data: {
        id: sessionId,
        userId: session.userId,
        tokenId: session.tokenId,
        deviceInfo: session.deviceInfo,
        ipAddress: session.ipAddress,
        expiresAt: session.expiresAt,
        isValid: true,
      },
    });
    return sessionId;
  }

  async get(sessionId: string): Promise<SessionData | null> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session || !session.isValid) return null;
    if (new Date() > session.expiresAt) {
      await this.delete(sessionId);
      return null;
    }

    return {
      userId: session.userId,
      tokenId: session.tokenId,
      deviceInfo: session.deviceInfo || undefined,
      ipAddress: session.ipAddress || undefined,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
      expiresAt: session.expiresAt,
    };
  }

  async update(sessionId: string, data: Partial<SessionData>): Promise<void> {
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        lastActiveAt: new Date(),
        ...(data.deviceInfo && { deviceInfo: data.deviceInfo }),
        ...(data.ipAddress && { ipAddress: data.ipAddress }),
      },
    });
  }

  async delete(sessionId: string): Promise<void> {
    await prisma.session.update({
      where: { id: sessionId },
      data: { isValid: false },
    });
  }

  async deleteAllForUser(userId: string): Promise<number> {
    const result = await prisma.session.updateMany({
      where: { userId, isValid: true },
      data: { isValid: false },
    });
    return result.count;
  }

  async isValid(sessionId: string): Promise<boolean> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { isValid: true, expiresAt: true },
    });
    return session?.isValid === true && new Date() < session.expiresAt;
  }

  async cleanup(): Promise<number> {
    const result = await prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { isValid: false },
        ],
      },
    });
    return result.count;
  }
}

/**
 * Session manager singleton.
 */
class SessionManager {
  private store: SessionStore;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Use database store in production, memory store in development
    const useDatabase = process.env.NODE_ENV === 'production' || process.env.USE_DB_SESSIONS === 'true';
    this.store = useDatabase ? new DatabaseSessionStore() : new MemorySessionStore();

    if (!useDatabase) {
      logger.warn('Using in-memory session store. Sessions will be lost on restart.');
    }

    // Start cleanup interval (every hour)
    this.startCleanup();
  }

  /**
   * Creates a new session.
   */
  async createSession(
    userId: string,
    tokenId: string,
    options?: {
      deviceInfo?: string;
      ipAddress?: string;
      expiresInMs?: number;
    }
  ): Promise<string> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (options?.expiresInMs || 24 * 60 * 60 * 1000));

    const sessionId = await this.store.create({
      userId,
      tokenId,
      deviceInfo: options?.deviceInfo,
      ipAddress: options?.ipAddress,
      createdAt: now,
      lastActiveAt: now,
      expiresAt,
    });

    logger.debug('Session created', { sessionId, userId });
    return sessionId;
  }

  /**
   * Gets session data.
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    return this.store.get(sessionId);
  }

  /**
   * Updates session activity.
   */
  async touchSession(sessionId: string, ipAddress?: string): Promise<void> {
    await this.store.update(sessionId, {
      lastActiveAt: new Date(),
      ipAddress,
    });
  }

  /**
   * Validates a session.
   */
  async validateSession(sessionId: string): Promise<boolean> {
    return this.store.isValid(sessionId);
  }

  /**
   * Invalidates a session (logout).
   */
  async invalidateSession(sessionId: string): Promise<void> {
    await this.store.delete(sessionId);
    logger.debug('Session invalidated', { sessionId });
  }

  /**
   * Invalidates all sessions for a user (logout from all devices).
   */
  async invalidateAllUserSessions(userId: string): Promise<number> {
    const count = await this.store.deleteAllForUser(userId);
    logger.info('All user sessions invalidated', { userId, count });
    return count;
  }

  /**
   * Starts periodic cleanup of expired sessions.
   */
  private startCleanup(): void {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(async () => {
      try {
        const count = await this.store.cleanup();
        if (count > 0) {
          logger.info('Session cleanup completed', { removedSessions: count });
        }
      } catch (error) {
        logger.error('Session cleanup failed', { error: String(error) });
      }
    }, 60 * 60 * 1000);
  }

  /**
   * Stops the cleanup interval.
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();
