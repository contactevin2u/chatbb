/**
 * WhatsApp Worker
 *
 * Singleton worker that manages all WhatsApp sessions.
 * This worker should only run as a single instance to avoid
 * duplicate connections and session conflicts.
 *
 * Architecture:
 * - Subscribes to Redis pub/sub for commands from API server
 * - Executes commands using sessionManager (only process with active sessions)
 * - Publishes events to Redis for API server to broadcast via WebSocket
 * - Queues jobs to BullMQ for background processing
 */

import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { sessionManager } from '../modules/whatsapp/session/session.manager';
import { connectDatabase, disconnectDatabase, prisma } from '../core/database/prisma';
import { connectRedis, disconnectRedis, redisClient } from '../core/cache/redis.client';
import { logger } from '../shared/utils/logger';
import { redisConfig } from '../config/redis';

// BullMQ queues
let messageQueue: Queue;
let historySyncQueue: Queue;
let broadcastQueue: Queue;

// Redis subscriber for commands from API server
let redisSubscriber: Redis;

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

/**
 * Subscribe to Redis commands from API server
 * This allows API server to request actions without direct sessionManager access
 */
async function setupCommandSubscriber() {
  // Create separate Redis connection for subscriber (required by Redis pub/sub)
  redisSubscriber = new Redis(redisConfig.url);

  // Subscribe to command channels
  await redisSubscriber.psubscribe('whatsapp:cmd:*');

  redisSubscriber.on('pmessage', async (pattern, channel, message) => {
    try {
      const data = JSON.parse(message);
      const [, , command, channelId] = channel.split(':');

      logger.info({ command, channelId }, 'Received command from API');

      switch (command) {
        case 'connect':
          // Connect a WhatsApp channel
          await handleConnectCommand(channelId, data);
          break;

        case 'disconnect':
          // Disconnect a WhatsApp channel
          await handleDisconnectCommand(channelId);
          break;

        case 'send':
          // Send a message
          await handleSendCommand(channelId, data);
          break;

        case 'pairing':
          // Request pairing code
          await handlePairingCommand(channelId, data);
          break;

        default:
          logger.warn({ command }, 'Unknown command');
      }
    } catch (error) {
      logger.error({ channel, error }, 'Error processing command');
    }
  });

  logger.info('Command subscriber configured');
}

async function handleConnectCommand(channelId: string, data: { organizationId: string }) {
  try {
    const session = await sessionManager.createSession(channelId, data.organizationId);
    await redisClient.publish(`whatsapp:${channelId}:status`, JSON.stringify({
      status: 'connecting',
      channelId,
    }));
  } catch (error) {
    await redisClient.publish(`whatsapp:${channelId}:error`, JSON.stringify({
      error: (error as Error).message,
    }));
  }
}

async function handleDisconnectCommand(channelId: string) {
  try {
    await sessionManager.disconnectSession(channelId);
    await redisClient.publish(`whatsapp:${channelId}:status`, JSON.stringify({
      status: 'disconnected',
      channelId,
    }));
  } catch (error) {
    logger.error({ channelId, error }, 'Error disconnecting');
  }
}

async function handleSendCommand(channelId: string, data: { to: string; text?: string; media?: any; requestId: string }) {
  try {
    let result;
    if (data.text) {
      result = await sessionManager.sendTextMessage(channelId, data.to, data.text);
    } else if (data.media) {
      result = await sessionManager.sendMediaMessage(channelId, data.to, data.media);
    }

    // Publish result back to API
    await redisClient.publish(`whatsapp:response:${data.requestId}`, JSON.stringify({
      success: true,
      messageId: result?.key?.id,
    }));
  } catch (error) {
    await redisClient.publish(`whatsapp:response:${data.requestId}`, JSON.stringify({
      success: false,
      error: (error as Error).message,
    }));
  }
}

async function handlePairingCommand(channelId: string, data: { phoneNumber: string; requestId: string }) {
  try {
    const code = await sessionManager.requestPairingCode(channelId, data.phoneNumber);
    await redisClient.publish(`whatsapp:response:${data.requestId}`, JSON.stringify({
      success: true,
      code,
    }));
  } catch (error) {
    await redisClient.publish(`whatsapp:response:${data.requestId}`, JSON.stringify({
      success: false,
      error: (error as Error).message,
    }));
  }
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
    broadcastQueue = new Queue('broadcast-queue', { connection });
    logger.info('BullMQ queues initialized');

    // Broadcast worker - runs HERE because it needs sessionManager
    const broadcastWorker = new Worker('broadcast-queue', async (job: Job) => {
      const { broadcastId, recipientId, channelId, content } = job.data;
      logger.info({ jobId: job.id, broadcastId, recipientId }, 'Processing broadcast');

      try {
        const recipient = await prisma.broadcastRecipient.findUnique({
          where: { id: recipientId },
          include: { contact: true },
        });

        if (!recipient) throw new Error('Recipient not found');

        const result = await sessionManager.sendTextMessage(
          channelId,
          recipient.contact.identifier,
          content.text
        );

        await prisma.broadcastRecipient.update({
          where: { id: recipientId },
          data: { status: 'SENT', messageId: result?.key?.id, sentAt: new Date() },
        });

        await prisma.broadcast.update({
          where: { id: broadcastId },
          data: { sentCount: { increment: 1 } },
        });

        logger.info({ recipientId, messageId: result?.key?.id }, 'Broadcast sent');
      } catch (error) {
        await prisma.broadcastRecipient.update({
          where: { id: recipientId },
          data: { status: 'FAILED', failedAt: new Date(), errorReason: (error as Error).message },
        });

        await prisma.broadcast.update({
          where: { id: broadcastId },
          data: { failedCount: { increment: 1 } },
        });

        throw error;
      }
    }, {
      connection,
      concurrency: 5,
      limiter: { max: 30, duration: 60000 }, // 30 per minute rate limit
    });

    broadcastWorker.on('failed', (job, error) => {
      logger.error({ jobId: job?.id, error }, 'Broadcast job failed');
    });

    logger.info('Broadcast worker started (uses sessionManager)');

    // Set up non-blocking event handlers (queues to BullMQ, publishes to Redis)
    setupEventHandlers();

    // Set up command subscriber (receives commands from API server via Redis)
    await setupCommandSubscriber();

    // Initialize all WhatsApp sessions
    await sessionManager.initializeAllSessions();
    logger.info('WhatsApp sessions initialized');

    logger.info('WhatsApp Worker running - Architecture:');
    logger.info('  - Receives commands via Redis pub/sub from API');
    logger.info('  - Publishes events via Redis pub/sub to API');
    logger.info('  - Queues background jobs to BullMQ');

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

        // Close Redis subscriber
        if (redisSubscriber) {
          await redisSubscriber.quit();
          logger.info('Redis subscriber closed');
        }

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
