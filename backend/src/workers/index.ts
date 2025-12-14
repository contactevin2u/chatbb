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
import {
  normalizeIdentifier,
  resolveIdentifier,
  getOrCreateContact,
  getOrCreateConversation,
} from '../shared/utils/identifier';

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
    const { channelId, waMessage, mediaUrl } = job.data;

    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return;

    const remoteJid = waMessage.key?.remoteJid;
    if (!remoteJid) return;

    // Check if this is a group message
    const isGroup = remoteJid.endsWith('@g.us');

    // Resolve identifier with LID lookup for consistent contact matching
    const contactIdentifier = await resolveIdentifier(channelId, remoteJid);
    logger.debug({ remoteJid, contactIdentifier, isGroup }, 'Resolved contact identifier');

    // For individual contacts: use pushName from message
    // For groups: check Redis cache (populated by historical sync/group updates)
    const pushName = waMessage.pushName || null;
    let displayName: string | null = null;

    if (isGroup) {
      // Try to get group name from Redis cache (fast)
      try {
        const cached = await redisClient.get(`group:${remoteJid}:metadata`);
        if (cached) {
          const metadata = JSON.parse(cached);
          displayName = metadata.subject || 'Group Chat';
        } else {
          displayName = 'Group Chat'; // Fallback if not cached
        }
      } catch (error) {
        displayName = 'Group Chat'; // Fallback on error
      }
    } else {
      displayName = pushName;
    }

    // Get or create contact using upsert (atomic, prevents race conditions)
    const contact = await getOrCreateContact({
      organizationId: channel.organizationId,
      channelType: ChannelType.WHATSAPP,
      identifier: contactIdentifier,
      displayName,
    });

    if (contact.isNew) {
      logger.info({ contactId: contact.id, identifier: contactIdentifier, displayName, isGroup }, 'Created new contact');

      // Request avatar fetch for new non-group contacts (async, don't wait)
      if (!isGroup) {
        redisClient.publish(`whatsapp:cmd:fetch-avatar:${channelId}`, JSON.stringify({
          jid: remoteJid,
          contactId: contact.id,
          organizationId: channel.organizationId,
        })).catch(() => {}); // Fire and forget
      }
    } else if (!isGroup && !contact.avatarUrl) {
      // Request avatar fetch for existing contacts without avatar
      redisClient.publish(`whatsapp:cmd:fetch-avatar:${channelId}`, JSON.stringify({
        jid: remoteJid,
        contactId: contact.id,
        organizationId: channel.organizationId,
      })).catch(() => {}); // Fire and forget
    }

    // Determine if this message is from us (sent from phone/other device)
    // Need this early to decide whether to increment unread count
    const isFromMe = waMessage.key?.fromMe === true;

    // Get or create conversation using upsert (atomic, prevents race conditions)
    const conversationResult = await getOrCreateConversation({
      organizationId: channel.organizationId,
      channelId,
      contactId: contact.id,
      isFromMe,
    });

    const conversation = { id: conversationResult.id };

    // Log identifier trace for debugging duplicate conversation issues
    logger.info({
      channelId,
      remoteJid,
      contactIdentifier,
      isFromMe,
      contactId: contact.id,
      conversationId: conversation.id,
      isNewConversation: conversationResult.isNew,
    }, 'Message processed - identifier trace');

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

    // Add media info if this is a media message
    if (mediaInfo && isMediaMessage(msgContent)) {
      content = {
        ...content,
        mediaType: mediaInfo.type,
        mimeType: mediaInfo.mimeType,
        mediaUrl: mediaUrl || null, // Media URL from WhatsApp Worker (Cloudinary)
      };
      logger.info({ channelId, mediaType: mediaInfo.type, hasUrl: !!mediaUrl }, 'Media message processed');
    }

    // Determine message direction based on fromMe flag (isFromMe defined earlier for unread count logic)
    const direction = isFromMe ? MessageDirection.OUTBOUND : MessageDirection.INBOUND;

    // Idempotency check: skip if message already exists (prevents duplicates on retry/reconnect)
    const externalId = waMessage.key?.id;
    if (externalId) {
      const existingMessage = await prisma.message.findFirst({
        where: { externalId, channelId },
        select: { id: true },
      });

      if (existingMessage) {
        logger.debug({ channelId, externalId }, 'Message already exists, skipping (idempotency)');
        return;
      }
    }

    // Create message with error handling for race conditions
    try {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          channelId,
          externalId,
          direction,
          type,
          content,
          status: isFromMe ? MessageStatus.SENT : MessageStatus.DELIVERED,
          sentAt: isFromMe ? new Date() : null,
          deliveredAt: isFromMe ? null : new Date(),
          metadata: {
            timestamp: Number(waMessage.messageTimestamp) || Date.now(),
            pushName: waMessage.pushName || null,
            fromMe: isFromMe,
          },
        },
      });

      logger.info({ channelId, messageId: externalId, direction, isFromMe }, 'Message saved');
    } catch (error: any) {
      // Handle unique constraint violation (race condition between check and create)
      if (error.code === 'P2002') {
        logger.debug({ channelId, externalId }, 'Message already exists (race condition), skipping');
        return;
      }
      throw error;
    }

    // Get conversation with assignment info for smart routing
    const conversationWithAssignment = await prisma.conversation.findUnique({
      where: { id: conversation.id },
      select: { assignedUserId: true },
    });
    const assignedUserId = conversationWithAssignment?.assignedUserId;

    // Publish to Redis for real-time WebSocket updates
    const messagePayload = JSON.stringify({
      type: 'new',
      conversationId: conversation.id,
      channelId,
      assignedUserId, // Include for frontend filtering / smart routing
    });

    // Smart routing: if assigned, also publish to user-specific channel
    if (assignedUserId) {
      await redisClient.publish(`user:${assignedUserId}:message`, messagePayload);
    }
    // Always publish to org for admins/supervisors and unassigned conversations
    await redisClient.publish(`org:${channel.organizationId}:message`, messagePayload);

    logger.info({ channelId, messageId: externalId, assignedUserId }, 'Processed incoming message');

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
      const identifier = contact.id ? normalizeIdentifier(contact.id) : null;
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

  // Process chats and create conversations (including groups)
  for (const chat of chats || []) {
    try {
      const remoteJid = chat.id;
      if (!remoteJid) continue;

      const isGroup = remoteJid.endsWith('@g.us');
      const identifier = normalizeIdentifier(remoteJid);

      // Get display name - for groups, try to get from cache or chat.name
      let displayName = chat.name || null;
      if (isGroup && !displayName) {
        try {
          const cached = await redisClient.get(`group:${remoteJid}:metadata`);
          if (cached) {
            const metadata = JSON.parse(cached);
            displayName = metadata.subject || null;
          }
        } catch {
          // Ignore cache errors
        }
      }

      let contact = await prisma.contact.findFirst({
        where: { organizationId: orgId, channelType: ChannelType.WHATSAPP, identifier },
      });

      if (!contact) {
        contact = await prisma.contact.create({
          data: {
            organizationId: orgId,
            channelType: ChannelType.WHATSAPP,
            identifier,
            displayName,
          },
        });
      } else if (displayName && !contact.displayName) {
        // Update contact if we have a name and it's currently empty
        contact = await prisma.contact.update({
          where: { id: contact.id },
          data: { displayName },
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

    const identifier = normalizeIdentifier(jid);

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
