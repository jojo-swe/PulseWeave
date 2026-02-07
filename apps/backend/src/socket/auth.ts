import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { prisma } from '@pulseweave/database';
import { JWT_SECRET } from '../middleware/auth';
import type { AuthenticatedSocket } from './types';

export function setupSocketAuth(io: Server): void {
  io.use(async (socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET, {
        issuer: 'pulseweave',
        audience: 'pulseweave-api',
      }) as { userId: string; jti?: string };

      if (decoded.jti) {
        const session = await prisma.session.findUnique({
          where: { tokenId: decoded.jti },
        });
        if (session && !session.isValid) {
          return next(new Error('Token has been revoked'));
        }
      }

      socket.userId = decoded.userId;
      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return next(new Error('Token expired'));
      }
      next(new Error('Invalid token'));
    }
  });
}
