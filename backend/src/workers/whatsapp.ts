/**
 * WhatsApp Worker
 *
 * Singleton worker that manages all WhatsApp sessions.
 * This worker should only run as a single instance to avoid
 * duplicate connections and session conflicts.
 */

import { createServer } from 'http';
import { sessionManager } from '../modules/whatsapp/session/session.manager';
import { createSocketServer } from '../core/websocket/server';
import { connectDatabase, disconnectDatabase } from '../core/database/prisma';
import { connectRedis, disconnectRedis } from '../core/cache/redis.client';
import { logger } from '../shared/utils/logger';
import { env } from '../config/env';

const PORT = parseInt(process.env.WHATSAPP_WORKER_PORT || '3002', 10);

async function main() {
  logger.info('Starting WhatsApp Worker...');

  try {
    // Connect to database
    await connectDatabase();
    logger.info('Database connected');

    // Connect to Redis
    await connectRedis();
    logger.info('Redis connected');

    // Create HTTP server for Socket.IO
    const httpServer = createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', worker: 'whatsapp' }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    // Initialize Socket.IO server
    createSocketServer(httpServer);
    logger.info('Socket.IO server initialized');

    // Initialize all WhatsApp sessions
    await sessionManager.initializeAllSessions();
    logger.info('WhatsApp sessions initialized');

    // Start HTTP server
    httpServer.listen(PORT, () => {
      logger.info({ port: PORT }, 'WhatsApp Worker listening');
    });

    // Graceful shutdown handlers
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal');

      try {
        // Shutdown session manager
        await sessionManager.shutdown();
        logger.info('Session manager shutdown complete');

        // Close HTTP server
        httpServer.close(() => {
          logger.info('HTTP server closed');
        });

        // Disconnect from services
        await disconnectRedis();
        await disconnectDatabase();

        logger.info('WhatsApp Worker shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error({ error }, 'Error during shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error({ error }, 'Uncaught exception');
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error({ reason, promise }, 'Unhandled rejection');
    });

  } catch (error) {
    logger.error({ error }, 'Failed to start WhatsApp Worker');
    process.exit(1);
  }
}

main();
