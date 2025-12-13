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
}

export class WhatsAppService {
  private redisSubscriber: Redis | null = null;

  constructor() {
    this.setupRedisSubscriber();
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
   * Send a command to WhatsApp Worker via Redis and wait for response
   */
  private async sendCommand<T>(command: string, channelId: string, data: any, timeoutMs = 30000): Promise<T> {
    const requestId = uuidv4();
    const responseChannel = `whatsapp:response:${requestId}`;

    return new Promise(async (resolve, reject) => {
      const subscriber = new Redis(redisConfig.url);
      let timeout: NodeJS.Timeout;

      try {
        // Subscribe to response channel
        await subscriber.subscribe(responseChannel);

        // Set up response handler
        subscriber.on('message', (ch, message) => {
          if (ch === responseChannel) {
            clearTimeout(timeout);
            subscriber.quit();
            const response = JSON.parse(message);
            if (response.success) {
              resolve(response as T);
            } else {
              reject(new Error(response.error || 'Command failed'));
            }
          }
        });

        // Set timeout
        timeout = setTimeout(() => {
          subscriber.quit();
          reject(new Error('Command timeout - WhatsApp Worker may not be running'));
        }, timeoutMs);

        // Publish command to WhatsApp Worker
        await redisClient.publish(`whatsapp:cmd:${command}:${channelId}`, JSON.stringify({
          ...data,
          requestId,
        }));
      } catch (error) {
        clearTimeout(timeout!);
        subscriber.quit();
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
   * Send a message
   * Creates DB record, then sends via Redis to WhatsApp Worker
   */
  async sendMessage(input: SendMessageInput) {
    const channel = await prisma.channel.findUnique({
      where: { id: input.channelId },
    });

    if (!channel) {
      throw new Error('Channel not found');
    }

    if (channel.status !== ChannelStatus.CONNECTED) {
      throw new Error('Channel not connected');
    }

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
      // Send command to WhatsApp Worker and wait for response
      const response = await this.sendCommand<{ success: boolean; messageId: string }>(
        'send',
        input.channelId,
        {
          to: input.to,
          text: input.text,
          media: input.media,
        }
      );

      // Update message with external ID and sent status
      await prisma.message.update({
        where: { id: message.id },
        data: {
          externalId: response.messageId,
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
        externalId: response.messageId,
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
