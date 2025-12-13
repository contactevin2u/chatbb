/**
 * WhatsApp Service
 *
 * Business logic for WhatsApp channel operations.
 *
 * IMPORTANT: This service runs in the API server which does NOT have active
 * WhatsApp sessions. All session operations are sent via Redis pub/sub to
 * the WhatsApp Worker which has the active Baileys sessions.
 *
 * Architecture:
 * - API Server (this service) -> Redis pub/sub -> WhatsApp Worker (sessionManager)
 * - WhatsApp Worker -> Redis pub/sub -> API Server (WebSocket broadcast)
 */

import { ChannelStatus, ChannelType, MessageDirection, MessageStatus, MessageType } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';

import { prisma } from '../../core/database/prisma';
import { hasAuthState } from './session/session.store';
import { socketServer } from '../../core/websocket/server';
import { redisClient } from '../../core/cache/redis.client';
import { redisConfig } from '../../config/redis';

export interface CreateChannelInput {
  organizationId: string;
  name: string;
  identifier?: string;
}

export interface SendMessageInput {
  channelId: string;
  to: string;
  text?: string;
  media?: {
    type: 'image' | 'video' | 'audio' | 'document';
    url?: string;
    buffer?: Buffer;
    mimetype?: string;
    filename?: string;
    caption?: string;
  };
  sticker?: {
    url?: string;
    buffer?: Buffer;
  };
  gif?: {
    url?: string;
    buffer?: Buffer;
    caption?: string;
  };
  voiceNote?: {
    url?: string;
    buffer?: Buffer;
  };
  reaction?: {
    messageKey: {
      remoteJid: string;
      id: string;
      fromMe?: boolean;
    };
    emoji: string;
  };
}

export class WhatsAppService {
  private redisSubscriber: Redis | null = null;
  private responseSubscriber: Redis | null = null;
  private pendingRequests: Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout }> = new Map();

  constructor() {
    this.setupRedisSubscriber();
    this.setupResponseSubscriber();
  }

  /**
   * Set up Redis subscriber for events from WhatsApp Worker
   */
  private async setupRedisSubscriber() {
    try {
      this.redisSubscriber = new Redis(redisConfig.url);

      // Subscribe to WhatsApp events from Worker
      await this.redisSubscriber.psubscribe(
        'whatsapp:*:qr',
        'whatsapp:*:connected',
        'whatsapp:*:disconnected',
        'whatsapp:*:status',
        'org:*:message'
      );

      this.redisSubscriber.on('pmessage', async (pattern, channel, message) => {
        try {
          const data = JSON.parse(message);
          const parts = channel.split(':');

          if (channel.includes(':qr')) {
            const channelId = parts[1];
            socketServer.to(`channel:${channelId}`).emit('whatsapp:qr', { channelId, qr: data.qr });
          } else if (channel.includes(':connected')) {
            const channelId = parts[1];
            socketServer.to(`channel:${channelId}`).emit('whatsapp:connected', { channelId, phoneNumber: data.phoneNumber });

            // Update channel in DB
            const channelRecord = await prisma.channel.findUnique({ where: { id: channelId } });
            if (channelRecord) {
              await prisma.channel.update({
                where: { id: channelId },
                data: {
                  status: ChannelStatus.CONNECTED,
                  identifier: data.phoneNumber,
                  lastConnectedAt: new Date(),
                },
              });
              socketServer.to(`org:${channelRecord.organizationId}`).emit('channel:connected', {
                channelId,
                type: 'WHATSAPP',
                phoneNumber: data.phoneNumber,
              });
            }
          } else if (channel.includes(':disconnected')) {
            const channelId = parts[1];
            socketServer.to(`channel:${channelId}`).emit('whatsapp:disconnected', { channelId, reason: data.reason });

            const channelRecord = await prisma.channel.findUnique({ where: { id: channelId } });
            if (channelRecord) {
              await prisma.channel.update({
                where: { id: channelId },
                data: { status: ChannelStatus.DISCONNECTED },
              });
              socketServer.to(`org:${channelRecord.organizationId}`).emit('channel:disconnected', {
                channelId,
                type: 'WHATSAPP',
                reason: data.reason,
              });
            }
          } else if (channel.includes(':message')) {
            // New message notification from Background Worker
            const orgId = parts[1];
            socketServer.to(`org:${orgId}`).emit('message:new', data);
          }
        } catch (error) {
          console.error('[WhatsAppService] Error processing Redis message:', error);
        }
      });

      console.log('[WhatsAppService] Redis subscriber connected - listening for WhatsApp Worker events');
    } catch (error) {
      console.error('[WhatsAppService] Failed to setup Redis subscriber:', error);
    }
  }

  /**
   * Set up a single Redis subscriber for command responses (reused for all commands)
   */
  private async setupResponseSubscriber() {
    try {
      this.responseSubscriber = new Redis(redisConfig.url);

      // Subscribe to all response channels using pattern
      await this.responseSubscriber.psubscribe('whatsapp:response:*');

      this.responseSubscriber.on('pmessage', (pattern, channel, message) => {
        try {
          // Extract requestId from channel: whatsapp:response:{requestId}
          const requestId = channel.split(':')[2];
          const pending = this.pendingRequests.get(requestId);

          if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(requestId);

            const response = JSON.parse(message);
            if (response.success) {
              pending.resolve(response);
            } else {
              pending.reject(new Error(response.error || 'Command failed'));
            }
          }
        } catch (error) {
          console.error('[WhatsAppService] Error processing response:', error);
        }
      });

      this.responseSubscriber.on('error', (error) => {
        console.error('[WhatsAppService] Response subscriber error:', error);
      });

      console.log('[WhatsAppService] Response subscriber initialized');
    } catch (error) {
      console.error('[WhatsAppService] Failed to setup response subscriber:', error);
    }
  }

  /**
   * Send a command to WhatsApp Worker via Redis and wait for response
   * Uses a shared subscriber connection instead of creating new ones
   */
  private async sendCommand<T>(command: string, channelId: string, data: any, timeoutMs = 30000): Promise<T> {
    const requestId = uuidv4();

    return new Promise(async (resolve, reject) => {
      // Set timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Command timeout - WhatsApp Worker may not be running'));
      }, timeoutMs);

      // Store pending request
      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      try {
        // Publish command to WhatsApp Worker
        await redisClient.publish(`whatsapp:cmd:${command}:${channelId}`, JSON.stringify({
          ...data,
          requestId,
        }));
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }

  /**
   * Create a new WhatsApp channel (DB only - no session yet)
   */
  async createChannel(input: CreateChannelInput) {
    const channel = await prisma.channel.create({
      data: {
        organizationId: input.organizationId,
        type: ChannelType.WHATSAPP,
        name: input.name,
        identifier: input.identifier || 'pending',
        status: ChannelStatus.DISCONNECTED,
      },
    });

    return channel;
  }

  /**
   * Connect a WhatsApp channel (start QR code flow)
   * Sends command to WhatsApp Worker via Redis
   */
  async connectChannel(channelId: string, organizationId: string) {
    const channel = await prisma.channel.findFirst({
      where: {
        id: channelId,
        organizationId,
        type: ChannelType.WHATSAPP,
      },
    });

    if (!channel) {
      throw new Error('Channel not found');
    }

    // Send connect command to WhatsApp Worker
    await redisClient.publish(`whatsapp:cmd:connect:${channelId}`, JSON.stringify({
      organizationId,
    }));

    // Update channel status
    await prisma.channel.update({
      where: { id: channelId },
      data: { status: ChannelStatus.CONNECTING },
    });

    return {
      channelId,
      status: 'CONNECTING',
      message: 'QR code will be sent via WebSocket',
    };
  }

  /**
   * Request pairing code instead of QR
   * Sends command to WhatsApp Worker via Redis
   */
  async requestPairingCode(channelId: string, organizationId: string, phoneNumber: string) {
    const channel = await prisma.channel.findFirst({
      where: {
        id: channelId,
        organizationId,
        type: ChannelType.WHATSAPP,
      },
    });

    if (!channel) {
      throw new Error('Channel not found');
    }

    // Send pairing command to WhatsApp Worker and wait for response
    const response = await this.sendCommand<{ success: boolean; code: string }>(
      'pairing',
      channelId,
      { phoneNumber }
    );

    return { channelId, pairingCode: response.code };
  }

  /**
   * Disconnect a WhatsApp channel
   * Sends command to WhatsApp Worker via Redis
   */
  async disconnectChannel(channelId: string, organizationId: string) {
    const channel = await prisma.channel.findFirst({
      where: {
        id: channelId,
        organizationId,
        type: ChannelType.WHATSAPP,
      },
    });

    if (!channel) {
      throw new Error('Channel not found');
    }

    // Send disconnect command to WhatsApp Worker
    await redisClient.publish(`whatsapp:cmd:disconnect:${channelId}`, JSON.stringify({}));

    // Update channel status
    await prisma.channel.update({
      where: { id: channelId },
      data: { status: ChannelStatus.DISCONNECTED },
    });

    return { channelId, status: 'DISCONNECTED' };
  }

  /**
   * Reconnect a WhatsApp channel using saved credentials
   * If credentials exist, tries to restore session without QR code
   * If no credentials, falls back to connect flow (QR code)
   */
  async reconnectChannel(channelId: string, organizationId: string) {
    const channel = await prisma.channel.findFirst({
      where: {
        id: channelId,
        organizationId,
        type: ChannelType.WHATSAPP,
      },
    });

    if (!channel) {
      throw new Error('Channel not found');
    }

    // Check if we have saved auth state
    const hasState = await hasAuthState(channelId);

    // Send reconnect command to WhatsApp Worker
    await redisClient.publish(`whatsapp:cmd:reconnect:${channelId}`, JSON.stringify({
      organizationId,
      hasAuthState: hasState,
    }));

    // Update channel status to connecting
    await prisma.channel.update({
      where: { id: channelId },
      data: { status: ChannelStatus.CONNECTING },
    });

    return {
      channelId,
      status: 'CONNECTING',
      hasAuthState: hasState,
      message: hasState
        ? 'Attempting to reconnect using saved session...'
        : 'No saved session. QR code will be generated.',
    };
  }

  /**
   * Get channel status (from DB - no sessionManager access)
   */
  async getChannelStatus(channelId: string, organizationId: string) {
    const channel = await prisma.channel.findFirst({
      where: {
        id: channelId,
        organizationId,
        type: ChannelType.WHATSAPP,
      },
    });

    if (!channel) {
      throw new Error('Channel not found');
    }

    const hasState = await hasAuthState(channelId);

    return {
      channelId,
      status: channel.status,
      identifier: channel.identifier,
      lastConnectedAt: channel.lastConnectedAt,
      hasAuthState: hasState,
    };
  }

  /**
   * List all WhatsApp channels for an organization (from DB)
   */
  async listChannels(organizationId: string) {
    const channels = await prisma.channel.findMany({
      where: {
        organizationId,
        type: ChannelType.WHATSAPP,
      },
      orderBy: { createdAt: 'desc' },
    });

    return channels;
  }

  /**
   * Send a message via WhatsApp Worker (low-level - no DB operations)
   * Used by messageService which handles its own DB records
   *
   * NOTE: We don't check DB status here because it may be stale.
   * The WhatsApp Worker is the source of truth for connection status.
   */
  async sendMessageRaw(
    channelId: string,
    to: string,
    text?: string,
    media?: any,
    options?: {
      sticker?: { url?: string; buffer?: Buffer };
      gif?: { url?: string; buffer?: Buffer; caption?: string };
      voiceNote?: { url?: string; buffer?: Buffer };
      reaction?: { messageKey: any; emoji: string };
    }
  ): Promise<{ externalId: string }> {
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw new Error('Channel not found');
    }

    // Note: We don't check channel.status here because the DB may be out of sync
    // The WhatsApp Worker will return an error if the session is not connected

    try {
      // Send command to WhatsApp Worker and wait for response
      const response = await this.sendCommand<{ success: boolean; messageId: string }>(
        'send',
        channelId,
        {
          to,
          text,
          media,
          sticker: options?.sticker,
          gif: options?.gif,
          voiceNote: options?.voiceNote,
          reaction: options?.reaction,
        }
      );

      return { externalId: response.messageId };
    } catch (error) {
      const errorMessage = (error as Error).message;

      // If it's a timeout, the worker might not be running or channel not connected
      if (errorMessage.includes('timeout')) {
        throw new Error('WhatsApp channel not connected or worker not responding. Please reconnect the channel.');
      }

      throw error;
    }
  }

  /**
   * Get profile picture URL for a contact
   */
  async getProfilePicture(channelId: string, jid: string): Promise<string | null> {
    try {
      const response = await this.sendCommand<{ success: boolean; url: string | null }>(
        'profile-picture',
        channelId,
        { jid }
      );
      return response.url;
    } catch (error) {
      // Profile picture not available
      return null;
    }
  }

  /**
   * Send a message (convenience method)
   * Creates DB record, then sends via Redis to WhatsApp Worker
   */
  async sendMessage(input: SendMessageInput) {
    const channel = await prisma.channel.findUnique({
      where: { id: input.channelId },
    });

    if (!channel) {
      throw new Error('Channel not found');
    }

    // Note: We don't check channel.status here because the DB may be out of sync
    // The WhatsApp Worker will return an error if the session is not connected

    // Get or create contact
    const contactIdentifier = input.to.replace(/\D/g, '');
    let contact = await prisma.contact.findFirst({
      where: {
        organizationId: channel.organizationId,
        channelType: ChannelType.WHATSAPP,
        identifier: contactIdentifier,
      },
    });

    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          organizationId: channel.organizationId,
          channelType: ChannelType.WHATSAPP,
          identifier: contactIdentifier,
        },
      });
    }

    // Get or create conversation
    let conversation = await prisma.conversation.findFirst({
      where: {
        channelId: input.channelId,
        contactId: contact.id,
      },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          organizationId: channel.organizationId,
          channelId: input.channelId,
          contactId: contact.id,
          status: 'OPEN',
        },
      });
    }

    // Create message record with PENDING status
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        channelId: input.channelId,
        direction: MessageDirection.OUTBOUND,
        type: input.media ? this.getMessageType(input.media.type) : MessageType.TEXT,
        content: input.text ? { text: input.text } : { media: input.media },
        status: MessageStatus.PENDING,
      },
    });

    try {
      // Send via low-level method
      const result = await this.sendMessageRaw(input.channelId, input.to, input.text, input.media);

      // Update message with external ID and sent status
      await prisma.message.update({
        where: { id: message.id },
        data: {
          externalId: result.externalId,
          status: MessageStatus.SENT,
          sentAt: new Date(),
        },
      });

      // Update conversation
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      });

      return {
        messageId: message.id,
        externalId: result.externalId,
        status: 'SENT',
      };
    } catch (error) {
      // Mark message as failed
      await prisma.message.update({
        where: { id: message.id },
        data: {
          status: MessageStatus.FAILED,
          failedReason: (error as Error).message,
        },
      });

      throw error;
    }
  }

  /**
   * Get message type from media type string
   */
  private getMessageType(mediaType: string): MessageType {
    const typeMap: { [key: string]: MessageType } = {
      image: MessageType.IMAGE,
      video: MessageType.VIDEO,
      audio: MessageType.AUDIO,
      document: MessageType.DOCUMENT,
    };
    return typeMap[mediaType] || MessageType.TEXT;
  }
}

// Singleton instance
export const whatsappService = new WhatsAppService();
