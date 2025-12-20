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
import { connectDatabase, disconnectDatabase, prisma } from '../core/database/prisma';
import { connectRedis, disconnectRedis, redisClient } from '../core/cache/redis.client';
import { logger } from '../shared/utils/logger';
import { redisConfig } from '../config/redis';
import { isMediaMessage, getMediaMessageInfo, processWhatsAppMedia } from '../shared/services/media.service';
import {
  normalizeIdentifier,
  getOrCreateContact,
  getOrCreateConversation,
  upsertContactFromSync,
} from '../shared/utils/identifier';
import { ChannelType, MessageDirection, MessageStatus, MessageType } from '@prisma/client';
import { autoReplyHandler } from '../modules/ai/auto-reply.handler';

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

  if (jobName === 'incoming') {
    // Process incoming WhatsApp message
    const { channelId, waMessage, mediaUrl } = job.data;

    // Only fetch organizationId - reduces payload significantly
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { organizationId: true },
    });
    if (!channel) return;

    const remoteJid = waMessage.key?.remoteJid;
    if (!remoteJid) return;

    // Check if this is a group message
    const isGroup = remoteJid.endsWith('@g.us');
    const isFromMe = waMessage.key?.fromMe === true;

    // Resolve identifier with LID lookup for consistent contact matching
    // Note: LID to phone resolution happens earlier in whatsapp.ts using remoteJidAlt
    const contactIdentifier = await normalizeIdentifier(remoteJid, channelId);

    logger.debug({ remoteJid, contactIdentifier, isGroup, isFromMe }, 'Resolved contact identifier');

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
      isGroup,
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

    // Get or create conversation using upsert (atomic, prevents race conditions)
    // Note: isFromMe was determined earlier when resolving the identifier
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

    // Extract contextInfo for quoted messages (replies)
    // contextInfo exists in extendedTextMessage, imageMessage, videoMessage, etc.
    let quotedInfo: { stanzaId: string; participant: string; quotedMessage: any } | null = null;
    const contextInfo = msgContent.extendedTextMessage?.contextInfo
      || msgContent.imageMessage?.contextInfo
      || msgContent.videoMessage?.contextInfo
      || msgContent.audioMessage?.contextInfo
      || msgContent.documentMessage?.contextInfo
      || msgContent.stickerMessage?.contextInfo;

    if (contextInfo?.stanzaId && contextInfo?.quotedMessage) {
      quotedInfo = {
        stanzaId: contextInfo.stanzaId,
        participant: contextInfo.participant || remoteJid,
        quotedMessage: contextInfo.quotedMessage,
      };
      logger.debug({ channelId, quotedStanzaId: contextInfo.stanzaId }, 'Message is a reply to another message');
    }

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
      // Handle reaction - update the reacted message
      const reactionKey = msgContent.reactionMessage.key;
      const emoji = msgContent.reactionMessage.text;

      if (reactionKey?.id) {
        // Find the message being reacted to
        const reactedMessage = await prisma.message.findFirst({
          where: { externalId: reactionKey.id, channelId },
          select: { id: true, metadata: true },
        });

        if (reactedMessage) {
          // Update message metadata with reaction
          const currentMetadata = (reactedMessage.metadata as any) || {};
          const reactions = currentMetadata.reactions || [];

          // Add or remove reaction (empty text = remove)
          if (emoji) {
            // Add reaction (remove any existing reaction from same sender first)
            const senderId = waMessage.key?.participant || waMessage.key?.remoteJid;
            const filteredReactions = reactions.filter((r: any) => r.senderId !== senderId);
            filteredReactions.push({
              emoji,
              senderId,
              timestamp: Number(waMessage.messageTimestamp) || Date.now(),
            });

            await prisma.message.update({
              where: { id: reactedMessage.id },
              data: {
                metadata: { ...currentMetadata, reactions: filteredReactions },
              },
            });
            logger.info({ channelId, messageId: reactionKey.id, emoji }, 'Reaction added to message');
          } else {
            // Remove reaction (empty text means unreact)
            const senderId = waMessage.key?.participant || waMessage.key?.remoteJid;
            const filteredReactions = reactions.filter((r: any) => r.senderId !== senderId);

            await prisma.message.update({
              where: { id: reactedMessage.id },
              data: {
                metadata: { ...currentMetadata, reactions: filteredReactions },
              },
            });
            logger.info({ channelId, messageId: reactionKey.id }, 'Reaction removed from message');
          }
        } else {
          logger.debug({ channelId, reactionKey }, 'Could not find message to react to');
        }
      }
      return; // Don't create a separate message for reactions
    }

    // Add quoted message info to content if this is a reply
    if (quotedInfo) {
      // Extract text from quoted message for display
      let quotedText = '';
      if (quotedInfo.quotedMessage.conversation) {
        quotedText = quotedInfo.quotedMessage.conversation;
      } else if (quotedInfo.quotedMessage.extendedTextMessage?.text) {
        quotedText = quotedInfo.quotedMessage.extendedTextMessage.text;
      } else if (quotedInfo.quotedMessage.imageMessage?.caption) {
        quotedText = `[Image] ${quotedInfo.quotedMessage.imageMessage.caption || ''}`;
      } else if (quotedInfo.quotedMessage.videoMessage?.caption) {
        quotedText = `[Video] ${quotedInfo.quotedMessage.videoMessage.caption || ''}`;
      } else if (quotedInfo.quotedMessage.documentMessage) {
        quotedText = `[Document] ${quotedInfo.quotedMessage.documentMessage.fileName || ''}`;
      } else if (quotedInfo.quotedMessage.audioMessage) {
        quotedText = '[Audio]';
      } else if (quotedInfo.quotedMessage.stickerMessage) {
        quotedText = '[Sticker]';
      }

      content = {
        ...content,
        quotedMessage: {
          stanzaId: quotedInfo.stanzaId,
          participant: quotedInfo.participant,
          text: quotedText,
        },
      };
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
    // Uses composite unique index [channelId, externalId] for fast O(1) lookup
    const externalId = waMessage.key?.id;
    if (externalId) {
      const existingMessage = await prisma.message.findUnique({
        where: { channelId_externalId: { channelId, externalId } },
        select: { id: true },
      });

      if (existingMessage) {
        logger.debug({ channelId, externalId }, 'Message already exists, skipping (idempotency)');
        return;
      }
    }

    // Build message metadata
    // Store key and messageTimestamp for on-demand history fetch (fetchMessageHistory)
    const messageMetadata: Record<string, any> = {
      timestamp: Number(waMessage.messageTimestamp) || Date.now(),
      pushName: waMessage.pushName || null,
      fromMe: isFromMe,
      key: waMessage.key, // Required for fetchMessageHistory anchor
      messageTimestamp: Number(waMessage.messageTimestamp) || Math.floor(Date.now() / 1000),
    };

    // For group messages, store sender info (participant)
    if (isGroup && !isFromMe) {
      const participant = waMessage.key?.participant;
      if (participant) {
        const participantIdentifier = await normalizeIdentifier(participant, channelId);
        messageMetadata.groupSender = {
          jid: participant,
          identifier: participantIdentifier,
          pushName: waMessage.pushName || null,
        };
      }
    }

    // Create message with error handling for race conditions
    let savedMessage;
    try {
      savedMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          channelId,
          externalId,
          direction,
          type,
          // Store both parsed content and raw message for Baileys getMessage
          content: { ...content, message: msgContent },
          status: isFromMe ? MessageStatus.SENT : MessageStatus.DELIVERED,
          sentAt: isFromMe ? new Date() : null,
          deliveredAt: isFromMe ? null : new Date(),
          metadata: messageMetadata,
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
    // Include full message object for frontend to display immediately
    const messagePayload = JSON.stringify({
      message: savedMessage,
      conversationId: conversation.id,
      channelId,
      assignedUserId,
    });

    // Smart routing: if assigned, also publish to user-specific channel
    if (assignedUserId) {
      await redisClient.publish(`user:${assignedUserId}:message`, messagePayload);
    }
    // Always publish to org for admins/supervisors and unassigned conversations
    await redisClient.publish(`org:${channel.organizationId}:message`, messagePayload);

    logger.info({ channelId, messageId: externalId, assignedUserId }, 'Processed incoming message');

    // Trigger AI auto-reply for inbound messages (non-blocking)
    if (!isFromMe && savedMessage) {
      autoReplyHandler.handleIncomingMessage(conversation.id, savedMessage).catch((err) => {
        logger.error({ error: err.message, conversationId: conversation.id }, 'Auto-reply handler error');
      });
    }

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
// Uses shared functions for consistent contact handling
async function processHistorySync(job: Job) {
  const { channelId, chats, contacts, messages } = job.data;
  logger.info({ jobId: job.id, channelId, chats: chats?.length, contacts: contacts?.length }, 'Processing history sync');

  // Only fetch organizationId - reduces payload
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { organizationId: true },
  });
  if (!channel) return;

  const orgId = channel.organizationId;

  // Process contacts using shared function
  // This handles LID resolution and duplicate merging automatically
  for (const contact of contacts || []) {
    try {
      // Skip groups - they're handled in chats processing
      if (contact.id?.endsWith('@g.us')) continue;

      await upsertContactFromSync(channelId, {
        id: contact.id,
        phoneNumber: contact.phoneNumber,
        name: contact.name,
        notify: contact.notify,
        verifiedName: contact.verifiedName,
        pushname: contact.pushname,
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

      // Resolve identifier using shared function (handles LID resolution)
      const identifier = await normalizeIdentifier(remoteJid, channelId);

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

      // Use shared upsert helper for consistent contact creation
      // forceDisplayNameUpdate for sync operations
      const contact = await getOrCreateContact({
        organizationId: orgId,
        channelType: ChannelType.WHATSAPP,
        identifier,
        displayName,
        isGroup,
        forceDisplayNameUpdate: true,
      });

      // Use shared upsert helper for consistent conversation creation
      await getOrCreateConversation({
        organizationId: orgId,
        channelId,
        contactId: contact.id,
        isFromMe: false,
      });
    } catch (error) {
      // Skip errors
    }
  }

  // Process messages - Baileys provides WAMessage[] (flat array), NOT object keyed by JID
  // Group messages by JID for efficient contact/conversation lookup
  const messagesByJid = new Map<string, any[]>();
  for (const msg of (messages as any[]) || []) {
    const jid = msg.key?.remoteJid;
    if (!jid) continue;
    if (!messagesByJid.has(jid)) {
      messagesByJid.set(jid, []);
    }
    messagesByJid.get(jid)!.push(msg);
  }

  let messagesProcessed = 0;
  for (const [jid, msgs] of messagesByJid) {
    try {
      // Use normalizeIdentifier with channelId for proper LID→phone mapping
      const identifier = await normalizeIdentifier(jid, channelId);

      const contact = await prisma.contact.findFirst({
        where: { organizationId: orgId, channelType: ChannelType.WHATSAPP, identifier },
      });
      if (!contact) continue;

      const conversation = await prisma.conversation.findFirst({
        where: { channelId, contactId: contact.id },
      });
      if (!conversation) continue;

      for (const msg of msgs) {
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

          // Use original message timestamp for createdAt (not sync time)
          // messageTimestamp is Unix epoch in seconds
          const originalTimestamp = new Date(Number(msg.messageTimestamp) * 1000);

          await prisma.message.create({
            data: {
              conversationId: conversation.id,
              channelId,
              externalId,
              direction: isFromMe ? MessageDirection.OUTBOUND : MessageDirection.INBOUND,
              type,
              // Store both parsed content and raw message for Baileys getMessage
              content: { ...content, message: msg.message },
              status: isFromMe ? MessageStatus.SENT : MessageStatus.DELIVERED,
              sentAt: isFromMe ? originalTimestamp : null,
              deliveredAt: !isFromMe ? originalTimestamp : null,
              // IMPORTANT: Set createdAt to original message time, not sync time
              createdAt: originalTimestamp,
              metadata: { timestamp: Number(msg.messageTimestamp), isHistorical: true },
            },
          });
          messagesProcessed++;
        } catch (error) {
          // Skip duplicate or invalid messages
        }
      }
    } catch (error) {
      // Skip errors for this JID, continue with next
    }
  }

  logger.info({ channelId, messagesProcessed, totalJids: messagesByJid.size }, 'History sync completed');
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

    // Message worker - high concurrency for I/O-bound operations
    const messageWorker = new Worker(QUEUES.MESSAGE, processMessage, {
      connection,
      concurrency: 50,  // Increased from 10 - safe for I/O-bound workloads (DB, Redis)
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
