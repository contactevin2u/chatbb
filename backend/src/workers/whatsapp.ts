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
    try {
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
    } catch (error) {
      // If Redis is down, process directly (fallback)
      logger.warn(
        { channelId, error: (error as Error).message },
        'Failed to queue history sync, processing directly'
      );
      try {
        await processHistorySyncDirect(channelId, data);
      } catch (processError) {
        logger.error({ channelId, error: (processError as Error).message }, 'Direct history sync failed');
      }
    }
  });

  // Contact events - process directly (no queue needed, fast operation)
  sessionManager.on('contacts:upsert', async (channelId, contacts) => {
    try {
      await processContactsUpsert(channelId, contacts);
    } catch (error) {
      logger.error({ channelId, error: (error as Error).message }, 'Failed to process contacts upsert');
    }
  });

  sessionManager.on('contacts:update', async (channelId, contacts) => {
    try {
      await processContactsUpdate(channelId, contacts);
    } catch (error) {
      logger.error({ channelId, error: (error as Error).message }, 'Failed to process contacts update');
    }
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

/**
 * Process contacts upsert - bulk contact sync from WhatsApp
 */
async function processContactsUpsert(channelId: string, contacts: any[]) {
  const { ChannelType } = await import('@prisma/client');

  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return;

  const orgId = channel.organizationId;
  let processed = 0;

  for (const contact of contacts) {
    try {
      // Extract identifier from JID (e.g., "1234567890@s.whatsapp.net" -> "1234567890")
      const identifier = contact.id?.split('@')[0];
      if (!identifier) continue;

      // Get contact name from various fields
      const displayName = contact.name || contact.notify || contact.verifiedName || contact.pushname || null;

      await prisma.contact.upsert({
        where: {
          organizationId_channelType_identifier: {
            organizationId: orgId,
            channelType: ChannelType.WHATSAPP,
            identifier,
          },
        },
        create: {
          organizationId: orgId,
          channelType: ChannelType.WHATSAPP,
          identifier,
          displayName,
        },
        update: {
          // Only update displayName if we have a new non-null value
          ...(displayName ? { displayName } : {}),
        },
      });
      processed++;
    } catch {
      // Skip errors, continue with next contact
    }
  }

  logger.info({ channelId, total: contacts.length, processed }, 'Contacts upsert processed');
}

/**
 * Process contacts update - individual contact info changes
 */
async function processContactsUpdate(channelId: string, contacts: any[]) {
  const { ChannelType } = await import('@prisma/client');

  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return;

  const orgId = channel.organizationId;
  let updated = 0;

  for (const contact of contacts) {
    try {
      const identifier = contact.id?.split('@')[0];
      if (!identifier) continue;

      // Get contact name from various fields
      const displayName = contact.name || contact.notify || contact.verifiedName || contact.pushname || null;
      if (!displayName) continue; // Skip if no name to update

      const result = await prisma.contact.updateMany({
        where: {
          organizationId: orgId,
          channelType: ChannelType.WHATSAPP,
          identifier,
        },
        data: {
          displayName,
        },
      });

      if (result.count > 0) updated++;
    } catch {
      // Skip errors
    }
  }

  logger.debug({ channelId, total: contacts.length, updated }, 'Contacts update processed');
}

/**
 * Process history sync directly (fallback when Redis/BullMQ is unavailable)
 */
async function processHistorySyncDirect(channelId: string, data: { chats: any[]; contacts: any[]; messages: any; syncType: any }) {
  const { ChannelType, MessageDirection, MessageStatus, MessageType } = await import('@prisma/client');

  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return;

  const orgId = channel.organizationId;
  let contactsProcessed = 0;
  let chatsProcessed = 0;
  let messagesProcessed = 0;

  // Process contacts
  for (const contact of data.contacts || []) {
    try {
      const identifier = contact.id?.split('@')[0];
      if (!identifier) continue;

      await prisma.contact.upsert({
        where: {
          organizationId_channelType_identifier: {
            organizationId: orgId,
            channelType: ChannelType.WHATSAPP,
            identifier,
          },
        },
        create: {
          organizationId: orgId,
          channelType: ChannelType.WHATSAPP,
          identifier,
          displayName: contact.name || contact.notify || null,
        },
        update: {
          displayName: contact.name || contact.notify || undefined,
        },
      });
      contactsProcessed++;
    } catch {
      // Skip errors
    }
  }

  // Process chats and create conversations
  for (const chat of data.chats || []) {
    try {
      const remoteJid = chat.id;
      if (!remoteJid || remoteJid.endsWith('@g.us')) continue; // Skip groups

      const identifier = remoteJid.split('@')[0];

      let contact = await prisma.contact.findFirst({
        where: { organizationId: orgId, channelType: ChannelType.WHATSAPP, identifier },
      });

      if (!contact) {
        contact = await prisma.contact.create({
          data: {
            organizationId: orgId,
            channelType: ChannelType.WHATSAPP,
            identifier,
            displayName: chat.name || null,
          },
        });
      }

      const existingConvo = await prisma.conversation.findFirst({
        where: { channelId, contactId: contact.id },
      });

      if (!existingConvo) {
        await prisma.conversation.create({
          data: {
            organizationId: orgId,
            channelId,
            contactId: contact.id,
            status: 'OPEN',
            unreadCount: chat.unreadCount || 0,
            lastMessageAt: chat.conversationTimestamp
              ? new Date(Number(chat.conversationTimestamp) * 1000)
              : new Date(),
          },
        });
      }
      chatsProcessed++;
    } catch {
      // Skip errors
    }
  }

  // Process messages (limit to avoid timeout)
  const messageLimit = 100; // Process max 100 messages per sync to avoid timeout
  let messageCount = 0;

  for (const [jid, msgs] of Object.entries(data.messages || {})) {
    if (!Array.isArray(msgs) || messageCount >= messageLimit) continue;

    const identifier = jid.split('@')[0];

    const contact = await prisma.contact.findFirst({
      where: { organizationId: orgId, channelType: ChannelType.WHATSAPP, identifier },
    });
    if (!contact) continue;

    const conversation = await prisma.conversation.findFirst({
      where: { channelId, contactId: contact.id },
    });
    if (!conversation) continue;

    for (const msg of msgs as any[]) {
      if (messageCount >= messageLimit) break;

      try {
        const externalId = msg.key?.id;
        if (!externalId) continue;

        // Skip if exists
        const exists = await prisma.message.findFirst({ where: { externalId, channelId } });
        if (exists) continue;

        // Parse content
        const msgContent = msg.message || {};
        let type: typeof MessageType[keyof typeof MessageType] = MessageType.TEXT;
        let content: any = {};

        if (msgContent.conversation) {
          content = { text: msgContent.conversation };
        } else if (msgContent.extendedTextMessage) {
          content = { text: msgContent.extendedTextMessage.text };
        } else if (msgContent.imageMessage) {
          type = MessageType.IMAGE;
          content = { caption: msgContent.imageMessage.caption };
        } else if (msgContent.videoMessage) {
          type = MessageType.VIDEO;
        } else if (msgContent.audioMessage) {
          type = MessageType.AUDIO;
        } else if (msgContent.documentMessage) {
          type = MessageType.DOCUMENT;
          content = { filename: msgContent.documentMessage.fileName };
        }

        const isFromMe = msg.key?.fromMe || false;

        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            channelId,
            externalId,
            direction: isFromMe ? MessageDirection.OUTBOUND : MessageDirection.INBOUND,
            type,
            content,
            status: isFromMe ? MessageStatus.SENT : MessageStatus.DELIVERED,
            sentAt: isFromMe ? new Date(Number(msg.messageTimestamp) * 1000) : null,
            deliveredAt: !isFromMe ? new Date(Number(msg.messageTimestamp) * 1000) : null,
            metadata: { timestamp: Number(msg.messageTimestamp), isHistorical: true },
          },
        });
        messagesProcessed++;
        messageCount++;
      } catch {
        // Skip errors
      }
    }
  }

  logger.info(
    { channelId, contactsProcessed, chatsProcessed, messagesProcessed },
    'Direct history sync completed'
  );
}

main();
