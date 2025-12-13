/**
 * WhatsApp Worker
 *
 * Singleton worker that manages all WhatsApp sessions.
 * This worker should only run as a single instance to avoid
 * duplicate connections and session conflicts.
 *
 * Communicates with API server via Redis pub/sub.
 * Queues jobs to BullMQ for background processing.
 */

import { Queue } from 'bullmq';
import { sessionManager } from '../modules/whatsapp/session/session.manager';
import { connectDatabase, disconnectDatabase } from '../core/database/prisma';
import { connectRedis, disconnectRedis, redisClient } from '../core/cache/redis.client';
import { logger } from '../shared/utils/logger';
import { redisConfig } from '../config/redis';

// BullMQ queues
let messageQueue: Queue;
let historySyncQueue: Queue;

/**
 * Set up event handlers that queue jobs for background processing
 * This ensures live chat is NOT blocked by historical sync
 */
function setupEventHandlers() {
  // Live messages - queue with HIGH priority
  sessionManager.on('message:received', async (channelId, waMessage) => {
    await messageQueue.add(
      'incoming',
      { channelId, waMessage: JSON.parse(JSON.stringify(waMessage)) },
      { priority: 1 } // High priority
    );
    logger.debug({ channelId, messageId: waMessage.key?.id }, 'Queued incoming message');
  });

  // Message status updates - queue with HIGH priority
  sessionManager.on('message:update', async (channelId, update) => {
    await messageQueue.add(
      'status_update',
      { channelId, update: JSON.parse(JSON.stringify(update)) },
      { priority: 1 }
    );
  });

  // Historical sync - queue with LOW priority (non-blocking)
  sessionManager.on('history:sync', async (channelId, data) => {
    // Queue historical sync with LOW priority so live messages process first
    await historySyncQueue.add(
      'sync',
      {
        channelId,
        chats: data.chats,
        contacts: data.contacts,
        messages: data.messages,
        syncType: data.syncType,
      },
      {
        priority: 10, // Low priority - live messages first
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      }
    );
    logger.info(
      { channelId, chats: data.chats.length, contacts: data.contacts.length },
      'Queued historical sync (non-blocking)'
    );
  });

  // Connection events - publish to Redis for API server
  sessionManager.on('qr:generated', async (channelId, qr) => {
    await redisClient.publish(`whatsapp:${channelId}:qr`, JSON.stringify({ qr }));
  });

  sessionManager.on('connected', async (channelId, phoneNumber) => {
    await redisClient.publish(`whatsapp:${channelId}:connected`, JSON.stringify({ phoneNumber }));
  });

  sessionManager.on('disconnected', async (channelId, reason) => {
    await redisClient.publish(`whatsapp:${channelId}:disconnected`, JSON.stringify({ reason }));
  });

  logger.info('WhatsApp event handlers configured (non-blocking queues)');
}

async function main() {
  logger.info('Starting WhatsApp Worker...');

  try {
    // Connect to database
    await connectDatabase();
    logger.info('Database connected');

    // Connect to Redis
    await connectRedis();
    logger.info('Redis connected');

    // Initialize BullMQ queues
    const connection = {
      host: new URL(redisConfig.url).hostname,
      port: parseInt(new URL(redisConfig.url).port || '6379', 10),
      password: new URL(redisConfig.url).password || undefined,
    };

    messageQueue = new Queue('message-queue', { connection });
    historySyncQueue = new Queue('history-sync-queue', { connection });
    logger.info('BullMQ queues initialized');

    // Set up non-blocking event handlers
    setupEventHandlers();

    // Initialize all WhatsApp sessions
    await sessionManager.initializeAllSessions();
    logger.info('WhatsApp sessions initialized');

    logger.info('WhatsApp Worker running (live chat NOT blocked by history sync)');

    // Keep process alive
    setInterval(() => {
      logger.debug('WhatsApp Worker heartbeat');
    }, 60000);

    // Graceful shutdown handlers
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal');

      try {
        // Shutdown session manager
        await sessionManager.shutdown();
        logger.info('Session manager shutdown complete');

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
