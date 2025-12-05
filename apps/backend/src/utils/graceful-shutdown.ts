import { Server } from 'http';
import { Server as SocketServer } from 'socket.io';
import { prisma } from '@pulseweave/database';
import { logger } from './logger';

/**
 * Graceful shutdown handler.
 * Ensures all connections are properly closed before exit.
 */
export function setupGracefulShutdown(
  httpServer: Server,
  io: SocketServer
): void {
  let isShuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (isShuttingDown) {
      logger.warn('Shutdown already in progress, ignoring signal', { signal });
      return;
    }

    isShuttingDown = true;
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    // Set a timeout for forced shutdown
    const forceShutdownTimeout = setTimeout(() => {
      logger.error('Forced shutdown due to timeout');
      process.exit(1);
    }, 30000); // 30 seconds

    try {
      // 1. Stop accepting new connections
      logger.info('Closing HTTP server...');
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // 2. Close all socket connections
      logger.info('Closing WebSocket connections...');
      io.disconnectSockets(true);
      await new Promise<void>((resolve) => {
        io.close(() => resolve());
      });

      // 3. Close database connection
      logger.info('Closing database connection...');
      await prisma.$disconnect();

      // 4. Clear the timeout and exit
      clearTimeout(forceShutdownTimeout);
      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error: String(error) });
      clearTimeout(forceShutdownTimeout);
      process.exit(1);
    }
  }

  // Handle termination signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    shutdown('uncaughtException');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason: String(reason) });
    shutdown('unhandledRejection');
  });
}

/**
 * Check database connection health.
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('Database health check failed', { error: String(error) });
    return false;
  }
}
