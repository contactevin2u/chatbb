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
  fetchLatestBaileysVersion,
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

interface SessionInfo {
  socket: WASocket;
  channelId: string;
  organizationId: string;
  status: ChannelStatus;
  qrCode?: string;
  pairingCode?: string;
  retryCount: number;
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
  // Contact events
  'contacts:upsert': (channelId: string, contacts: any[]) => void;
  'contacts:update': (channelId: string, contacts: any[]) => void;
}

const MAX_RETRY_COUNT = 5;
const RETRY_DELAY_MS = 5000;

// Rate limiting constants (anti-ban)
const RATE_LIMIT = {
  MESSAGES_PER_MINUTE: 30,
  MESSAGES_PER_HOUR: 200,
  NEW_CONTACTS_PER_DAY: 50,
};

export class SessionManager extends EventEmitter {
  private sessions: Map<string, SessionInfo> = new Map();
  private logger = pino({ level: 'info' });
  private msgRetryCache = new NodeCache({ stdTTL: 60, checkperiod: 30 });

  constructor() {
    super();
  }

  /**
   * Initialize all active channels on startup
   */
  async initializeAllSessions(): Promise<void> {
    this.logger.info('Initializing all WhatsApp sessions...');

    const channels = await prisma.channel.findMany({
      where: {
        type: 'WHATSAPP',
        status: {
          in: ['CONNECTED', 'CONNECTING'],
        },
      },
    });

    for (const channel of channels) {
      try {
        await this.createSession(channel.id, channel.organizationId);
      } catch (error) {
        this.logger.error({ channelId: channel.id, error }, 'Failed to initialize session');
      }
    }

    this.logger.info(`Initialized ${this.sessions.size} WhatsApp sessions`);
  }

  /**
   * Create a new WhatsApp session for a channel
   */
  async createSession(channelId: string, organizationId: string): Promise<SessionInfo> {
    // Check if session already exists
    if (this.sessions.has(channelId)) {
      const existingSession = this.sessions.get(channelId)!;
      this.logger.warn({ channelId }, 'Session already exists, returning existing');
      return existingSession;
    }

    this.logger.info({ channelId, organizationId }, 'Creating new WhatsApp session');

    // Update channel status to CONNECTING
    await this.updateChannelStatus(channelId, 'CONNECTING');

    // Load auth state from PostgreSQL
    const { state, saveCreds, deleteState } = await usePostgresAuthState(channelId);

    // Get latest Baileys version
    const { version, isLatest } = await fetchLatestBaileysVersion();
    this.logger.info({ version, isLatest }, 'Using Baileys version');

    // Create socket connection
    // Use macOS Desktop browser for full historical message sync
    const socket = makeWASocket({
      version,
      logger: this.logger.child({ channelId }),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, this.logger),
      },
      // macOS Desktop browser enables full history sync
      browser: Browsers.macOS('Desktop'),
      printQRInTerminal: false,
      generateHighQualityLinkPreview: true,
      // Enable full history sync from device
      syncFullHistory: true,
      // Set to false to receive phone notifications
      markOnlineOnConnect: false,
      msgRetryCounterCache: this.msgRetryCache,
      // Cache group metadata to prevent rate limiting
      cachedGroupMetadata: async (jid) => {
        const cached = await redisClient.get(`group:${jid}:metadata`);
        if (cached) {
          return JSON.parse(cached);
        }
        return undefined;
      },
      // Sync all historical messages (return true to sync)
      shouldSyncHistoryMessage: () => true,
      getMessage: async (key) => {
        // Retrieve message from database for retry
        const message = await prisma.message.findFirst({
          where: {
            externalId: key.id,
            channelId,
          },
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
      retryCount: 0,
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
        session.qrCode = qr;
        session.status = 'CONNECTING';
        await this.updateChannelStatus(channelId, 'CONNECTING');
        this.emit('qr:generated', channelId, qr);
        this.logger.info({ channelId }, 'QR code generated');
      }

      // Handle connection state
      if (connection === 'open') {
        session.status = 'CONNECTED';
        session.qrCode = undefined;
        session.pairingCode = undefined;
        session.retryCount = 0;

        const phoneNumber = socket.user?.id?.split(':')[0] || 'unknown';
        await this.updateChannelStatus(channelId, 'CONNECTED', phoneNumber);

        this.emit('connected', channelId, phoneNumber);
        this.logger.info({ channelId, phoneNumber }, 'WhatsApp connected');
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const reason = statusCode ? String(DisconnectReason[statusCode] || 'Unknown') : 'Unknown';

        this.logger.warn({ channelId, statusCode, reason }, 'WhatsApp disconnected');

        session.status = 'DISCONNECTED';

        // Handle different disconnect reasons
        const shouldReconnect =
          statusCode !== DisconnectReason.loggedOut &&
          statusCode !== DisconnectReason.badSession &&
          statusCode !== DisconnectReason.multideviceMismatch;

        if (shouldReconnect && session.retryCount < MAX_RETRY_COUNT) {
          session.retryCount++;
          const delay = RETRY_DELAY_MS * Math.pow(2, session.retryCount - 1); // Exponential backoff

          this.logger.info(
            { channelId, retryCount: session.retryCount, delay },
            'Scheduling reconnection'
          );

          setTimeout(() => {
            this.reconnectSession(channelId);
          }, delay);
        } else {
          // Permanent disconnect
          await this.updateChannelStatus(
            channelId,
            statusCode === DisconnectReason.loggedOut ? 'DISCONNECTED' : 'ERROR'
          );

          if (statusCode === DisconnectReason.loggedOut) {
            // Clear auth state on logout
            await session.deleteState();
          }

          this.sessions.delete(channelId);
          this.emit('disconnected', channelId, reason);
        }
      }
    });

    // Credential updates
    socket.ev.on('creds.update', async () => {
      await session.saveCreds();
      this.logger.debug({ channelId }, 'Credentials updated and saved');
    });

    // Incoming messages
    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (!msg.message) continue;

        // Skip status broadcasts
        if (msg.key.remoteJid === 'status@broadcast') continue;

        this.emit('message:received', channelId, msg);
        this.logger.debug({ channelId, messageId: msg.key.id }, 'Message received');
      }
    });

    // Message status updates
    socket.ev.on('messages.update', async (updates) => {
      for (const update of updates) {
        this.emit('message:update', channelId, update);
      }
    });

    // Baileys v7 LID mapping updates
    socket.ev.on('lid-mapping.update', async (mapping) => {
      for (const [lid, pn] of Object.entries(mapping)) {
        this.emit('lid-mapping:update', channelId, { lid, pn: pn as string });
        this.logger.debug({ channelId, lid, pn }, 'LID mapping received');
      }
    });

    // Historical message sync (requires macOS Desktop browser + syncFullHistory: true)
    socket.ev.on('messaging-history.set', async ({ chats, contacts, messages, syncType }) => {
      this.logger.info(
        { channelId, chatsCount: chats.length, contactsCount: contacts.length, messagesCount: Object.keys(messages).length, syncType },
        'Historical sync received'
      );

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

      this.logger.info({ channelId, syncType }, 'Historical sync processed');
    });

    // Group metadata updates - cache for performance
    socket.ev.on('groups.update', async (updates) => {
      for (const update of updates) {
        if (update.id) {
          const existing = await redisClient.get(`group:${update.id}:metadata`);
          if (existing) {
            const metadata = JSON.parse(existing);
            const updated = { ...metadata, ...update };
            await redisClient.setex(`group:${update.id}:metadata`, 3600, JSON.stringify(updated));
          }
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
   * Reconnect a session
   */
  private async reconnectSession(channelId: string): Promise<void> {
    const session = this.sessions.get(channelId);
    if (!session) {
      this.logger.warn({ channelId }, 'Cannot reconnect: session not found');
      return;
    }

    this.logger.info({ channelId }, 'Attempting to reconnect');

    // Remove old session
    this.sessions.delete(channelId);

    // Create new session
    try {
      await this.createSession(channelId, session.organizationId);
    } catch (error) {
      this.logger.error({ channelId, error }, 'Reconnection failed');
      await this.updateChannelStatus(channelId, 'ERROR');
      this.emit('error', channelId, error as Error);
    }
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
   */
  async sendTextMessage(channelId: string, to: string, text: string): Promise<WAMessage | undefined> {
    const session = this.sessions.get(channelId);
    if (!session || session.status !== 'CONNECTED') {
      throw new Error('Channel not connected');
    }

    // Check rate limits
    await this.checkRateLimit(channelId);

    // Format recipient JID
    const jid = this.formatJid(to);

    const result = await session.socket.sendMessage(jid, { text });
    this.logger.info({ channelId, to: jid, messageId: result?.key?.id }, 'Message sent');

    return result;
  }

  /**
   * Send a media message
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
    }
  ): Promise<WAMessage | undefined> {
    const session = this.sessions.get(channelId);
    if (!session || session.status !== 'CONNECTED') {
      throw new Error('Channel not connected');
    }

    await this.checkRateLimit(channelId);

    const jid = this.formatJid(to);

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

    const result = await session.socket.sendMessage(jid, content);
    this.logger.info({ channelId, to: jid, type: media.type, messageId: result?.key?.id }, 'Media sent');

    return result;
  }

  /**
   * Mark messages as read
   */
  async markAsRead(channelId: string, keys: WAMessageKey[]): Promise<void> {
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
   * Disconnect a session
   */
  async disconnectSession(channelId: string): Promise<void> {
    const session = this.sessions.get(channelId);
    if (!session) {
      return;
    }

    this.logger.info({ channelId }, 'Disconnecting session');

    try {
      await session.socket.logout();
    } catch (error) {
      this.logger.warn({ channelId, error }, 'Error during logout');
    }

    await session.deleteState();
    this.sessions.delete(channelId);
    await this.updateChannelStatus(channelId, 'DISCONNECTED');
  }

  /**
   * Update channel status in database
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

    await prisma.channel.update({
      where: { id: channelId },
      data: updateData,
    });

    // Publish status change to Redis for other servers
    await redisClient.publish(`channel:${channelId}:status`, JSON.stringify({ status, identifier }));
  }

  /**
   * Format phone number to JID
   */
  private formatJid(phoneNumber: string): string {
    // Remove all non-numeric characters
    const cleaned = phoneNumber.replace(/\D/g, '');

    // Add @s.whatsapp.net suffix if not present
    if (cleaned.includes('@')) {
      return cleaned;
    }

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

  /**
   * Cleanup on shutdown
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down session manager...');

    for (const [channelId, session] of this.sessions) {
      try {
        session.socket.end(undefined);
        this.logger.info({ channelId }, 'Session closed');
      } catch (error) {
        this.logger.error({ channelId, error }, 'Error closing session');
      }
    }

    this.sessions.clear();
    this.logger.info('Session manager shutdown complete');
  }
}

// Singleton instance
export const sessionManager = new SessionManager();

// Type augmentation for event emitter
export interface SessionManager {
  on<K extends keyof SessionEvents>(event: K, listener: SessionEvents[K]): this;
  emit<K extends keyof SessionEvents>(event: K, ...args: Parameters<SessionEvents[K]>): boolean;
}
