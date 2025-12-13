/**
 * Background Worker
 *
 * Processes background jobs using BullMQ:
 * - Message queue processing
 * - Broadcast campaign execution
 * - Webhook deliveries
 * - Analytics aggregation
 * - Media upload to Cloudinary
 */

import { Worker, Job } from 'bullmq';
import { connectDatabase, disconnectDatabase } from '../core/database/prisma';
import { connectRedis, disconnectRedis, redisClient } from '../core/cache/redis.client';
import { logger } from '../shared/utils/logger';
import { redisConfig } from '../config/redis';
import { isMediaMessage, getMediaMessageInfo, processWhatsAppMedia } from '../shared/services/media.service';

// Queue names
const QUEUES = {
  MESSAGE: 'message-queue',
  BROADCAST: 'broadcast-queue',
  WEBHOOK: 'webhook-queue',
  ANALYTICS: 'analytics-queue',
  HISTORY_SYNC: 'history-sync-queue',
};

// Message queue processor - handles incoming messages and status updates
async function processMessage(job: Job) {
  const jobName = job.name;
  logger.info({ jobId: job.id, jobName }, 'Processing message job');

  const { prisma } = await import('../core/database/prisma.js');
  const { ChannelType, MessageDirection, MessageStatus, MessageType } = await import('@prisma/client');

  if (jobName === 'incoming') {
    // Process incoming WhatsApp message
    const { channelId, waMessage } = job.data;

    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return;

    const remoteJid = waMessage.key?.remoteJid;
    if (!remoteJid) return;

    const contactIdentifier = remoteJid.split('@')[0];

    // Get or create contact
    const pushName = waMessage.pushName || null;

    let contact = await prisma.contact.findFirst({
      where: {
        organizationId: channel.organizationId,
        channelType: ChannelType.WHATSAPP,
        identifier: contactIdentifier,
      },
    });

    if (!contact) {
      // Create new contact with pushName
      contact = await prisma.contact.create({
        data: {
          organizationId: channel.organizationId,
          channelType: ChannelType.WHATSAPP,
          identifier: contactIdentifier,
          displayName: pushName,
        },
      });
    } else if (pushName && (!contact.displayName || contact.displayName !== pushName)) {
      // Update existing contact's displayName if pushName is available and different
      contact = await prisma.contact.update({
        where: { id: contact.id },
        data: { displayName: pushName },
      });
    }

    // Get or create conversation
    let conversation = await prisma.conversation.findFirst({
      where: { channelId, contactId: contact.id },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          organizationId: channel.organizationId,
          channelId,
          contactId: contact.id,
          status: 'OPEN',
          lastMessageAt: new Date(),
          unreadCount: 1,
        },
      });
    } else {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          unreadCount: { increment: 1 },
          status: conversation.status === 'CLOSED' ? 'OPEN' : conversation.status,
        },
      });
    }

    // Parse message content
    const msgContent = waMessage.message || {};
    let type: typeof MessageType[keyof typeof MessageType] = MessageType.TEXT;
    let content: any = {};

    // Check if this is a media message
    const mediaInfo = getMediaMessageInfo(msgContent);

    if (msgContent.conversation) {
      content = { text: msgContent.conversation };
    } else if (msgContent.extendedTextMessage) {
      content = { text: msgContent.extendedTextMessage.text };
    } else if (msgContent.imageMessage) {
      type = MessageType.IMAGE;
      content = { caption: msgContent.imageMessage.caption };
    } else if (msgContent.videoMessage) {
      type = MessageType.VIDEO;
      content = { caption: msgContent.videoMessage.caption, isGif: msgContent.videoMessage.gifPlayback };
    } else if (msgContent.audioMessage) {
      type = MessageType.AUDIO;
      content = { ptt: msgContent.audioMessage.ptt, seconds: msgContent.audioMessage.seconds };
    } else if (msgContent.documentMessage) {
      type = MessageType.DOCUMENT;
      content = { filename: msgContent.documentMessage.fileName, caption: msgContent.documentMessage.caption };
    } else if (msgContent.stickerMessage) {
      type = MessageType.STICKER;
      content = { isAnimated: msgContent.stickerMessage.isAnimated };
    } else if (msgContent.reactionMessage) {
      // Reactions are handled separately - they're updates to existing messages
      logger.debug({ channelId, reaction: msgContent.reactionMessage }, 'Reaction received');
      return; // Don't create a separate message for reactions
    }

    // Upload media to Cloudinary if this is a media message
    if (mediaInfo && isMediaMessage(msgContent)) {
      try {
        // Note: processWhatsAppMedia needs the full WAMessage, not just the content
        // For now, we store the media type info and the frontend can request the media URL later
        // TODO: Add media download in WhatsApp Worker and pass the URL here
        content = {
          ...content,
          mediaType: mediaInfo.type,
          mimeType: mediaInfo.mimeType,
          // Media URL will be added when we implement the download flow
        };
        logger.debug({ channelId, mediaType: mediaInfo.type }, 'Media message detected');
      } catch (error) {
        logger.error({ channelId, error }, 'Failed to process media');
      }
    }

    // Create message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        channelId,
        externalId: waMessage.key?.id,
        direction: MessageDirection.INBOUND,
        type,
        content,
        status: MessageStatus.DELIVERED,
        deliveredAt: new Date(),
        metadata: {
          timestamp: Number(waMessage.messageTimestamp) || Date.now(),
          pushName: waMessage.pushName || null,
        },
      },
    });

    // Publish to Redis for real-time WebSocket updates
    const { redisClient } = await import('../core/cache/redis.client.js');
    await redisClient.publish(`org:${channel.organizationId}:message`, JSON.stringify({
      type: 'new',
      conversationId: conversation.id,
      channelId,
    }));

    logger.info({ channelId, messageId: waMessage.key?.id }, 'Processed incoming message');

  } else if (jobName === 'status_update') {
    // Process message status update
    const { channelId, update } = job.data;
    const externalId = update.key?.id;
    if (!externalId) return;

    const message = await prisma.message.findFirst({
      where: { externalId, channelId },
    });

    if (!message) return;

    const statusUpdate: any = {};
    if (update.update?.status === 2) {
      statusUpdate.status = MessageStatus.DELIVERED;
      statusUpdate.deliveredAt = new Date();
    } else if (update.update?.status === 3 || update.update?.status === 4) {
      statusUpdate.status = MessageStatus.READ;
      statusUpdate.readAt = new Date();
    }

    if (Object.keys(statusUpdate).length > 0) {
      await prisma.message.update({
        where: { id: message.id },
        data: statusUpdate,
      });
    }
  }
}

// NOTE: Broadcast processing moved to WhatsApp Worker (whatsapp.ts)
// because it needs sessionManager which only has active sessions there

// Webhook queue processor
async function processWebhook(job: Job) {
  const { webhookId, event, payload } = job.data;
  logger.info({ jobId: job.id, webhookId, event }, 'Processing webhook job');

  const { prisma } = await import('../core/database/prisma.js');

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

// History sync processor - processes historical WhatsApp data in background
// This runs with LOW priority so live messages are processed FIRST
async function processHistorySync(job: Job) {
  const { channelId, chats, contacts, messages } = job.data;
  logger.info({ jobId: job.id, channelId, chats: chats?.length, contacts: contacts?.length }, 'Processing history sync');

  const { prisma } = await import('../core/database/prisma.js');
  const { ChannelType, MessageDirection, MessageStatus, MessageType } = await import('@prisma/client');

  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return;

  const orgId = channel.organizationId;

  // Process contacts (batch upsert)
  for (const contact of contacts || []) {
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
    } catch (error) {
      // Skip errors, continue with next contact
    }
  }

  // Process chats and create conversations
  for (const chat of chats || []) {
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
    } catch (error) {
      // Skip errors
    }
  }

  // Process messages
  for (const [jid, msgs] of Object.entries(messages || {})) {
    if (!Array.isArray(msgs)) continue;

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
      } catch (error) {
        // Skip duplicate or invalid messages
      }
    }
  }

  logger.info({ channelId }, 'History sync completed');
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

    // NOTE: Broadcast worker runs in WhatsApp Worker (needs sessionManager)
    logger.info('Broadcast worker runs in WhatsApp Worker');

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

    // History sync worker - LOW concurrency, runs in background
    // Does NOT block live message processing
    const historySyncWorker = new Worker(QUEUES.HISTORY_SYNC, processHistorySync, {
      connection,
      concurrency: 2, // Low concurrency for background sync
    });
    workers.push(historySyncWorker);
    logger.info('History sync worker started (non-blocking)');

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
