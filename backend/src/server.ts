import http from 'http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './shared/utils/logger.js';
import { connectDatabase, disconnectDatabase } from './core/database/prisma.js';
import { redis, disconnectRedis } from './core/cache/redis.client.js';
import { createSocketServer, cleanupSocketServer } from './core/websocket/server.js';
import { whatsappService } from './modules/whatsapp/whatsapp.service.js';

// Global error handlers to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught exception');
  // Don't exit - let the process continue running
});

async function main(): Promise<void> {
  try {
    // Connect to database
    await connectDatabase();

    // Create Express app
    const app = createApp();

    // Create HTTP server
    const server = http.createServer(app);

    // Initialize Socket.IO
    const io = createSocketServer(server);

    // Store io instance for later use
    app.set('io', io);

    // Start server
    server.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT}`);
      logger.info(`Environment: ${env.NODE_ENV}`);
      logger.info(`API: http://localhost:${env.PORT}/api/${env.API_VERSION}`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      server.close(async () => {
        logger.info('HTTP server closed');

        // Clean up Socket.IO and Redis adapter connections
        await cleanupSocketServer();

        // Clean up WhatsApp service (Redis subscribers, pending requests)
        await whatsappService.cleanup();

        await disconnectDatabase();
        await disconnectRedis();

        logger.info('Cleanup complete, exiting');
        process.exit(0);
      });

      // Force close after 10 seconds
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    // Use 'once' to prevent handler accumulation on hot reload
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

main();
