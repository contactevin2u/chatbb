/**
 * WhatsApp Session Manager
 *
 * Manages multiple WhatsApp connections (one per channel)
 * Handles connection lifecycle, reconnection, and state management
 */

import makeWASocket, {
  DisconnectReason,
  WASocket,
  ConnectionState,
  makeCacheableSignalKeyStore,
  Browsers,
  WAMessageKey,
  WAMessage,
  proto,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { EventEmitter } from 'events';
import pino from 'pino';
import NodeCache from 'node-cache';

import { usePostgresAuthState, hasAuthState } from './session.store';
import { prisma } from '../../../core/database/prisma';
import { redisClient } from '../../../core/cache/redis.client';
import { ChannelStatus } from '@prisma/client';
import {
  acquireLock,
  releaseLock,
  ownsLock,
  getInstanceId,
  releaseAllLocks,
} from '../../../shared/services/distributed-lock.service';

interface SessionInfo {
  socket: WASocket;
  channelId: string;
  organizationId: string;
  status: ChannelStatus;
  qrCode?: string;
  pairingCode?: string;
  qrGenerationCount: number;
  saveCreds: () => Promise<void>;
  deleteState: () => Promise<void>;
}

interface SessionEvents {
  'connection:update': (channelId: string, state: Partial<ConnectionState>) => void;
  'qr:generated': (channelId: string, qr: string) => void;
  'pairing-code:generated': (channelId: string, code: string) => void;
  'message:received': (channelId: string, message: proto.IWebMessageInfo) => void;
  'message:update': (channelId: string, update: { key: WAMessageKey; update: Partial<proto.IWebMessageInfo> }) => void;
  'connected': (channelId: string, phoneNumber: string) => void;
  'disconnected': (channelId: string, reason: string) => void;
  'error': (channelId: string, error: Error) => void;
  // Baileys v7 LID mapping event
  'lid-mapping:update': (channelId: string, mapping: { lid: string; pn: string }) => void;
  // Historical message sync event (macOS Desktop + syncFullHistory: true)
  'history:sync': (channelId: string, data: { chats: any[]; contacts: any[]; messages: any; syncType: any }) => void;
  // On-demand history sync event (user-triggered via fetchMessageHistory)
  'history:on-demand': (channelId: string, data: { messages: any; conversationId?: string; isLatest?: boolean }) => void;
  // Contact events
  'contacts:upsert': (channelId: string, contacts: any[]) => void;
  'contacts:update': (channelId: string, contacts: any[]) => void;
}

// Exponential backoff for reconnection
const RECONNECT_CONFIG = {
  BASE_DELAY_MS: 1000, // Start with 1 second
  MAX_DELAY_MS: 60_000, // Max 60 seconds between retries
  MAX_ATTEMPTS: 10, // After 10 attempts, give up and require manual reconnect
};

// Rate limiting constants (anti-ban)
const RATE_LIMIT = {
  MESSAGES_PER_MINUTE: 90,
  MESSAGES_PER_HOUR: 600,
  NEW_CONTACTS_PER_DAY: 50,
};

// Pending history request tracking
interface PendingHistoryRequest {
  requestId: string;
  channelId: string;
  conversationId: string;
  messageKey: WAMessageKey;
  messageTimestamp: number;
  attempts: number;
  requestedAt: number;
  timeoutId: NodeJS.Timeout;
}

export class SessionManager extends EventEmitter {
  private static readonly MAX_PENDING_HISTORY_REQUESTS = 500;
  private static readonly MAX_HISTORY_FETCH_CACHE = 1000;

  private sessions: Map<string, SessionInfo> = new Map();
  private logger = pino({ level: 'info' });
  private msgRetryCache = new NodeCache({ stdTTL: 60, checkperiod: 30 });
  // Track pending reconnection timers to prevent race conditions
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();
  // Track reconnect attempts for exponential backoff (persists across session recreations)
  private reconnectAttempts: Map<string, number> = new Map();
  // Track pending history fetch requests for retry logic and ON_DEMAND matching
  private pendingHistoryRequests: Map<string, PendingHistoryRequest> = new Map();
  // Rate limit history fetches per conversation (30s cooldown)
  private lastHistoryFetch: Map<string, number> = new Map();

  constructor() {
    super();
  }

  /**
   * Initialize all active channels on startup
   */
  async initializeAllSessions(): Promise<void> {
    this.logger.info('Initializing all WhatsApp sessions...');

    // Find all WhatsApp channels that were previously connected OR have saved credentials
    const channels = await prisma.channel.findMany({
      where: {
        type: 'WHATSAPP',
        // Include CONNECTED, CONNECTING, and DISCONNECTED with credentials
        OR: [
          { status: { in: ['CONNECTED', 'CONNECTING'] } },
          // DISCONNECTED channels that have credentials should auto-reconnect
          { status: 'DISCONNECTED' },
        ],
      },
    });

    this.logger.info({ totalChannels: channels.length }, 'Found WhatsApp channels to check');

    for (const channel of channels) {
      try {
        // For DISCONNECTED channels, check if they have saved auth state
        if (channel.status === 'DISCONNECTED') {
          const hasState = await hasAuthState(channel.id);
          if (!hasState) {
            this.logger.info({ channelId: channel.id }, 'Skipping DISCONNECTED channel - no saved credentials');
            continue;
          }
          this.logger.info({ channelId: channel.id }, 'Auto-reconnecting DISCONNECTED channel with saved credentials');
        }

        await this.createSession(channel.id, channel.organizationId);
      } catch (error) {
        this.logger.error({ channelId: channel.id, error }, 'Failed to initialize session');
      }
    }

    this.logger.info(`Initialized ${this.sessions.size} WhatsApp sessions`);
  }

  /**
   * Get channels that should be connected but aren't
   * Used by the worker for periodic reconnection checks
   */
  async getStaleChannels(): Promise<Array<{ id: string; organizationId: string }>> {
    // Find channels that have auth state but aren't in our sessions map
    const allChannels = await prisma.channel.findMany({
      where: {
        type: 'WHATSAPP',
      },
      select: {
        id: true,
        organizationId: true,
        status: true,
      },
    });

    const staleChannels: Array<{ id: string; organizationId: string }> = [];

    for (const channel of allChannels) {
      // Skip if already in sessions
      if (this.sessions.has(channel.id)) {
        continue;
      }

      // Check if has saved credentials
      const hasState = await hasAuthState(channel.id);
      if (hasState) {
        staleChannels.push({ id: channel.id, organizationId: channel.organizationId });
      }
    }

    return staleChannels;
  }

  /**
   * Reconnect a stale channel
   */
  async reconnectStaleChannel(channelId: string, organizationId: string): Promise<void> {
    // Skip if already in sessions
    if (this.sessions.has(channelId)) {
      this.logger.debug({ channelId }, 'Channel already has active session, skipping');
      return;
    }

    // Check if has saved credentials
    const hasState = await hasAuthState(channelId);
    if (!hasState) {
      this.logger.debug({ channelId }, 'Channel has no saved credentials, skipping');
      return;
    }

    this.logger.info({ channelId }, 'Reconnecting stale channel');

    try {
      await this.createSession(channelId, organizationId);
    } catch (error) {
      this.logger.error({ channelId, error }, 'Failed to reconnect stale channel');
    }
  }

  /**
   * Create a new WhatsApp session for a channel
   */
  async createSession(channelId: string, organizationId: string): Promise<SessionInfo> {
    // CRITICAL: Cancel any pending reconnection timer to prevent race conditions
    // If an old session scheduled a reconnect, we don't want it firing and closing this new session
    const pendingTimer = this.reconnectTimers.get(channelId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.reconnectTimers.delete(channelId);
      this.logger.info({ channelId }, 'Cancelled pending reconnection timer');
    }

    // Check if session already exists
    if (this.sessions.has(channelId)) {
      const existingSession = this.sessions.get(channelId)!;
      this.logger.warn({ channelId }, 'Session already exists, returning existing');
      return existingSession;
    }

    this.logger.info({ channelId, organizationId, instanceId: getInstanceId() }, 'Creating new WhatsApp session');

    // DISTRIBUTED LOCK: Acquire lock before connecting
    // This prevents multiple instances from connecting to the same channel
    // First check if we already own the lock (reconnection case)
    const alreadyOwnsLock = await ownsLock(channelId);
    if (!alreadyOwnsLock) {
      const lockAcquired = await acquireLock(channelId);
      if (!lockAcquired) {
        this.logger.warn({ channelId, instanceId: getInstanceId() }, 'Cannot create session - another instance holds the lock');
        throw new Error('Another instance is already managing this channel');
      }
    } else {
      this.logger.info({ channelId, instanceId: getInstanceId() }, 'Already owns lock (reconnection)');
    }

    // Fetch channel to check if initial sync has been completed
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { hasInitialSync: true, syncProgress: true },
    });
    const needsHistorySync = !channel?.hasInitialSync;
    this.logger.info({
      channelId,
      needsHistorySync,
      hasInitialSync: channel?.hasInitialSync,
      previousProgress: channel?.syncProgress,
    }, 'Sync status checked');

    // Reset sync progress if starting a new sync
    if (needsHistorySync) {
      await prisma.channel.update({
        where: { id: channelId },
        data: {
          syncProgress: 0,
          syncStartedAt: null,
        },
      });
      this.logger.info({ channelId }, 'Reset sync progress for new sync');
    }

    // Update channel status to CONNECTING
    await this.updateChannelStatus(channelId, 'CONNECTING');

    // Load auth state from PostgreSQL
    this.logger.info({ channelId }, 'Loading auth state from PostgreSQL...');
    const { state, saveCreds, deleteState } = await usePostgresAuthState(channelId);
    this.logger.info({ channelId, hasExistingCreds: !!state.creds.me }, 'Auth state loaded');

    // NOTE: Do NOT use fetchLatestBaileysVersion() - it can cause incompatibility issues
    // Let Baileys use its built-in default version

    // Create socket connection
    // Simplified configuration based on official Baileys example
    // See: https://github.com/WhiskeySockets/Baileys/blob/master/Example/example.ts
    const socket = makeWASocket({
      logger: this.logger.child({ channelId }),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, this.logger),
      },
      // Browser identification - macOS Desktop for full history sync
      browser: Browsers.macOS('Desktop'),
      printQRInTerminal: false,

      // === CONNECTION PERSISTENCE OPTIONS ===
      // Keep connection alive with ping-pong (prevents stale connections)
      keepAliveIntervalMs: 30_000, // 30 seconds - ping WhatsApp servers
      // Connection timeouts
      connectTimeoutMs: 60_000, // 60 seconds to establish connection
      defaultQueryTimeoutMs: 60_000, // 60 seconds for queries
      // Retry configuration
      retryRequestDelayMs: 250, // 250ms between retries
      maxMsgRetryCount: 5, // Max retry attempts for failed messages
      // QR code timeout - time to wait before generating next QR
      qrTimeout: 40_000, // 40 seconds per QR code

      // === MESSAGE RELIABILITY OPTIONS ===
      generateHighQualityLinkPreview: true,
      msgRetryCounterCache: this.msgRetryCache,
      // Auto recreate session when message send fails due to session issues
      enableAutoSessionRecreation: true,
      // Cache recent messages in memory for retry handling
      enableRecentMessageCache: true,
      // History sync settings
      // syncFullHistory: Only request full history if we haven't done initial sync
      // shouldSyncHistoryMessage: MUST be true for fetchMessageHistory() on-demand to work
      // We filter by syncType in the event handler instead
      syncFullHistory: needsHistorySync,
      shouldSyncHistoryMessage: () => true,
      // Set to false to receive phone notifications on the device
      markOnlineOnConnect: false,
      // Ignore status broadcasts and other non-essential JIDs to reduce event noise
      shouldIgnoreJid: (jid) => jid?.endsWith('@broadcast') || jid === 'status@broadcast',
      // Cache group metadata to prevent rate limiting (recommended by Baileys)
      cachedGroupMetadata: async (jid) => {
        const cached = await redisClient.get(`group:${jid}:metadata`);
        if (cached) {
          return JSON.parse(cached);
        }
        return undefined;
      },
      // Required: getMessage for retry and poll decryption
      getMessage: async (key) => {
        if (!key.id) return undefined;
        const message = await prisma.message.findUnique({
          where: {
            channelId_externalId: { channelId, externalId: key.id },
          },
          select: { content: true },
        });
        if (message?.content) {
          return (message.content as any).message;
        }
        return undefined;
      },
    });

    const session: SessionInfo = {
      socket,
      channelId,
      organizationId,
      status: 'CONNECTING',
      qrGenerationCount: 0,
      saveCreds,
      deleteState,
    };

    this.sessions.set(channelId, session);

    // Set up event handlers
    this.setupEventHandlers(socket, session);

    return session;
  }

  /**
   * Set up event handlers for a socket
   */
  private setupEventHandlers(socket: WASocket, session: SessionInfo): void {
    const { channelId } = session;

    // Connection state updates
    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      this.emit('connection:update', channelId, update);

      // Handle QR code
      if (qr) {
        session.qrGenerationCount++;

        // Timeout after 5 QR regenerations (user didn't scan)
        if (session.qrGenerationCount > 5) {
          this.logger.warn({ channelId, qrCount: session.qrGenerationCount }, 'QR timeout - too many regenerations');
          try {
            session.socket.end(undefined);
          } catch (e) {
            // Ignore close errors
          }
          this.sessions.delete(channelId);
          await this.updateChannelStatus(channelId, 'DISCONNECTED');
          this.emit('disconnected', channelId, 'QR code expired - please try again');
          return;
        }

        session.qrCode = qr;
        session.status = 'CONNECTING';
        await this.updateChannelStatus(channelId, 'CONNECTING');
        this.emit('qr:generated', channelId, qr);
        this.logger.info({ channelId, qrCount: session.qrGenerationCount }, 'QR code generated');
      }

      // Handle connection state
      if (connection === 'open') {
        session.status = 'CONNECTED';
        session.qrCode = undefined;
        session.pairingCode = undefined;

        const phoneNumber = socket.user?.id?.split(':')[0] || 'unknown';
        await this.updateChannelStatus(channelId, 'CONNECTED', phoneNumber);

        // Reset reconnect attempts on successful connection
        this.reconnectAttempts.delete(channelId);

        this.emit('connected', channelId, phoneNumber);
        this.logger.info({ channelId, phoneNumber }, 'WhatsApp connected');

        // Fetch all group metadata in background after connection
        this.fetchAllGroupsMetadata(channelId, socket).catch((err) => {
          this.logger.warn({ channelId, error: err }, 'Failed to fetch all groups metadata');
        });
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const reason = statusCode ? String(DisconnectReason[statusCode] || 'Unknown') : 'Unknown';

        this.logger.warn({ channelId, statusCode, reason, instanceId: getInstanceId() }, 'WhatsApp disconnected');

        session.status = 'DISCONNECTED';

        // Official Baileys pattern: only loggedOut prevents reconnection
        // See: https://github.com/WhiskeySockets/Baileys/blob/master/Example/example.ts
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const isConnectionReplaced = statusCode === DisconnectReason.connectionReplaced;

        if (isLoggedOut) {
          // User logged out - clear credentials and stop
          this.logger.info({ channelId, statusCode, reason }, 'Logged out, clearing credentials');
          await releaseLock(channelId); // Release distributed lock
          await session.deleteState();
          await this.updateChannelStatus(channelId, 'DISCONNECTED');
          this.sessions.delete(channelId);
          this.reconnectAttempts.delete(channelId);
          this.emit('disconnected', channelId, reason);
          return;
        }

        // CONNECTION REPLACED: Another instance connected to this channel
        // Per Baileys docs: DO NOT reconnect - another instance has taken over
        if (isConnectionReplaced) {
          this.logger.warn({
            channelId,
            instanceId: getInstanceId(),
            statusCode,
          }, 'Connection replaced by another instance - NOT reconnecting');

          // Release lock (another instance should have it now)
          await releaseLock(channelId);
          this.sessions.delete(channelId);
          this.reconnectAttempts.delete(channelId);
          // Don't update channel status - let the other instance manage it
          this.emit('disconnected', channelId, 'connectionReplaced');
          return;
        }

        // Before attempting reconnection, verify we still own the lock
        const stillOwnsLock = await ownsLock(channelId);
        if (!stillOwnsLock) {
          this.logger.warn({
            channelId,
            instanceId: getInstanceId(),
          }, 'Lost distributed lock - another instance may have taken over, NOT reconnecting');
          this.sessions.delete(channelId);
          this.reconnectAttempts.delete(channelId);
          this.emit('disconnected', channelId, 'Lost lock');
          return;
        }

        // All other disconnects: reconnect with exponential backoff
        const attempts = this.reconnectAttempts.get(channelId) || 0;

        if (attempts >= RECONNECT_CONFIG.MAX_ATTEMPTS) {
          this.logger.error({ channelId, attempts }, 'Max reconnection attempts reached, giving up');
          await releaseLock(channelId); // Release distributed lock
          await this.updateChannelStatus(channelId, 'ERROR');
          this.sessions.delete(channelId);
          this.reconnectAttempts.delete(channelId);
          this.emit('disconnected', channelId, 'Max reconnection attempts reached');
          return;
        }

        // Calculate delay with exponential backoff: 1s, 2s, 4s, 8s... up to MAX_DELAY
        const delay = Math.min(
          RECONNECT_CONFIG.BASE_DELAY_MS * Math.pow(2, attempts),
          RECONNECT_CONFIG.MAX_DELAY_MS
        );

        this.reconnectAttempts.set(channelId, attempts + 1);
        this.logger.info({ channelId, attempt: attempts + 1, delayMs: delay }, 'Scheduling reconnection');

        // Remove old session (but keep the lock for reconnection)
        this.sessions.delete(channelId);

        const timer = setTimeout(async () => {
          this.reconnectTimers.delete(channelId);

          // Check lock ownership again before reconnecting
          const canReconnect = await ownsLock(channelId);
          if (!canReconnect) {
            this.logger.warn({ channelId }, 'Lost lock during reconnection delay, aborting');
            return;
          }

          try {
            await this.createSession(channelId, session.organizationId);
          } catch (error) {
            this.logger.error({ channelId, error }, 'Reconnection failed');
            // Don't set ERROR status - let the next attempt try
          }
        }, delay);

        this.reconnectTimers.set(channelId, timer);
      }
    });

    // Credential updates
    socket.ev.on('creds.update', async () => {
      await session.saveCreds();
      this.logger.debug({ channelId }, 'Credentials updated and saved');
    });


    // Incoming messages (both from contacts and sent from own phone)
    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      // 'notify' = real-time messages from contacts
      // 'append' = messages sent from your phone (need to sync to inbox)
      if (type !== 'notify' && type !== 'append') return;

      for (const msg of messages) {
        if (!msg.message) continue;

        // Skip status broadcasts
        if (msg.key.remoteJid === 'status@broadcast') continue;

        this.emit('message:received', channelId, msg);
        this.logger.debug({ channelId, messageId: msg.key.id, fromMe: msg.key.fromMe, type }, 'Message received');
      }
    });

    // Message status updates
    socket.ev.on('messages.update', async (updates) => {
      for (const update of updates) {
        this.emit('message:update', channelId, update);
      }
    });

    // Baileys v7 LID mapping updates - IMPORTANT: Never downgrade Baileys
    // Store LID mappings in Redis for later lookups
    socket.ev.on('lid-mapping.update', async (mapping) => {
      for (const [lid, pn] of Object.entries(mapping)) {
        try {
          // Store bidirectional mapping in Redis with 7-day TTL
          const lidKey = `lid:${channelId}`;
          const pnKey = `pn:${channelId}`;
          await redisClient.hset(lidKey, lid, pn as string);
          await redisClient.expire(lidKey, 604800);
          await redisClient.hset(pnKey, pn as string, lid);
          await redisClient.expire(pnKey, 604800);
        } catch (e) {
          this.logger.debug({ channelId, lid, pn, error: e }, 'Failed to store LID mapping');
        }

        this.emit('lid-mapping:update', channelId, { lid, pn: pn as string });
        this.logger.debug({ channelId, lid, pn }, 'LID mapping stored');
      }
    });

    // Historical message sync (requires macOS Desktop browser + syncFullHistory: true)
    // Note: messages is a WAMessage[] flat array, NOT object keyed by JID
    // Sync comes in chunks with progress (0-100%) - only mark complete when isLatest=true
    // syncType values: INITIAL_BOOTSTRAP=0, INITIAL_STATUS_V3=1, FULL=2, RECENT=3, PUSH_NAME=4, ON_DEMAND=5
    socket.ev.on('messaging-history.set', async ({ chats, contacts, messages, syncType, isLatest, progress }) => {
      const currentProgress = typeof progress === 'number' ? progress : 0;

      this.logger.info(
        {
          channelId,
          chatsCount: chats.length,
          contactsCount: contacts.length,
          messagesCount: Array.isArray(messages) ? messages.length : 0,
          syncType,
          isLatest,
          progress: currentProgress,
        },
        'Historical sync chunk received'
      );

      // Skip FULL sync type (2) - problematic for very long history
      // FULL sync can send millions of messages and never complete
      if (syncType === proto.HistorySync.HistorySyncType.FULL) {
        this.logger.info({ channelId, syncType, progress: currentProgress }, 'Skipping FULL history sync (too large)');
        return;
      }

      // Handle ON_DEMAND sync separately - this is user-requested via fetchMessageHistory()
      if (syncType === proto.HistorySync.HistorySyncType.ON_DEMAND) {
        // Check if we have a pending request for this
        const pendingRequest = this.findPendingHistoryRequest(channelId, messages);
        const conversationId = pendingRequest?.conversationId;

        this.logger.info(
          { channelId, conversationId, messagesCount: Array.isArray(messages) ? messages.length : 0, isLatest },
          'ON_DEMAND history sync received'
        );

        // Emit separate event for on-demand processing (immediate, not queued)
        // Include isLatest so worker can continue fetching if more history available
        this.emit('history:on-demand', channelId, { messages, conversationId, isLatest });

        // Clear pending request
        if (pendingRequest) {
          clearTimeout(pendingRequest.timeoutId);
          this.pendingHistoryRequests.delete(pendingRequest.requestId);
        }
        return;
      }

      // Process INITIAL_BOOTSTRAP, RECENT, PUSH_NAME sync types
      // Update sync progress in database (track each chunk)
      try {
        const updateData: any = {
          syncProgress: currentProgress,
          lastSyncAt: new Date(),
        };

        // Set syncStartedAt on first chunk (progress near 0 or no previous sync)
        if (currentProgress < 10) {
          updateData.syncStartedAt = new Date();
        }

        await prisma.channel.update({
          where: { id: channelId },
          data: updateData,
        });
      } catch (error) {
        this.logger.warn({ channelId, error }, 'Failed to update sync progress');
      }

      // Emit event for processing by the application
      this.emit('history:sync', channelId, { chats, contacts, messages, syncType });

      // Cache group IDs for later metadata fetching
      for (const chat of chats) {
        if (chat.id?.endsWith('@g.us')) {
          // Store group chat info for caching
          const chatData = chat as any;
          if (chatData.groupMetadata) {
            await redisClient.setex(
              `group:${chat.id}:metadata`,
              3600, // 1 hour cache
              JSON.stringify(chatData.groupMetadata)
            );
          }
        }
      }

      // IMPORTANT: Only mark sync complete when isLatest=true (final chunk)
      // History sync comes in multiple chunks with increasing progress
      // We must wait for the final chunk before marking sync as complete
      if (isLatest) {
        try {
          await prisma.channel.update({
            where: { id: channelId },
            data: {
              hasInitialSync: true,
              syncProgress: 100,
            },
          });
          this.logger.info({ channelId, syncType, progress: currentProgress }, 'Historical sync COMPLETED, hasInitialSync flag set');
        } catch (error) {
          this.logger.warn({ channelId, error }, 'Failed to update hasInitialSync flag');
        }
      } else {
        this.logger.debug({ channelId, progress: currentProgress, isLatest }, 'Sync chunk received, waiting for more chunks...');
      }
    });

    // Group metadata updates - cache for performance and sync to database
    socket.ev.on('groups.update', async (updates) => {
      for (const update of updates) {
        if (update.id) {
          // Update Redis cache
          const existing = await redisClient.get(`group:${update.id}:metadata`);
          if (existing) {
            const metadata = JSON.parse(existing);
            const updated = { ...metadata, ...update };
            await redisClient.setex(`group:${update.id}:metadata`, 3600, JSON.stringify(updated));
          } else if (update.subject) {
            // Cache the new metadata if it has a subject
            await redisClient.setex(`group:${update.id}:metadata`, 3600, JSON.stringify(update));
          }

          // Update Contact record in database if subject (group name) changed
          if (update.subject) {
            try {
              const { ChannelType } = await import('@prisma/client');
              const groupIdentifier = update.id!.split('@')[0]; // Remove @g.us

              // Get the channel to find the organization
              const channel = await prisma.channel.findUnique({
                where: { id: channelId },
                select: { organizationId: true },
              });

              if (channel) {
                // Update the contact's displayName
                await prisma.contact.updateMany({
                  where: {
                    organizationId: channel.organizationId,
                    channelType: ChannelType.WHATSAPP,
                    identifier: groupIdentifier,
                  },
                  data: {
                    displayName: update.subject,
                  },
                });
                this.logger.info({ channelId, groupId: update.id, newName: update.subject }, 'Group name updated in database');
              }
            } catch (error) {
              this.logger.warn({ channelId, groupId: update.id, error }, 'Failed to update group name in database');
            }
          }
        }
      }
    });

    // Group participants update - refresh full metadata when members change
    socket.ev.on('group-participants.update', async ({ id, participants, action }) => {
      this.logger.info({ channelId, groupId: id, action, count: participants.length }, 'Group participants updated');

      try {
        // Fetch fresh metadata from WhatsApp
        const metadata = await socket.groupMetadata(id);
        if (metadata) {
          // Update Redis cache with fresh data
          await redisClient.setex(`group:${id}:metadata`, 3600, JSON.stringify(metadata));
          this.logger.debug({ channelId, groupId: id }, 'Group metadata refreshed after participant change');
        }
      } catch (error) {
        this.logger.warn({ channelId, groupId: id, error }, 'Failed to refresh group metadata after participant change');
      }
    });

    // Groups upsert - when groups are first discovered (usually during sync)
    socket.ev.on('groups.upsert', async (groups) => {
      this.logger.info({ channelId, count: groups.length }, 'Groups upsert received');

      for (const group of groups) {
        try {
          // Cache group metadata
          await redisClient.setex(`group:${group.id}:metadata`, 3600, JSON.stringify(group));

          // Update Contact record in database
          if (group.subject) {
            const { ChannelType } = await import('@prisma/client');
            const channel = await prisma.channel.findUnique({
              where: { id: channelId },
              select: { organizationId: true },
            });

            if (channel) {
              const groupIdentifier = group.id.split('@')[0];
              await prisma.contact.updateMany({
                where: {
                  organizationId: channel.organizationId,
                  channelType: ChannelType.WHATSAPP,
                  identifier: groupIdentifier,
                },
                data: { displayName: group.subject },
              });
              this.logger.debug({ channelId, groupId: group.id, subject: group.subject }, 'Group contact name updated from upsert');
            }
          }
        } catch (error) {
          this.logger.warn({ channelId, groupId: group.id, error }, 'Failed to process group upsert');
        }
      }
    });

    // Contact upsert - when contacts are synced from WhatsApp
    socket.ev.on('contacts.upsert', async (contacts) => {
      if (contacts.length > 0) {
        this.logger.info({ channelId, count: contacts.length }, 'Contacts upsert received');
        this.emit('contacts:upsert', channelId, contacts);
      }
    });

    // Contact update - when contact info changes (name, profile pic, etc.)
    socket.ev.on('contacts.update', async (contacts) => {
      if (contacts.length > 0) {
        this.logger.debug({ channelId, count: contacts.length }, 'Contacts update received');
        this.emit('contacts:update', channelId, contacts);
      }
    });
  }

  /**
   * Request pairing code instead of QR
   */
  async requestPairingCode(channelId: string, phoneNumber: string): Promise<string> {
    const session = this.sessions.get(channelId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.socket.authState.creds.registered) {
      throw new Error('Already registered');
    }

    // Format phone number (remove + and spaces)
    const formattedNumber = phoneNumber.replace(/[\s\+\-]/g, '');

    const code = await session.socket.requestPairingCode(formattedNumber);
    session.pairingCode = code;

    this.emit('pairing-code:generated', channelId, code);
    this.logger.info({ channelId, phoneNumber: formattedNumber }, 'Pairing code generated');

    return code;
  }

  /**
   * Send a text message
   * @param quotedMessage - Optional message to reply to (pass the full WAMessage object)
   */
  async sendTextMessage(
    channelId: string,
    to: string,
    text: string,
    quotedMessage?: WAMessage
  ): Promise<WAMessage | undefined> {
    const session = this.sessions.get(channelId);
    if (!session || session.status !== 'CONNECTED') {
      throw new Error('Channel not connected');
    }

    // Check rate limits
    await this.checkRateLimit(channelId);

    // Format recipient JID
    const jid = this.formatJid(to);

    // Check incognito mode - skip presence updates if enabled
    const isIncognito = await this.isIncognitoMode(channelId);

    // Show typing indicator before sending (skip in incognito mode)
    if (!isIncognito) {
      try {
        await session.socket.sendPresenceUpdate('composing', jid);
      } catch (e) {
        // Ignore presence errors - not critical
      }
    }

    const options = quotedMessage ? { quoted: quotedMessage } : undefined;
    const result = await session.socket.sendMessage(jid, { text }, options);

    // Clear typing indicator (skip in incognito mode)
    if (!isIncognito) {
      try {
        await session.socket.sendPresenceUpdate('paused', jid);
      } catch (e) {
        // Ignore presence errors
      }
    }

    this.logger.info({ channelId, to: jid, messageId: result?.key?.id, isReply: !!quotedMessage }, 'Message sent');

    return result;
  }

  /**
   * Send a media message
   * @param quotedMessage - Optional message to reply to
   */
  async sendMediaMessage(
    channelId: string,
    to: string,
    media: {
      type: 'image' | 'video' | 'audio' | 'document';
      url?: string;
      buffer?: Buffer;
      mimetype?: string;
      filename?: string;
      caption?: string;
    },
    quotedMessage?: WAMessage
  ): Promise<WAMessage | undefined> {
    const session = this.sessions.get(channelId);
    if (!session || session.status !== 'CONNECTED') {
      throw new Error('Channel not connected');
    }

    await this.checkRateLimit(channelId);

    const jid = this.formatJid(to);

    // Check incognito mode - skip presence updates if enabled
    const isIncognito = await this.isIncognitoMode(channelId);

    // Show typing/recording indicator before sending (skip in incognito mode)
    if (!isIncognito) {
      try {
        // Use 'recording' for audio, 'composing' for others
        const presenceType = media.type === 'audio' ? 'recording' : 'composing';
        await session.socket.sendPresenceUpdate(presenceType, jid);
      } catch (e) {
        // Ignore presence errors - not critical
      }
    }

    let content: any;

    switch (media.type) {
      case 'image':
        content = {
          image: media.url ? { url: media.url } : media.buffer,
          caption: media.caption,
          mimetype: media.mimetype,
        };
        break;
      case 'video':
        content = {
          video: media.url ? { url: media.url } : media.buffer,
          caption: media.caption,
          mimetype: media.mimetype,
        };
        break;
      case 'audio':
        content = {
          audio: media.url ? { url: media.url } : media.buffer,
          mimetype: media.mimetype || 'audio/mp4',
          ptt: true, // Voice note
        };
        break;
      case 'document':
        content = {
          document: media.url ? { url: media.url } : media.buffer,
          mimetype: media.mimetype || 'application/octet-stream',
          fileName: media.filename,
          caption: media.caption,
        };
        break;
    }

    const options = quotedMessage ? { quoted: quotedMessage } : undefined;
    const result = await session.socket.sendMessage(jid, content, options);

    // Clear presence indicator (skip in incognito mode)
    if (!isIncognito) {
      try {
        await session.socket.sendPresenceUpdate('paused', jid);
      } catch (e) {
        // Ignore presence errors
      }
    }

    this.logger.info({ channelId, to: jid, type: media.type, messageId: result?.key?.id, isReply: !!quotedMessage }, 'Media sent');

    return result;
  }

  /**
   * Mark messages as read
   * Skipped in incognito mode to prevent sending read receipts
   */
  async markAsRead(channelId: string, keys: WAMessageKey[]): Promise<void> {
    // Skip if incognito mode is enabled
    if (await this.isIncognitoMode(channelId)) {
      this.logger.debug({ channelId, count: keys.length }, 'Skipping read receipts (incognito mode)');
      return;
    }

    const session = this.sessions.get(channelId);
    if (!session || session.status !== 'CONNECTED') {
      throw new Error('Channel not connected');
    }

    await session.socket.readMessages(keys);
    this.logger.debug({ channelId, count: keys.length }, 'Messages marked as read');
  }

  /**
   * Send a sticker message
   */
  async sendStickerMessage(
    channelId: string,
    to: string,
    sticker: {
      url?: string;
      buffer?: Buffer;
    }
  ): Promise<WAMessage | undefined> {
    const session = this.sessions.get(channelId);
    if (!session || session.status !== 'CONNECTED') {
      throw new Error('Channel not connected');
    }

    await this.checkRateLimit(channelId);
    const jid = this.formatJid(to);

    const content = {
      sticker: sticker.url ? { url: sticker.url } : sticker.buffer,
    };

    const result = await session.socket.sendMessage(jid, content);
    this.logger.info({ channelId, to: jid, messageId: result?.key?.id }, 'Sticker sent');

    return result;
  }

  /**
   * Send a GIF/video as GIF
   */
  async sendGifMessage(
    channelId: string,
    to: string,
    gif: {
      url?: string;
      buffer?: Buffer;
      caption?: string;
    }
  ): Promise<WAMessage | undefined> {
    const session = this.sessions.get(channelId);
    if (!session || session.status !== 'CONNECTED') {
      throw new Error('Channel not connected');
    }

    await this.checkRateLimit(channelId);
    const jid = this.formatJid(to);

    const content = {
      video: gif.url ? { url: gif.url } : gif.buffer,
      gifPlayback: true, // This makes it play as a GIF
      caption: gif.caption,
    };

    const result = await session.socket.sendMessage(jid, content);
    this.logger.info({ channelId, to: jid, messageId: result?.key?.id }, 'GIF sent');

    return result;
  }

  /**
   * Send a reaction to a message
   */
  async sendReaction(
    channelId: string,
    messageKey: WAMessageKey,
    emoji: string
  ): Promise<WAMessage | undefined> {
    const session = this.sessions.get(channelId);
    if (!session || session.status !== 'CONNECTED') {
      throw new Error('Channel not connected');
    }

    const result = await session.socket.sendMessage(messageKey.remoteJid!, {
      react: {
        text: emoji, // Use empty string '' to remove reaction
        key: messageKey,
      },
    });

    this.logger.info({ channelId, messageId: messageKey.id, emoji }, 'Reaction sent');
    return result;
  }

  /**
   * Get profile picture URL for a contact
   */
  async getProfilePicture(channelId: string, jid: string): Promise<string | null> {
    const session = this.sessions.get(channelId);
    if (!session || session.status !== 'CONNECTED') {
      throw new Error('Channel not connected');
    }

    try {
      const formattedJid = this.formatJid(jid);
      const ppUrl = await session.socket.profilePictureUrl(formattedJid, 'image');
      return ppUrl;
    } catch (error) {
      // Profile picture not available or private
      this.logger.debug({ channelId, jid, error }, 'Could not get profile picture');
      return null;
    }
  }

  /**
   * Get group metadata (name, participants, etc.)
   * Checks Redis cache first, then fetches from WhatsApp if not cached
   */
  async getGroupMetadata(channelId: string, groupJid: string): Promise<{ subject: string; participants?: any[] } | null> {
    // First check Redis cache
    const cached = await redisClient.get(`group:${groupJid}:metadata`);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // Invalid cache, continue to fetch
      }
    }

    const session = this.sessions.get(channelId);
    if (!session || session.status !== 'CONNECTED') {
      return null;
    }

    try {
      const metadata = await session.socket.groupMetadata(groupJid);
      if (metadata) {
        // Cache the metadata
        await redisClient.setex(`group:${groupJid}:metadata`, 3600, JSON.stringify(metadata));
        return metadata;
      }
    } catch (error) {
      this.logger.debug({ channelId, groupJid, error }, 'Could not get group metadata');
    }

    return null;
  }

  /**
   * Fetch all groups metadata using groupFetchAllParticipating
   * This is called after connection to populate cache and update contacts
   */
  private async fetchAllGroupsMetadata(channelId: string, socket: any): Promise<void> {
    try {
      this.logger.info({ channelId }, 'Fetching all groups metadata...');

      // groupFetchAllParticipating returns all groups with full metadata
      const groups = await socket.groupFetchAllParticipating();

      if (!groups || Object.keys(groups).length === 0) {
        this.logger.debug({ channelId }, 'No groups found');
        return;
      }

      const groupCount = Object.keys(groups).length;
      this.logger.info({ channelId, groupCount }, 'Fetched all groups');

      // Get channel info for organization ID
      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { organizationId: true },
      });

      if (!channel) return;

      const { ChannelType } = await import('@prisma/client');
      let updatedCount = 0;

      // Process each group
      for (const [groupJid, metadata] of Object.entries(groups)) {
        try {
          const groupMetadata = metadata as any;

          // Cache in Redis
          await redisClient.setex(`group:${groupJid}:metadata`, 3600, JSON.stringify(groupMetadata));

          // Update Contact in database if subject exists
          if (groupMetadata.subject) {
            const groupIdentifier = groupJid.split('@')[0];
            const result = await prisma.contact.updateMany({
              where: {
                organizationId: channel.organizationId,
                channelType: ChannelType.WHATSAPP,
                identifier: groupIdentifier,
                // Only update if name is missing or is fallback
                OR: [
                  { displayName: null },
                  { displayName: 'Group Chat' },
                ],
              },
              data: { displayName: groupMetadata.subject },
            });

            if (result.count > 0) updatedCount++;
          }
        } catch (error) {
          // Skip individual group errors
        }
      }

      this.logger.info({ channelId, groupCount, updatedCount }, 'Groups metadata synced');
    } catch (error) {
      this.logger.warn({ channelId, error }, 'Failed to fetch all groups metadata');
    }
  }

  /**
   * Send a voice note (PTT - Push To Talk)
   */
  async sendVoiceNote(
    channelId: string,
    to: string,
    audio: {
      url?: string;
      buffer?: Buffer;
    }
  ): Promise<WAMessage | undefined> {
    const session = this.sessions.get(channelId);
    if (!session || session.status !== 'CONNECTED') {
      throw new Error('Channel not connected');
    }

    await this.checkRateLimit(channelId);
    const jid = this.formatJid(to);

    const content = {
      audio: audio.url ? { url: audio.url } : audio.buffer,
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true, // Push-to-talk = voice note
    };

    const result = await session.socket.sendMessage(jid, content);
    this.logger.info({ channelId, to: jid, messageId: result?.key?.id }, 'Voice note sent');

    return result;
  }

  /**
   * Send a poll message
   */
  async sendPoll(
    channelId: string,
    to: string,
    poll: {
      name: string; // Poll question
      options: string[]; // Poll options (2-12 options)
      selectableCount?: number; // Number of options user can select (default: 1)
    }
  ): Promise<WAMessage | undefined> {
    const session = this.sessions.get(channelId);
    if (!session || session.status !== 'CONNECTED') {
      throw new Error('Channel not connected');
    }

    if (!poll.options || poll.options.length < 2) {
      throw new Error('Poll must have at least 2 options');
    }
    if (poll.options.length > 12) {
      throw new Error('Poll cannot have more than 12 options');
    }

    await this.checkRateLimit(channelId);
    const jid = this.formatJid(to);

    const result = await session.socket.sendMessage(jid, {
      poll: {
        name: poll.name,
        values: poll.options,
        selectableCount: poll.selectableCount || 1,
      },
    });

    this.logger.info({ channelId, to: jid, messageId: result?.key?.id, pollName: poll.name }, 'Poll sent');
    return result;
  }

  /**
   * Forward a message to another chat
   * Uses Baileys' forward feature which preserves the original message metadata
   */
  async forwardMessage(
    channelId: string,
    originalMessage: WAMessage,
    to: string
  ): Promise<WAMessage | undefined> {
    const session = this.sessions.get(channelId);
    if (!session || session.status !== 'CONNECTED') {
      throw new Error('Channel not connected');
    }

    await this.checkRateLimit(channelId);

    const jid = this.formatJid(to);

    const result = await session.socket.sendMessage(jid, {
      forward: originalMessage,
    });

    this.logger.info({ channelId, to: jid, originalMessageId: originalMessage.key?.id, newMessageId: result?.key?.id }, 'Message forwarded');

    return result;
  }

  /**
   * Edit a previously sent message
   */
  async editMessage(
    channelId: string,
    messageKey: WAMessageKey,
    newText: string
  ): Promise<WAMessage | undefined> {
    const session = this.sessions.get(channelId);
    if (!session || session.status !== 'CONNECTED') {
      throw new Error('Channel not connected');
    }

    if (!messageKey.remoteJid) {
      throw new Error('Message key must have remoteJid');
    }

    const result = await session.socket.sendMessage(messageKey.remoteJid, {
      text: newText,
      edit: messageKey,
    });

    this.logger.info({ channelId, messageId: messageKey.id, newText: newText.substring(0, 50) }, 'Message edited');
    return result;
  }

  /**
   * Delete a message
   */
  async deleteMessage(
    channelId: string,
    messageKey: WAMessageKey
  ): Promise<WAMessage | undefined> {
    const session = this.sessions.get(channelId);
    if (!session || session.status !== 'CONNECTED') {
      throw new Error('Channel not connected');
    }

    if (!messageKey.remoteJid) {
      throw new Error('Message key must have remoteJid');
    }

    const result = await session.socket.sendMessage(messageKey.remoteJid, {
      delete: messageKey,
    });

    this.logger.info({ channelId, messageId: messageKey.id }, 'Message deleted');
    return result;
  }

  /**
   * Download media from a message (returns reupload function for session)
   */
  getMediaDownloader(channelId: string): ((msg: WAMessage) => Promise<WAMessage>) | undefined {
    const session = this.sessions.get(channelId);
    if (!session || session.status !== 'CONNECTED') {
      return undefined;
    }

    // Return the reupload function that can be used with downloadMediaMessage
    return async (msg: WAMessage) => {
      const result = await session.socket.updateMediaMessage(msg);
      return result;
    };
  }

  /**
   * Get session status
   */
  getSession(channelId: string): SessionInfo | undefined {
    return this.sessions.get(channelId);
  }

  /**
   * Get all sessions
   */
  getAllSessions(): Map<string, SessionInfo> {
    return this.sessions;
  }

  /**
   * Remove session from manager (without logout - preserves credentials)
   * Used for reconnection flow
   */
  removeSession(channelId: string): void {
    // Cancel any pending reconnection timer
    const pendingTimer = this.reconnectTimers.get(channelId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.reconnectTimers.delete(channelId);
    }
    this.sessions.delete(channelId);
    this.logger.info({ channelId }, 'Session removed from manager');
  }

  /**
   * Disconnect a session (preserves credentials for reconnection)
   *
   * IMPORTANT: This uses socket.end() NOT socket.logout()
   * - socket.end() = Close connection, KEEP credentials (can reconnect without QR)
   * - socket.logout() = Close connection, INVALIDATE session (needs new QR)
   *
   * Use logoutSession() if you want to fully logout and require new QR scan.
   */
  async disconnectSession(channelId: string): Promise<void> {
    const session = this.sessions.get(channelId);
    if (!session) {
      return;
    }

    this.logger.info({ channelId }, 'Disconnecting session (preserving credentials)');

    // Cancel any pending reconnection timer
    const pendingTimer = this.reconnectTimers.get(channelId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.reconnectTimers.delete(channelId);
    }

    // Clean up pending history requests for this channel
    this.cleanupPendingHistoryRequests(channelId);

    try {
      // CRITICAL: Remove all event listeners to prevent memory leaks
      // Each listener holds closures with channelId, session context
      // Baileys ev requires event names, so we remove all known event types
      const eventsToRemove = [
        'connection.update', 'creds.update', 'messages.upsert', 'messages.update',
        'lid-mapping.update', 'messaging-history.set', 'groups.update',
        'group-participants.update', 'groups.upsert', 'contacts.upsert', 'contacts.update'
      ] as const;
      for (const event of eventsToRemove) {
        session.socket.ev.removeAllListeners(event);
      }

      // Use end() to close connection WITHOUT invalidating the session
      // This preserves auth state so user can reconnect without QR
      session.socket.end(undefined);
    } catch (error) {
      this.logger.warn({ channelId, error }, 'Error during disconnect');
    }

    // DON'T call deleteState() - preserve credentials for reconnection!
    this.sessions.delete(channelId);
    await this.updateChannelStatus(channelId, 'DISCONNECTED');
  }

  /**
   * Logout and clear session (requires new QR scan)
   *
   * This fully logs out from WhatsApp and deletes all stored credentials.
   * Use disconnectSession() if you just want to temporarily disconnect.
   */
  async logoutSession(channelId: string): Promise<void> {
    const session = this.sessions.get(channelId);
    if (!session) {
      return;
    }

    this.logger.info({ channelId }, 'Logging out session (clearing credentials)');

    // Cancel any pending reconnection timer
    const pendingTimer = this.reconnectTimers.get(channelId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.reconnectTimers.delete(channelId);
    }

    // Clean up pending history requests for this channel
    this.cleanupPendingHistoryRequests(channelId);

    try {
      // CRITICAL: Remove all event listeners to prevent memory leaks
      const eventsToRemove = [
        'connection.update', 'creds.update', 'messages.upsert', 'messages.update',
        'lid-mapping.update', 'messaging-history.set', 'groups.update',
        'group-participants.update', 'groups.upsert', 'contacts.upsert', 'contacts.update'
      ] as const;
      for (const event of eventsToRemove) {
        session.socket.ev.removeAllListeners(event);
      }

      // logout() invalidates the session with WhatsApp servers
      await session.socket.logout();
    } catch (error) {
      this.logger.warn({ channelId, error }, 'Error during logout');
    }

    // Delete auth state from database
    await session.deleteState();
    this.sessions.delete(channelId);
    await this.updateChannelStatus(channelId, 'DISCONNECTED');

    // Release distributed lock
    await releaseLock(channelId);
  }

  /**
   * Graceful shutdown - release all locks
   * Call this before process exit
   */
  async shutdown(): Promise<void> {
    this.logger.info({ instanceId: getInstanceId() }, 'Shutting down session manager, releasing all locks');

    // Cancel all pending reconnection timers
    for (const [channelId, timer] of this.reconnectTimers) {
      clearTimeout(timer);
      this.logger.debug({ channelId }, 'Cancelled reconnection timer on shutdown');
    }
    this.reconnectTimers.clear();

    // Clean up all pending history requests (clear timeouts)
    for (const [requestId, request] of this.pendingHistoryRequests) {
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }
    }
    this.pendingHistoryRequests.clear();

    // Clear message retry cache
    this.msgRetryCache.flushAll();
    this.msgRetryCache.close();

    // Close all sessions and release locks
    const eventsToRemove = [
      'connection.update', 'creds.update', 'messages.upsert', 'messages.update',
      'lid-mapping.update', 'messaging-history.set', 'groups.update',
      'group-participants.update', 'groups.upsert', 'contacts.upsert', 'contacts.update'
    ] as const;

    for (const [channelId, session] of this.sessions) {
      try {
        // CRITICAL: Remove all event listeners to prevent memory leaks
        for (const event of eventsToRemove) {
          session.socket.ev.removeAllListeners(event);
        }
        session.socket.end(undefined);
      } catch (e) {
        // Ignore
      }
    }
    this.sessions.clear();

    // Release all distributed locks held by this instance
    await releaseAllLocks();

    this.logger.info('Session manager shutdown complete - all resources released');
  }

  /**
   * Clean up pending history requests for a specific channel
   * Clears timeouts and removes entries to prevent memory leaks
   */
  private cleanupPendingHistoryRequests(channelId: string): void {
    const toDelete: string[] = [];
    for (const [requestId, request] of this.pendingHistoryRequests) {
      if (request.channelId === channelId) {
        if (request.timeoutId) {
          clearTimeout(request.timeoutId);
        }
        toDelete.push(requestId);
      }
    }
    for (const requestId of toDelete) {
      this.pendingHistoryRequests.delete(requestId);
    }
    if (toDelete.length > 0) {
      this.logger.debug({ channelId, count: toDelete.length }, 'Cleaned up pending history requests');
    }
  }

  /**
   * Update channel status in database
   * Handles gracefully if channel was deleted
   */
  private async updateChannelStatus(
    channelId: string,
    status: ChannelStatus,
    identifier?: string
  ): Promise<void> {
    const updateData: any = {
      status,
      ...(status === 'CONNECTED' ? { lastConnectedAt: new Date() } : {}),
    };

    if (identifier) {
      updateData.identifier = identifier;
    }

    try {
      await prisma.channel.update({
        where: { id: channelId },
        data: updateData,
      });

      // Publish status change to Redis for other servers
      await redisClient.publish(`channel:${channelId}:status`, JSON.stringify({ status, identifier }));
    } catch (error: any) {
      // Handle "Record to update not found" error gracefully
      // This happens when a channel was deleted but worker still has the session
      if (error.code === 'P2025') {
        this.logger.warn({ channelId, status }, 'Channel not found in database, removing session and cleaning up auth state');
        // Close the socket first to stop it from generating more events
        const session = this.sessions.get(channelId);
        if (session?.socket) {
          try {
            session.socket.end(undefined);
          } catch (e) {
            // Ignore close errors
          }
        }
        // Delete orphaned auth state to prevent reconnection attempts
        if (session?.deleteState) {
          try {
            await session.deleteState();
            this.logger.info({ channelId }, 'Deleted orphaned auth state for non-existent channel');
          } catch (e) {
            // Ignore delete errors
          }
        }
        // Release any distributed lock
        await releaseLock(channelId);
        // Remove the session since the channel no longer exists
        this.sessions.delete(channelId);
        return;
      }
      throw error;
    }
  }

  /**
   * Format phone number to JID
   */
  private formatJid(phoneNumber: string): string {
    // If already a valid JID (contains @), return as-is
    // Must check BEFORE cleaning since cleaning removes @
    if (phoneNumber.includes('@')) {
      return phoneNumber;
    }

    // Remove all non-numeric characters for plain phone numbers
    const cleaned = phoneNumber.replace(/\D/g, '');

    // Add @s.whatsapp.net suffix for individual chats
    return `${cleaned}@s.whatsapp.net`;
  }

  /**
   * Check rate limits (anti-ban protection)
   */
  private async checkRateLimit(channelId: string): Promise<void> {
    const minuteKey = `ratelimit:${channelId}:minute`;
    const hourKey = `ratelimit:${channelId}:hour`;

    const minuteCount = await redisClient.incr(minuteKey);
    if (minuteCount === 1) {
      await redisClient.expire(minuteKey, 60);
    }

    const hourCount = await redisClient.incr(hourKey);
    if (hourCount === 1) {
      await redisClient.expire(hourKey, 3600);
    }

    if (minuteCount > RATE_LIMIT.MESSAGES_PER_MINUTE) {
      throw new Error(`Rate limit exceeded: ${RATE_LIMIT.MESSAGES_PER_MINUTE} messages per minute`);
    }

    if (hourCount > RATE_LIMIT.MESSAGES_PER_HOUR) {
      throw new Error(`Rate limit exceeded: ${RATE_LIMIT.MESSAGES_PER_HOUR} messages per hour`);
    }
  }

  // ==================== INCOGNITO MODE ====================

  /**
   * Check if incognito mode is enabled for a channel
   */
  async isIncognitoMode(channelId: string): Promise<boolean> {
    const value = await redisClient.get(`incognito:${channelId}`);
    return value === 'true';
  }

  /**
   * Set incognito mode for a channel
   * When enabled: hides online status, typing indicators, and read receipts
   */
  async setIncognitoMode(channelId: string, enabled: boolean): Promise<void> {
    const session = this.sessions.get(channelId);

    if (enabled) {
      // Store incognito state in Redis
      await redisClient.set(`incognito:${channelId}`, 'true');

      // Send unavailable presence to appear offline
      if (session?.socket && session.status === 'CONNECTED') {
        try {
          await session.socket.sendPresenceUpdate('unavailable');
          this.logger.info({ channelId }, 'Incognito mode enabled - presence set to unavailable');
        } catch (e) {
          this.logger.warn({ channelId, error: e }, 'Failed to update presence for incognito mode');
        }
      }
    } else {
      // Remove incognito state
      await redisClient.del(`incognito:${channelId}`);

      // Send available presence to appear online
      if (session?.socket && session.status === 'CONNECTED') {
        try {
          await session.socket.sendPresenceUpdate('available');
          this.logger.info({ channelId }, 'Incognito mode disabled - presence set to available');
        } catch (e) {
          this.logger.warn({ channelId, error: e }, 'Failed to update presence');
        }
      }
    }
  }

  /**
   * Get incognito status for a channel
   */
  async getIncognitoStatus(channelId: string): Promise<{ enabled: boolean }> {
    const enabled = await this.isIncognitoMode(channelId);
    return { enabled };
  }

  // ============================================
  // On-Demand History Fetch Methods
  // ============================================

  /**
   * Fetch message history on-demand for a specific conversation
   * Used when user opens a conversation that needs more messages
   * Rate limited to 1 request per 30 seconds per conversation
   */
  async fetchMessageHistory(
    channelId: string,
    conversationId: string,
    messageKey: WAMessageKey,
    messageTimestamp: number,
    count: number = 50
  ): Promise<string | null> {
    const session = this.sessions.get(channelId);
    if (!session?.socket || session.status !== 'CONNECTED') {
      this.logger.warn({ channelId }, 'Cannot fetch history: session not connected');
      return null;
    }

    // Rate limit: 30 second cooldown per conversation
    const cacheKey = `${channelId}:${conversationId}`;
    const lastFetch = this.lastHistoryFetch.get(cacheKey) || 0;
    const now = Date.now();
    if (now - lastFetch < 30000) {
      this.logger.info({ channelId, conversationId, cooldownRemaining: 30000 - (now - lastFetch) }, 'History fetch rate limited');
      return null;
    }
    this.lastHistoryFetch.set(cacheKey, now);

    try {
      // Prevent unbounded growth of pending requests
      if (this.pendingHistoryRequests.size >= SessionManager.MAX_PENDING_HISTORY_REQUESTS) {
        this.logger.warn({ channelId, conversationId, size: this.pendingHistoryRequests.size }, 'Too many pending history requests, rejecting new request');
        return null;
      }

      // Clean up old entries in lastHistoryFetch to prevent memory leak
      if (this.lastHistoryFetch.size > SessionManager.MAX_HISTORY_FETCH_CACHE) {
        const entries = [...this.lastHistoryFetch.entries()];
        entries.sort((a, b) => a[1] - b[1]); // Sort by timestamp, oldest first
        const toDelete = entries.slice(0, entries.length - SessionManager.MAX_HISTORY_FETCH_CACHE / 2);
        for (const [key] of toDelete) {
          this.lastHistoryFetch.delete(key);
        }
      }

      // Baileys fetchMessageHistory: count, key, timestamp
      const requestId = await session.socket.fetchMessageHistory(count, messageKey, messageTimestamp);

      if (requestId) {
        // Set timeout for retry (10s per attempt)
        const timeoutId = setTimeout(() => {
          this.handleHistoryFetchTimeout(requestId);
        }, 10000);

        this.pendingHistoryRequests.set(requestId, {
          requestId,
          channelId,
          conversationId,
          messageKey,
          messageTimestamp,
          attempts: 1,
          requestedAt: now,
          timeoutId,
        });

        this.logger.info({ channelId, conversationId, requestId, count }, 'On-demand history fetch requested');
      }

      return requestId;
    } catch (error) {
      this.logger.error({ channelId, conversationId, error }, 'Failed to fetch message history');
      return null;
    }
  }

  /**
   * Handle timeout for history fetch request - implements retry logic
   */
  private async handleHistoryFetchTimeout(requestId: string): Promise<void> {
    const pending = this.pendingHistoryRequests.get(requestId);
    if (!pending) return;

    if (pending.attempts < 3) {
      // Retry
      this.logger.warn(
        { channelId: pending.channelId, requestId, attempt: pending.attempts },
        'History fetch timeout, retrying...'
      );

      const session = this.sessions.get(pending.channelId);
      if (session?.socket && session.status === 'CONNECTED') {
        try {
          // Re-request with same parameters
          const newRequestId = await session.socket.fetchMessageHistory(
            50,
            pending.messageKey,
            pending.messageTimestamp
          );

          if (newRequestId) {
            // Update tracking with new request ID
            this.pendingHistoryRequests.delete(requestId);

            const timeoutId = setTimeout(() => {
              this.handleHistoryFetchTimeout(newRequestId);
            }, 10000);

            this.pendingHistoryRequests.set(newRequestId, {
              ...pending,
              requestId: newRequestId,
              attempts: pending.attempts + 1,
              requestedAt: Date.now(),
              timeoutId,
            });
          }
        } catch (error) {
          this.logger.error({ requestId, error }, 'Retry fetch failed');
          this.pendingHistoryRequests.delete(requestId);
        }
      } else {
        // Session disconnected, give up
        this.pendingHistoryRequests.delete(requestId);
      }
    } else {
      // Give up after 3 attempts
      this.logger.error(
        { channelId: pending.channelId, conversationId: pending.conversationId, requestId },
        'History fetch failed after 3 attempts'
      );
      this.pendingHistoryRequests.delete(requestId);
    }
  }

  /**
   * Find pending history request that matches incoming ON_DEMAND messages
   * Matches by channelId and checks if any message JID matches pending request
   */
  private findPendingHistoryRequest(
    channelId: string,
    messages: any[]
  ): PendingHistoryRequest | null {
    // Find any pending request for this channel
    for (const [requestId, pending] of this.pendingHistoryRequests) {
      if (pending.channelId === channelId) {
        // Found a pending request for this channel
        return { ...pending, requestId };
      }
    }
    return null;
  }

}

// Singleton instance
export const sessionManager = new SessionManager();

// Type augmentation for event emitter
export interface SessionManager {
  on<K extends keyof SessionEvents>(event: K, listener: SessionEvents[K]): this;
  emit<K extends keyof SessionEvents>(event: K, ...args: Parameters<SessionEvents[K]>): boolean;
}
