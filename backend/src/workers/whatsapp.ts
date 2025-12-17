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
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { sessionManager } from '../modules/whatsapp/session/session.manager';
import { connectDatabase, disconnectDatabase, prisma } from '../core/database/prisma';
import { connectRedis, disconnectRedis, redisClient } from '../core/cache/redis.client';
import { logger } from '../shared/utils/logger';
import { redisConfig } from '../config/redis';
import { isMediaMessage, uploadToCloudinary, uploadFromUrlToCloudinary } from '../shared/services/media.service';
import {
  normalizeIdentifier,
  getOrCreateContact,
  getOrCreateConversation,
  storeLidMapping,
} from '../shared/utils/identifier';
import { sequenceService, SequenceStepContent } from '../modules/sequence/sequence.service';
import { scheduledMessageService, ScheduledMessageContent } from '../modules/scheduled-message/scheduled-message.service';
import { SequenceStepType } from '@prisma/client';

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
    let mediaUrl: string | undefined;

    // CRITICAL: Handle LID to Phone Number resolution using remoteJidAlt
    // Baileys v7 provides remoteJidAlt which contains the alternate JID format
    // If remoteJid is LID format, remoteJidAlt contains the phone number (and vice versa)
    const originalRemoteJid = waMessage.key?.remoteJid;
    const remoteJidAlt = (waMessage.key as any)?.remoteJidAlt;
    const participantAlt = (waMessage.key as any)?.participantAlt;

    // Resolve LID to phone number if possible
    if (originalRemoteJid?.includes('@lid') && remoteJidAlt && !remoteJidAlt.includes('@lid')) {
      // remoteJid is LID, remoteJidAlt is phone number - use phone number
      logger.info({
        channelId,
        lid: originalRemoteJid,
        phoneJid: remoteJidAlt,
      }, 'Resolved LID to phone number using remoteJidAlt');

      // Store the mapping using shared function (triggers duplicate merge)
      const lidPart = originalRemoteJid.split('@')[0];
      const phonePart = remoteJidAlt.split('@')[0];
      await storeLidMapping(channelId, lidPart, phonePart);

      // Replace LID with phone number in the message key
      waMessage.key.remoteJid = remoteJidAlt;
    }

    // Also handle participant LIDs for group messages
    if (waMessage.key?.participant?.includes('@lid') && participantAlt && !participantAlt.includes('@lid')) {
      logger.info({
        channelId,
        participantLid: waMessage.key.participant,
        participantPhone: participantAlt,
      }, 'Resolved participant LID to phone number');

      // Store the mapping using shared function (triggers duplicate merge)
      const lidPart = waMessage.key.participant.split('@')[0];
      const phonePart = participantAlt.split('@')[0];
      await storeLidMapping(channelId, lidPart, phonePart);
    }

    const remoteJid = waMessage.key?.remoteJid;

    // For group messages, ensure group metadata is cached and contact is updated
    if (remoteJid?.endsWith('@g.us')) {
      try {
        // This will fetch and cache if not already cached
        const metadata = await sessionManager.getGroupMetadata(channelId, remoteJid);

        // If we got metadata with a subject, update the contact name in database
        if (metadata?.subject) {
          const { ChannelType } = await import('@prisma/client');
          const channel = await prisma.channel.findUnique({
            where: { id: channelId },
            select: { organizationId: true },
          });

          if (channel) {
            const groupIdentifier = remoteJid.split('@')[0];
            await prisma.contact.updateMany({
              where: {
                organizationId: channel.organizationId,
                channelType: ChannelType.WHATSAPP,
                identifier: groupIdentifier,
                // Only update if name is null or "Group Chat" (fallback)
                OR: [
                  { displayName: null },
                  { displayName: 'Group Chat' },
                ],
              },
              data: { displayName: metadata.subject },
            });
            logger.debug({ channelId, groupJid: remoteJid, subject: metadata.subject }, 'Updated group contact name');
          }
        }
      } catch (error) {
        logger.debug({ channelId, groupJid: remoteJid }, 'Could not fetch group metadata');
      }
    }

    // Check if message has media and download/upload it
    if (waMessage.message && isMediaMessage(waMessage.message)) {
      try {
        logger.info({ channelId, messageId: waMessage.key?.id }, 'Downloading media from WhatsApp...');

        // Get reupload function from session
        const reuploadRequest = sessionManager.getMediaDownloader(channelId);

        // Download media buffer from WhatsApp
        // Cast to any because IWebMessageInfo and WAMessage have slight type differences
        const buffer = await downloadMediaMessage(
          waMessage as any,
          'buffer',
          {},
          {
            logger: logger as any,
            reuploadRequest,
          }
        ) as Buffer;

        if (buffer && buffer.length > 0) {
          logger.info({ channelId, size: buffer.length }, 'Media downloaded, uploading to Cloudinary...');

          // Get channel for organization ID
          const channel = await prisma.channel.findUnique({ where: { id: channelId } });
          if (channel) {
            // Upload to Cloudinary
            const folder = `chatbaby/${channel.organizationId}/media`;
            const uploaded = await uploadToCloudinary(buffer, {
              folder,
              resourceType: 'auto',
              publicId: waMessage.key?.id || undefined,
            });

            if (uploaded) {
              mediaUrl = uploaded.url;
              logger.info({ channelId, mediaUrl }, 'Media uploaded to Cloudinary');
            }
          }
        }
      } catch (error) {
        logger.error({ channelId, error: (error as Error).message }, 'Failed to download/upload media');
        // Continue without media URL - message will still be saved
      }
    }

    // Queue message for processing (with media URL if available)
    await messageQueue.add(
      'incoming',
      {
        channelId,
        waMessage: JSON.parse(JSON.stringify(waMessage)),
        mediaUrl, // Include media URL if we uploaded it
      },
      { priority: 1 } // High priority
    );
    logger.debug({ channelId, messageId: waMessage.key?.id, hasMedia: !!mediaUrl }, 'Queued incoming message');
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
  await redisSubscriber.subscribe('sequence:execute');

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

        case 'profile-picture':
          // Get profile picture
          await handleProfilePictureCommand(channelId, data);
          break;

        case 'fetch-avatar':
          // Fetch and store contact avatar
          await handleFetchAvatarCommand(channelId, data);
          break;

        case 'reconnect':
          // Reconnect using saved credentials
          await handleReconnectCommand(channelId, data);
          break;

        default:
          logger.warn({ command }, 'Unknown command');
      }
    } catch (error) {
      logger.error({ channel, error }, 'Error processing command');
    }
  });

  // Handle sequence:execute messages (non-pattern subscription)
  redisSubscriber.on('message', async (channel, message) => {
    if (channel === 'sequence:execute') {
      try {
        const data = JSON.parse(message);
        logger.info({ executionId: data.executionId }, 'Processing sequence execution immediately');
        await processSequenceExecution(data.executionId);
      } catch (error) {
        logger.error({ channel, error }, 'Error processing sequence execution');
      }
    }
  });

  logger.info('Command subscriber configured');
}

async function handleConnectCommand(channelId: string, data: { organizationId: string }) {
  try {
    logger.info({ channelId, organizationId: data.organizationId }, 'Starting connect command');

    // Check if session already exists
    const existingSession = sessionManager.getSession(channelId);
    if (existingSession) {
      // If session exists but not connected, close it and create fresh
      if (existingSession.status !== 'CONNECTED') {
        logger.info({ channelId, status: existingSession.status }, 'Closing existing non-connected session for fresh QR');
        try {
          existingSession.socket.end(undefined);
        } catch (e) {
          // Ignore close errors
        }
        sessionManager.removeSession(channelId);
        // Small delay before recreating
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        // Already connected, just publish status
        logger.info({ channelId }, 'Session already connected');
        await redisClient.publish(`whatsapp:${channelId}:status`, JSON.stringify({
          status: 'connected',
          channelId,
        }));
        return;
      }
    }

    const session = await sessionManager.createSession(channelId, data.organizationId);

    logger.info({ channelId, status: session.status }, 'Session created, publishing status');

    await redisClient.publish(`whatsapp:${channelId}:status`, JSON.stringify({
      status: 'connecting',
      channelId,
    }));
  } catch (error) {
    logger.error({ channelId, error: (error as Error).message, stack: (error as Error).stack }, 'Connect command failed');

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

async function handleSendCommand(channelId: string, data: {
  to: string;
  text?: string;
  media?: any;
  sticker?: any;
  gif?: any;
  voiceNote?: any;
  reaction?: { messageKey: any; emoji: string };
  quotedMessageId?: string;
  requestId: string
}) {
  try {
    let result;

    // Build quoted message object if quotedMessageId is provided
    let quotedMessage: any = undefined;
    if (data.quotedMessageId) {
      // Fetch the original message from database to get full content for quote preview
      const originalMessage = await prisma.message.findFirst({
        where: {
          OR: [
            { externalId: data.quotedMessageId },
            { id: data.quotedMessageId },
          ],
          channelId,
        },
        select: {
          externalId: true,
          direction: true,
          content: true,
          type: true,
        },
      });

      const jid = data.to.includes('@') ? data.to : `${data.to}@s.whatsapp.net`;
      const isFromMe = originalMessage?.direction === 'OUTBOUND';

      // Construct message object with actual content for proper quote preview
      let messageContent: any = { conversation: '' };
      if (originalMessage?.content) {
        const content = originalMessage.content as any;
        if (content.text) {
          messageContent = { conversation: content.text };
        } else if (content.caption) {
          // For media with captions
          messageContent = { conversation: content.caption };
        }
      }

      quotedMessage = {
        key: {
          remoteJid: jid,
          id: originalMessage?.externalId || data.quotedMessageId,
          fromMe: isFromMe,
        },
        message: messageContent,
      };
      logger.debug({ channelId, quotedMessageId: data.quotedMessageId, hasOriginal: !!originalMessage }, 'Replying to message');
    }

    // Priority: media > sticker > gif > voiceNote > reaction > text
    // If media is provided, send as media message (text becomes caption)
    if (data.media) {
      // If text is provided along with media, use it as caption
      if (data.text && !data.media.caption) {
        data.media.caption = data.text;
      }
      result = await sessionManager.sendMediaMessage(channelId, data.to, data.media, quotedMessage);
    } else if (data.sticker) {
      result = await sessionManager.sendStickerMessage(channelId, data.to, data.sticker);
    } else if (data.gif) {
      result = await sessionManager.sendGifMessage(channelId, data.to, data.gif);
    } else if (data.voiceNote) {
      result = await sessionManager.sendVoiceNote(channelId, data.to, data.voiceNote);
    } else if (data.reaction) {
      result = await sessionManager.sendReaction(channelId, data.reaction.messageKey, data.reaction.emoji);
    } else if (data.text) {
      result = await sessionManager.sendTextMessage(channelId, data.to, data.text, quotedMessage);
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

async function handleProfilePictureCommand(channelId: string, data: { jid: string; requestId: string }) {
  try {
    const url = await sessionManager.getProfilePicture(channelId, data.jid);
    await redisClient.publish(`whatsapp:response:${data.requestId}`, JSON.stringify({
      success: true,
      url,
    }));
  } catch (error) {
    await redisClient.publish(`whatsapp:response:${data.requestId}`, JSON.stringify({
      success: false,
      error: (error as Error).message,
    }));
  }
}

async function handleFetchAvatarCommand(channelId: string, data: { jid: string; contactId: string; organizationId: string }) {
  try {
    const avatarUrl = await fetchAndStoreProfilePicture(channelId, data.jid, data.organizationId);
    if (avatarUrl) {
      await prisma.contact.update({
        where: { id: data.contactId },
        data: { avatarUrl },
      });
      logger.info({ contactId: data.contactId, avatarUrl }, 'Contact avatar updated');
    }
  } catch (error) {
    logger.debug({ channelId, contactId: data.contactId, error }, 'Failed to fetch avatar');
  }
}

async function handleReconnectCommand(channelId: string, data: { organizationId: string; hasAuthState: boolean }) {
  try {
    logger.info({ channelId, hasAuthState: data.hasAuthState }, 'Reconnect command received');

    // First, close any existing session gracefully (without logout)
    const existingSession = sessionManager.getSession(channelId);
    if (existingSession) {
      try {
        // Close socket without logging out (preserve credentials)
        existingSession.socket.end(undefined);
        logger.info({ channelId }, 'Closed existing session for reconnect');
      } catch (error) {
        logger.warn({ channelId, error }, 'Error closing existing session');
      }
      // Remove from sessions map
      sessionManager.removeSession(channelId);
    }

    // Small delay to ensure clean state
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create new session - this will use saved credentials from PostgreSQL
    // If credentials exist and are valid, it will connect without QR
    // If credentials are invalid or missing, it will generate QR code
    await sessionManager.createSession(channelId, data.organizationId);

    await redisClient.publish(`whatsapp:${channelId}:status`, JSON.stringify({
      status: 'reconnecting',
      channelId,
    }));

    logger.info({ channelId }, 'Reconnect initiated');
  } catch (error) {
    logger.error({ channelId, error }, 'Reconnect failed');
    await redisClient.publish(`whatsapp:${channelId}:error`, JSON.stringify({
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

    // Health check - log session stats every minute
    setInterval(() => {
      const sessions = sessionManager.getAllSessions();
      const stats = {
        total: sessions.size,
        connected: 0,
        connecting: 0,
        disconnected: 0,
        error: 0,
      };

      for (const [, session] of sessions) {
        switch (session.status) {
          case 'CONNECTED':
            stats.connected++;
            break;
          case 'CONNECTING':
            stats.connecting++;
            break;
          case 'DISCONNECTED':
            stats.disconnected++;
            break;
          case 'ERROR':
            stats.error++;
            break;
        }
      }

      logger.info(stats, 'Session health check');
    }, 60000);

    // Scheduled message processor - check every 10 seconds
    setInterval(processScheduledMessages, 10000);
    logger.info('Scheduled message processor started (10s interval)');

    // Scheduled sequence processor - check every 10 seconds
    // Sequences can be scheduled to START at a future time (not just DELAY steps)
    setInterval(processScheduledSequences, 10000);
    logger.info('Scheduled sequence processor started (10s interval)');

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
 * Fetch profile picture from WhatsApp and upload to Cloudinary
 * Returns the Cloudinary URL or null if not available
 */
async function fetchAndStoreProfilePicture(
  channelId: string,
  jid: string,
  organizationId: string
): Promise<string | null> {
  try {
    // Get profile picture URL from WhatsApp
    const ppUrl = await sessionManager.getProfilePicture(channelId, jid);
    if (!ppUrl) return null;

    // Upload to Cloudinary
    const identifier = normalizeIdentifier(jid);
    const cloudinaryUrl = await uploadFromUrlToCloudinary(ppUrl, {
      folder: `chatbaby/${organizationId}/avatars`,
      publicId: `contact_${identifier}`,
    });

    return cloudinaryUrl;
  } catch (error) {
    // Profile picture not available (private, no picture, etc.)
    logger.debug({ channelId, jid }, 'Could not fetch profile picture');
    return null;
  }
}

/**
 * Process contacts upsert - bulk contact sync from WhatsApp
 * Uses shared upsertContactFromSync for consistent behavior
 */
async function processContactsUpsert(channelId: string, contacts: any[]) {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return;

  const orgId = channel.organizationId;
  let processed = 0;
  const contactsNeedingAvatar: { id: string; jid: string }[] = [];

  // Import shared function
  const { upsertContactFromSync } = await import('../shared/utils/identifier.js');

  for (const contact of contacts) {
    try {
      // Skip groups - they're handled separately via groups.upsert
      if (contact.id?.endsWith('@g.us')) continue;

      // Use shared function for consistent contact handling
      const upsertedContact = await upsertContactFromSync(channelId, {
        id: contact.id,
        phoneNumber: contact.phoneNumber,
        name: contact.name,
        notify: contact.notify,
        verifiedName: contact.verifiedName,
        pushname: contact.pushname,
      });

      if (!upsertedContact) continue;

      // Queue for avatar fetch if contact doesn't have one
      if (!upsertedContact.avatarUrl && contact.id) {
        contactsNeedingAvatar.push({ id: upsertedContact.id, jid: contact.id });
      }

      processed++;
    } catch {
      // Skip errors, continue with next contact
    }
  }

  logger.info({ channelId, total: contacts.length, processed }, 'Contacts upsert processed');

  // Fetch profile pictures in background (limit to 20 to avoid rate limiting)
  const avatarsToFetch = contactsNeedingAvatar.slice(0, 20);
  if (avatarsToFetch.length > 0) {
    logger.info({ channelId, count: avatarsToFetch.length }, 'Fetching profile pictures...');

    for (const { id, jid } of avatarsToFetch) {
      try {
        const avatarUrl = await fetchAndStoreProfilePicture(channelId, jid, orgId);
        if (avatarUrl) {
          await prisma.contact.update({
            where: { id },
            data: { avatarUrl },
          });
        }
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch {
        // Continue with next contact
      }
    }

    logger.info({ channelId, count: avatarsToFetch.length }, 'Profile pictures fetched');
  }
}

/**
 * Process contacts update - individual contact info changes
 * Uses shared upsertContactFromSync for consistent behavior
 */
async function processContactsUpdate(channelId: string, contacts: any[]) {
  let updated = 0;

  // Import shared function
  const { upsertContactFromSync } = await import('../shared/utils/identifier.js');

  for (const contact of contacts) {
    try {
      // Skip groups - they're handled separately via groups.update
      if (contact.id?.endsWith('@g.us')) continue;

      // Use shared function for consistent contact handling
      const result = await upsertContactFromSync(channelId, {
        id: contact.id,
        phoneNumber: contact.phoneNumber,
        name: contact.name,
        notify: contact.notify,
        verifiedName: contact.verifiedName,
        pushname: contact.pushname,
      });

      if (result) updated++;
    } catch {
      // Skip errors
    }
  }

  logger.debug({ channelId, total: contacts.length, updated }, 'Contacts update processed');
}

/**
 * Process history sync directly (fallback when Redis/BullMQ is unavailable)
 * Uses shared functions for consistent contact handling
 */
async function processHistorySyncDirect(channelId: string, data: { chats: any[]; contacts: any[]; messages: any; syncType: any }) {
  const { ChannelType, MessageDirection, MessageStatus, MessageType } = await import('@prisma/client');
  const { upsertContactFromSync, resolveIdentifier } = await import('../shared/utils/identifier.js');

  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return;

  const orgId = channel.organizationId;
  let contactsProcessed = 0;
  let chatsProcessed = 0;
  let messagesProcessed = 0;

  // Process contacts using shared function
  // This handles LID resolution and duplicate merging automatically
  for (const contact of data.contacts || []) {
    try {
      // Skip groups - they're handled in chats processing
      if (contact.id?.endsWith('@g.us')) continue;

      const result = await upsertContactFromSync(channelId, {
        id: contact.id,
        phoneNumber: contact.phoneNumber,
        name: contact.name,
        notify: contact.notify,
        verifiedName: contact.verifiedName,
        pushname: contact.pushname,
      });

      if (result) contactsProcessed++;
    } catch {
      // Skip errors
    }
  }

  // Process chats and create conversations (including groups)
  for (const chat of data.chats || []) {
    try {
      const remoteJid = chat.id;
      if (!remoteJid) continue;

      const isGroup = remoteJid.endsWith('@g.us');

      // Resolve identifier using shared function (handles LID resolution)
      const identifier = await resolveIdentifier(channelId, remoteJid);

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
      chatsProcessed++;
    } catch {
      // Skip errors
    }
  }

  // Process messages - Baileys provides WAMessage[] (flat array), NOT object keyed by JID
  // Limit to avoid timeout in direct fallback (Redis OOM scenario)
  const messageLimit = 500; // Increased limit since we're handling flat array now
  let messageCount = 0;

  // Group messages by JID for efficient contact/conversation lookup
  const messagesByJid = new Map<string, any[]>();
  for (const msg of (data.messages as any[]) || []) {
    const jid = msg.key?.remoteJid;
    if (!jid) continue;
    if (!messagesByJid.has(jid)) {
      messagesByJid.set(jid, []);
    }
    messagesByJid.get(jid)!.push(msg);
  }

  for (const [jid, msgs] of messagesByJid) {
    if (messageCount >= messageLimit) break;

    try {
      // Use resolveIdentifier for proper LID→phone mapping
      const identifier = await resolveIdentifier(channelId, jid);

      const contact = await prisma.contact.findFirst({
        where: { organizationId: orgId, channelType: ChannelType.WHATSAPP, identifier },
      });
      if (!contact) continue;

      const conversation = await prisma.conversation.findFirst({
        where: { channelId, contactId: contact.id },
      });
      if (!conversation) continue;

      for (const msg of msgs) {
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
    } catch {
      // Skip errors for this JID, continue with next
    }
  }

  logger.info(
    { channelId, contactsProcessed, chatsProcessed, messagesProcessed, totalJids: messagesByJid.size },
    'Direct history sync completed'
  );
}


/**
 * Process a single sequence execution immediately (all steps)
 * Called when sequence:execute Redis message is received
 */
async function processSequenceExecution(executionId: string) {
  const { MessageDirection, MessageStatus, MessageType } = await import('@prisma/client');

  // Fetch the execution with full data
  const execution = await prisma.sequenceExecution.findUnique({
    where: { id: executionId },
    include: {
      sequence: {
        include: {
          steps: { orderBy: { order: 'asc' } },
        },
      },
      conversation: {
        select: {
          id: true,
          channelId: true,
          contact: {
            select: { id: true, identifier: true },
          },
        },
      },
    },
  });

  if (!execution || execution.status !== 'running') {
    logger.warn({ executionId }, 'Execution not found or not running');
    return;
  }

  const { sequence, conversation } = execution;
  const channelId = conversation.channelId;
  const recipient = conversation.contact.identifier;

  // Check if channel is connected
  const session = sessionManager.getAllSessions().get(channelId);
  if (!session || session.status !== 'CONNECTED') {
    logger.warn({ executionId, channelId }, 'Channel not connected, sequence will be retried by polling worker');
    return;
  }

  // Get channel for WebSocket broadcasts
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { organizationId: true },
  });

  logger.info({ executionId, sequenceName: sequence.name, stepCount: sequence.steps.length }, 'Starting immediate sequence execution');

  // Process all steps starting from currentStep
  let currentStepIndex = execution.currentStep;

  while (currentStepIndex < sequence.steps.length) {
    const step = sequence.steps[currentStepIndex];
    const content = step.content as SequenceStepContent;

    // Handle DELAY steps - actually wait
    if (step.type === SequenceStepType.DELAY) {
      const delaySeconds = content.delaySeconds || (content.delayMinutes ? content.delayMinutes * 60 : 10);
      logger.info({ executionId, delaySeconds, step: currentStepIndex }, 'Sequence delay step - waiting');

      // Actually wait for the delay
      await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));

      // Update execution to next step
      await prisma.sequenceExecution.update({
        where: { id: executionId },
        data: {
          currentStep: currentStepIndex + 1,
        },
      });

      currentStepIndex++;
      logger.info({ executionId, delaySeconds }, 'Delay complete, continuing sequence');
      continue;
    }

    // Determine message type and content for DB
    let messageType: typeof MessageType[keyof typeof MessageType] = MessageType.TEXT;
    let messageContent: any = {};

    if (content.mediaUrl && content.mediaType) {
      const typeMap: Record<string, typeof MessageType[keyof typeof MessageType]> = {
        image: MessageType.IMAGE,
        video: MessageType.VIDEO,
        audio: MessageType.AUDIO,
        document: MessageType.DOCUMENT,
      };
      messageType = typeMap[content.mediaType] || MessageType.TEXT;
      messageContent = {
        mediaUrl: content.mediaUrl,
        mediaType: content.mediaType,
        mimeType: getMimeType(content.mediaType, content.mediaFilename),
        fileName: content.mediaFilename,
        caption: content.text,
      };
    } else if (content.text) {
      messageContent = { text: content.text };
    } else {
      // Skip empty steps
      currentStepIndex++;
      continue;
    }

    // NOTE: Sequence messages use DIRECT sessionManager path, NOT messageService.sendMessage
    // This is different from inbox sendMessage which uses parallel DB + Redis optimization
    // Path: Worker -> sessionManager.sendTextMessage/sendMediaMessage -> Baileys
    // If optimizing in future, consider aligning with messageService.sendMessage pattern

    // Create message record (PENDING status)
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        channelId,
        direction: MessageDirection.OUTBOUND,
        type: messageType,
        content: messageContent,
        status: MessageStatus.PENDING,
        metadata: { sequenceId: sequence.id, sequenceName: sequence.name, stepIndex: currentStepIndex },
      },
    });

    // Send the message via sessionManager directly (not through Redis command)
    let success = false;
    let errorMessage: string | undefined;
    let externalId: string | undefined;

    try {
      if (step.type === SequenceStepType.TEXT && content.text) {
        const result = await sessionManager.sendTextMessage(channelId, recipient, content.text);
        externalId = result?.key?.id;
        success = true;
      } else if (content.mediaUrl && content.mediaType) {
        const media = {
          type: content.mediaType as 'image' | 'video' | 'audio' | 'document',
          url: content.mediaUrl,
          filename: content.mediaFilename,
          caption: content.text,
          mimetype: getMimeType(content.mediaType, content.mediaFilename),
        };
        const result = await sessionManager.sendMediaMessage(channelId, recipient, media);
        externalId = result?.key?.id;
        success = true;
      } else if (content.text) {
        const result = await sessionManager.sendTextMessage(channelId, recipient, content.text);
        externalId = result?.key?.id;
        success = true;
      }
    } catch (sendError: any) {
      errorMessage = sendError.message || 'Failed to send message';
      logger.error({ executionId, step: currentStepIndex, error: sendError }, 'Sequence step send failed');
    }

    // Update message status
    const updatedMessage = await prisma.message.update({
      where: { id: message.id },
      data: {
        externalId,
        status: success ? MessageStatus.SENT : MessageStatus.FAILED,
        sentAt: success ? new Date() : undefined,
        failedReason: errorMessage,
      },
    });

    // Update conversation lastMessageAt
    if (success) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      });
    }

    // Publish to Redis for WebSocket broadcast
    if (channel) {
      await redisClient.publish(`org:${channel.organizationId}:message`, JSON.stringify({
        message: updatedMessage,
        conversationId: conversation.id,
      }));
    }

    logger.info({
      executionId,
      messageId: message.id,
      externalId,
      success,
      step: currentStepIndex,
      sequenceName: sequence.name,
    }, 'Sequence step sent');

    // Small delay between messages to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 300));

    currentStepIndex++;
  }

  // All steps completed - mark execution as completed
  await prisma.sequenceExecution.update({
    where: { id: executionId },
    data: {
      status: 'completed',
      completedAt: new Date(),
      currentStep: sequence.steps.length,
    },
  });

  logger.info({ executionId, sequenceName: sequence.name }, 'Sequence execution completed');
}

/**
 * Get MIME type from media type and filename
 */
function getMimeType(mediaType: string, filename?: string): string {
  // Try to get from filename extension first
  if (filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      mp4: 'video/mp4',
      webm: 'video/webm',
      mp3: 'audio/mpeg',
      ogg: 'audio/ogg',
      wav: 'audio/wav',
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    if (ext && mimeMap[ext]) {
      return mimeMap[ext];
    }
  }

  // Fallback to type-based defaults
  const defaultMimes: Record<string, string> = {
    image: 'image/jpeg',
    video: 'video/mp4',
    audio: 'audio/mpeg',
    document: 'application/octet-stream',
  };
  return defaultMimes[mediaType] || 'application/octet-stream';
}

/**
 * Process scheduled messages that are due
 * Runs every 10 seconds to check for messages ready to send
 */
async function processScheduledMessages() {
  const { MessageDirection, MessageStatus, MessageType } = await import('@prisma/client');

  try {
    const dueMessages = await scheduledMessageService.getPendingDueMessages();

    if (dueMessages.length === 0) return;

    logger.info({ count: dueMessages.length }, 'Processing scheduled messages');

    for (const scheduled of dueMessages) {
      try {
        const { conversation, content: rawContent } = scheduled;
        const content = rawContent as ScheduledMessageContent;
        const channelId = conversation.channelId;
        const recipient = conversation.contact.identifier;

        // Check if channel is connected
        const session = sessionManager.getAllSessions().get(channelId);
        if (!session || session.status !== 'CONNECTED') {
          logger.warn({ scheduledId: scheduled.id, channelId }, 'Channel not connected, will retry');
          continue;
        }

        // NOTE: Scheduled messages use DIRECT sessionManager path, NOT messageService.sendMessage
        // This is different from inbox sendMessage which uses parallel DB + Redis optimization
        // Path: Worker -> sessionManager.sendTextMessage/sendMediaMessage -> Baileys
        // If optimizing in future, consider aligning with messageService.sendMessage pattern

        // Determine message type
        let messageType: typeof MessageType[keyof typeof MessageType] = MessageType.TEXT;
        let messageContent: any = {};

        if (content.mediaUrl && content.mediaType) {
          const typeMap: Record<string, typeof MessageType[keyof typeof MessageType]> = {
            image: MessageType.IMAGE,
            video: MessageType.VIDEO,
            audio: MessageType.AUDIO,
            document: MessageType.DOCUMENT,
          };
          messageType = typeMap[content.mediaType] || MessageType.TEXT;
          messageContent = {
            mediaUrl: content.mediaUrl,
            mediaType: content.mediaType,
            mimeType: getMimeType(content.mediaType, content.mediaFilename),
            fileName: content.mediaFilename,
            caption: content.text,
          };
        } else if (content.text) {
          messageContent = { text: content.text };
        } else {
          // Skip empty messages
          await scheduledMessageService.markAsFailed(scheduled.id, 'No content to send');
          continue;
        }

        // Create message record (PENDING status)
        const message = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            channelId,
            direction: MessageDirection.OUTBOUND,
            type: messageType,
            content: messageContent,
            status: MessageStatus.PENDING,
            sentByUserId: scheduled.createdById,
            metadata: { scheduledMessageId: scheduled.id },
          },
        });

        // Send the message
        let success = false;
        let errorMessage: string | undefined;
        let externalId: string | undefined;

        try {
          if (content.mediaUrl && content.mediaType) {
            const media = {
              type: content.mediaType as 'image' | 'video' | 'audio' | 'document',
              url: content.mediaUrl,
              filename: content.mediaFilename,
              caption: content.text,
              mimetype: getMimeType(content.mediaType, content.mediaFilename),
            };
            const result = await sessionManager.sendMediaMessage(channelId, recipient, media);
            externalId = result?.key?.id;
            success = true;
          } else if (content.text) {
            const result = await sessionManager.sendTextMessage(channelId, recipient, content.text);
            externalId = result?.key?.id;
            success = true;
          }
        } catch (sendError: any) {
          errorMessage = sendError.message || 'Failed to send message';
          logger.error({ scheduledId: scheduled.id, error: sendError }, 'Scheduled message send failed');
        }

        // Update message status
        await prisma.message.update({
          where: { id: message.id },
          data: {
            externalId,
            status: success ? MessageStatus.SENT : MessageStatus.FAILED,
            sentAt: success ? new Date() : undefined,
            failedReason: errorMessage,
          },
        });

        // Update conversation lastMessageAt
        if (success) {
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { lastMessageAt: new Date() },
          });
        }

        // Update scheduled message status
        if (success) {
          await scheduledMessageService.markAsSent(scheduled.id);
        } else {
          await scheduledMessageService.markAsFailed(scheduled.id, errorMessage || 'Unknown error');
        }

        // Emit to WebSocket for real-time update
        const channel = await prisma.channel.findUnique({
          where: { id: channelId },
          select: { organizationId: true },
        });

        if (channel) {
          const updatedMessage = await prisma.message.findUnique({
            where: { id: message.id },
            include: {
              sentByUser: {
                select: { id: true, firstName: true, lastName: true, avatarUrl: true },
              },
            },
          });

          await redisClient.publish(`org:${channel.organizationId}:message`, JSON.stringify({
            message: updatedMessage,
            conversationId: conversation.id,
          }));
        }

        logger.info({
          scheduledId: scheduled.id,
          messageId: message.id,
          externalId,
          success,
        }, 'Scheduled message processed');

      } catch (msgError) {
        logger.error({ scheduledId: scheduled.id, error: msgError }, 'Error processing scheduled message');
        await scheduledMessageService.markAsFailed(scheduled.id, (msgError as Error).message);
      }
    }
  } catch (error) {
    logger.error({ error }, 'Error in scheduled message processor');
  }
}

/**
 * Process scheduled sequences that are due to START
 * This handles sequences scheduled for future execution (not DELAY steps within sequences)
 * When scheduledAt time arrives, the sequence is started and runs through all its steps
 * (including any DELAY steps which will use setTimeout as usual)
 */
async function processScheduledSequences() {
  try {
    // Get scheduled sequences that are due
    const dueExecutions = await sequenceService.getScheduledExecutionsDue();

    if (dueExecutions.length === 0) return;

    logger.info({ count: dueExecutions.length }, 'Processing scheduled sequences');

    for (const execution of dueExecutions) {
      try {
        const channelId = execution.conversation.channelId;

        // Check if channel is connected
        const session = sessionManager.getAllSessions().get(channelId);
        if (!session || session.status !== 'CONNECTED') {
          logger.warn({ executionId: execution.id, channelId }, 'Channel not connected for scheduled sequence, will retry');
          continue;
        }

        // Mark the execution as running (transitions from 'scheduled' to 'running')
        const started = await sequenceService.startScheduledExecution(execution.id);
        if (!started) {
          logger.warn({ executionId: execution.id }, 'Could not start scheduled sequence');
          continue;
        }

        logger.info({
          executionId: execution.id,
          sequenceName: execution.sequence.name,
          scheduledAt: execution.scheduledAt,
        }, 'Starting scheduled sequence execution');

        // Process the sequence execution (all steps including any DELAY steps)
        await processSequenceExecution(execution.id);

      } catch (execError) {
        logger.error({ executionId: execution.id, error: execError }, 'Error processing scheduled sequence');
        // Mark as failed
        try {
          await prisma.sequenceExecution.update({
            where: { id: execution.id },
            data: {
              status: 'failed',
              errorMessage: (execError as Error).message,
            },
          });
        } catch {
          // Ignore update errors
        }
      }
    }
  } catch (error) {
    logger.error({ error }, 'Error in scheduled sequence processor');
  }
}

main();
