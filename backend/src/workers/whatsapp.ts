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
} from '../shared/utils/identifier';

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

      // Store the mapping for future use
      try {
        const lidPart = originalRemoteJid.split('@')[0];
        const phonePart = remoteJidAlt.split('@')[0];
        await redisClient.hset(`lid:${channelId}`, lidPart, phonePart);
        await redisClient.hset(`pn:${channelId}`, phonePart, lidPart);
        logger.debug({ channelId, lid: lidPart, phone: phonePart }, 'Stored LID-phone mapping from remoteJidAlt');
      } catch (e) {
        logger.warn({ error: e }, 'Failed to store LID mapping');
      }

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

      try {
        const lidPart = waMessage.key.participant.split('@')[0];
        const phonePart = participantAlt.split('@')[0];
        await redisClient.hset(`lid:${channelId}`, lidPart, phonePart);
        await redisClient.hset(`pn:${channelId}`, phonePart, lidPart);
      } catch (e) {
        logger.warn({ error: e }, 'Failed to store participant LID mapping');
      }
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
 */
async function processContactsUpsert(channelId: string, contacts: any[]) {
  const { ChannelType } = await import('@prisma/client');

  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return;

  const orgId = channel.organizationId;
  let processed = 0;
  const contactsNeedingAvatar: { id: string; jid: string }[] = [];

  for (const contact of contacts) {
    try {
      // Extract identifier from JID (e.g., "1234567890@s.whatsapp.net" -> "1234567890")
      const identifier = contact.id ? normalizeIdentifier(contact.id) : null;
      if (!identifier) continue;

      // Skip groups - they don't have profile pictures in the same way
      if (contact.id?.endsWith('@g.us')) continue;

      // Get contact name from various fields
      const displayName = contact.name || contact.notify || contact.verifiedName || contact.pushname || null;

      const upsertedContact = await prisma.contact.upsert({
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
 */
async function processContactsUpdate(channelId: string, contacts: any[]) {
  const { ChannelType } = await import('@prisma/client');

  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return;

  const orgId = channel.organizationId;
  let updated = 0;

  for (const contact of contacts) {
    try {
      const identifier = contact.id ? normalizeIdentifier(contact.id) : null;
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
  // Baileys v7: If contact.id is LID format, contact.phoneNumber contains the actual phone
  for (const contact of data.contacts || []) {
    try {
      let identifier: string | null = null;
      const contactId = contact.id;
      const phoneNumber = contact.phoneNumber;

      if (contactId?.includes('@lid') && phoneNumber) {
        // id is LID, use phoneNumber instead
        identifier = normalizeIdentifier(phoneNumber);

        // Store the LID mapping for future use
        const lidPart = normalizeIdentifier(contactId);
        await redisClient.hset(`lid:${channelId}`, lidPart, identifier);
        await redisClient.hset(`pn:${channelId}`, identifier, lidPart);
      } else if (contactId) {
        identifier = normalizeIdentifier(contactId);
      }

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

  // Process chats and create conversations (including groups)
  for (const chat of data.chats || []) {
    try {
      const remoteJid = chat.id;
      if (!remoteJid) continue;

      const isGroup = remoteJid.endsWith('@g.us');

      // Resolve LID to phone number for non-group chats
      let identifier: string;
      if (!isGroup && remoteJid.includes('@lid')) {
        identifier = normalizeIdentifier(remoteJid);
        // Try to find phone number from Redis
        const phoneNumber = await redisClient.hget(`lid:${channelId}`, identifier);
        if (phoneNumber) {
          identifier = phoneNumber;
        }
      } else {
        identifier = normalizeIdentifier(remoteJid);
      }

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
      const contact = await getOrCreateContact({
        organizationId: orgId,
        channelType: ChannelType.WHATSAPP,
        identifier,
        displayName,
        isGroup,
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

  // Process messages (limit to avoid timeout)
  const messageLimit = 100; // Process max 100 messages per sync to avoid timeout
  let messageCount = 0;

  for (const [jid, msgs] of Object.entries(data.messages || {})) {
    if (!Array.isArray(msgs) || messageCount >= messageLimit) continue;

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
