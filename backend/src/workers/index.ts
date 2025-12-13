/**
 * Background Worker
 *
 * Processes background jobs using BullMQ:
 * - Message queue processing
 * - Broadcast campaign execution
 * - Webhook deliveries
 * - Analytics aggregation
 */

import { Worker, Job } from 'bullmq';
import { connectDatabase, disconnectDatabase } from '../core/database/prisma';
import { connectRedis, disconnectRedis, redisClient } from '../core/cache/redis.client';
import { logger } from '../shared/utils/logger';
import { redisConfig } from '../config/redis';

// Queue names
const QUEUES = {
  MESSAGE: 'message-queue',
  BROADCAST: 'broadcast-queue',
  WEBHOOK: 'webhook-queue',
  ANALYTICS: 'analytics-queue',
};

// Message queue processor
async function processMessage(job: Job) {
  const { type, data } = job.data;
  logger.info({ jobId: job.id, type }, 'Processing message job');

  switch (type) {
    case 'send':
      // Message sending is handled by the API server
      // This queue is for retry handling
      break;
    case 'status_update':
      // Update message status in database
      break;
    default:
      logger.warn({ type }, 'Unknown message job type');
  }
}

// Broadcast queue processor
async function processBroadcast(job: Job) {
  const { broadcastId, recipientId, channelId, content } = job.data;
  logger.info({ jobId: job.id, broadcastId, recipientId }, 'Processing broadcast job');

  // Import here to avoid circular dependencies
  const { prisma } = await import('../core/database/prisma');
  const { sessionManager } = await import('../modules/whatsapp/session/session.manager');

  try {
    // Get recipient
    const recipient = await prisma.broadcastRecipient.findUnique({
      where: { id: recipientId },
      include: { contact: true },
    });

    if (!recipient) {
      throw new Error('Recipient not found');
    }

    // Send message
    const result = await sessionManager.sendTextMessage(
      channelId,
      recipient.contact.identifier,
      content.text
    );

    // Update recipient status
    await prisma.broadcastRecipient.update({
      where: { id: recipientId },
      data: {
        status: 'SENT',
        messageId: result?.key?.id,
        sentAt: new Date(),
      },
    });

    // Update broadcast counters
    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: {
        sentCount: { increment: 1 },
      },
    });

    logger.info({ recipientId, messageId: result?.key?.id }, 'Broadcast message sent');
  } catch (error) {
    // Update recipient as failed
    await prisma.broadcastRecipient.update({
      where: { id: recipientId },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        errorReason: (error as Error).message,
      },
    });

    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: {
        failedCount: { increment: 1 },
      },
    });

    throw error;
  }
}

// Webhook queue processor
async function processWebhook(job: Job) {
  const { webhookId, event, payload } = job.data;
  logger.info({ jobId: job.id, webhookId, event }, 'Processing webhook job');

  const { prisma } = await import('../core/database/prisma');

  try {
    const webhook = await prisma.webhook.findUnique({
      where: { id: webhookId },
    });

    if (!webhook || !webhook.isActive) {
      logger.warn({ webhookId }, 'Webhook not found or inactive');
      return;
    }

    // Send webhook
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': webhook.secret,
        'X-Webhook-Event': event,
      },
      body: JSON.stringify(payload),
    });

    // Record delivery
    await prisma.webhookDelivery.create({
      data: {
        webhookId,
        event,
        payload,
        status: response.status,
        response: await response.text().catch(() => null),
        attempts: job.attemptsMade + 1,
      },
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}`);
    }

    logger.info({ webhookId, status: response.status }, 'Webhook delivered');
  } catch (error) {
    logger.error({ webhookId, error }, 'Webhook delivery failed');
    throw error;
  }
}

// Analytics aggregation processor
async function processAnalytics(job: Job) {
  const { organizationId, date } = job.data;
  logger.info({ jobId: job.id, organizationId, date }, 'Processing analytics job');

  // Aggregation logic would go here
  // This is called by the cron job
}

async function main() {
  logger.info('Starting Background Worker...');

  try {
    // Connect to database
    await connectDatabase();
    logger.info('Database connected');

    // Connect to Redis
    await connectRedis();
    logger.info('Redis connected');

    // Redis connection options for BullMQ
    const connection = {
      host: new URL(redisConfig.url).hostname,
      port: parseInt(new URL(redisConfig.url).port || '6379', 10),
      password: new URL(redisConfig.url).password || undefined,
    };

    // Create workers
    const workers: Worker[] = [];

    // Message worker
    const messageWorker = new Worker(QUEUES.MESSAGE, processMessage, {
      connection,
      concurrency: 10,
    });
    workers.push(messageWorker);
    logger.info('Message worker started');

    // Broadcast worker
    const broadcastWorker = new Worker(QUEUES.BROADCAST, processBroadcast, {
      connection,
      concurrency: 5, // Lower concurrency for rate limiting
      limiter: {
        max: 30, // 30 messages per minute (WhatsApp rate limit)
        duration: 60000,
      },
    });
    workers.push(broadcastWorker);
    logger.info('Broadcast worker started');

    // Webhook worker
    const webhookWorker = new Worker(QUEUES.WEBHOOK, processWebhook, {
      connection,
      concurrency: 20,
    });
    workers.push(webhookWorker);
    logger.info('Webhook worker started');

    // Analytics worker
    const analyticsWorker = new Worker(QUEUES.ANALYTICS, processAnalytics, {
      connection,
      concurrency: 1,
    });
    workers.push(analyticsWorker);
    logger.info('Analytics worker started');

    // Error handlers
    workers.forEach((worker) => {
      worker.on('failed', (job, error) => {
        logger.error({ jobId: job?.id, error }, 'Job failed');
      });

      worker.on('completed', (job) => {
        logger.debug({ jobId: job.id }, 'Job completed');
      });
    });

    logger.info('Background Worker running');

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal');

      try {
        // Close all workers
        await Promise.all(workers.map((w) => w.close()));
        logger.info('All workers closed');

        // Disconnect from services
        await disconnectRedis();
        await disconnectDatabase();

        logger.info('Background Worker shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error({ error }, 'Error during shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error({ error }, 'Failed to start Background Worker');
    process.exit(1);
  }
}

main();
