/**
 * WhatsApp Service
 *
 * Business logic for WhatsApp channel operations
 */

import { ChannelStatus, ChannelType, MessageDirection, MessageStatus, MessageType } from '@prisma/client';
import { proto } from '@whiskeysockets/baileys';

import { prisma } from '../../core/database/prisma';
import { sessionManager } from './session/session.manager';
import { hasAuthState } from './session/session.store';
import { socketServer } from '../../core/websocket/server';

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
  constructor() {
    this.setupEventHandlers();
  }

  /**
   * Set up event handlers for session manager
   */
  private setupEventHandlers() {
    // QR code generated - emit to frontend
    sessionManager.on('qr:generated', (channelId, qr) => {
      socketServer.to(`channel:${channelId}`).emit('whatsapp:qr', { channelId, qr });
    });

    // Pairing code generated
    sessionManager.on('pairing-code:generated', (channelId, code) => {
      socketServer.to(`channel:${channelId}`).emit('whatsapp:pairing-code', { channelId, code });
    });

    // Connected
    sessionManager.on('connected', async (channelId, phoneNumber) => {
      socketServer.to(`channel:${channelId}`).emit('whatsapp:connected', { channelId, phoneNumber });

      // Notify organization
      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { organizationId: true },
      });

      if (channel) {
        socketServer.to(`org:${channel.organizationId}`).emit('channel:connected', {
          channelId,
          type: 'WHATSAPP',
          phoneNumber,
        });
      }
    });

    // Disconnected
    sessionManager.on('disconnected', async (channelId, reason) => {
      socketServer.to(`channel:${channelId}`).emit('whatsapp:disconnected', { channelId, reason });

      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { organizationId: true },
      });

      if (channel) {
        socketServer.to(`org:${channel.organizationId}`).emit('channel:disconnected', {
          channelId,
          type: 'WHATSAPP',
          reason,
        });
      }
    });

    // Message received
    sessionManager.on('message:received', async (channelId, waMessage) => {
      await this.handleIncomingMessage(channelId, waMessage);
    });

    // Message status update
    sessionManager.on('message:update', async (channelId, update) => {
      await this.handleMessageUpdate(channelId, update);
    });
  }

  /**
   * Create a new WhatsApp channel
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
   */
  async connectChannel(channelId: string, organizationId: string) {
    // Verify channel belongs to organization
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

    // Create session
    const session = await sessionManager.createSession(channelId, organizationId);

    return {
      channelId,
      status: session.status,
      qrCode: session.qrCode,
    };
  }

  /**
   * Request pairing code instead of QR
   */
  async requestPairingCode(channelId: string, organizationId: string, phoneNumber: string) {
    // Verify channel
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

    const code = await sessionManager.requestPairingCode(channelId, phoneNumber);

    return { channelId, pairingCode: code };
  }

  /**
   * Disconnect a WhatsApp channel
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

    await sessionManager.disconnectSession(channelId);

    return { channelId, status: 'DISCONNECTED' };
  }

  /**
   * Get channel status
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

    const session = sessionManager.getSession(channelId);
    const hasState = await hasAuthState(channelId);

    return {
      channelId,
      status: session?.status || channel.status,
      identifier: channel.identifier,
      lastConnectedAt: channel.lastConnectedAt,
      hasAuthState: hasState,
      qrCode: session?.qrCode,
    };
  }

  /**
   * List all WhatsApp channels for an organization
   */
  async listChannels(organizationId: string) {
    const channels = await prisma.channel.findMany({
      where: {
        organizationId,
        type: ChannelType.WHATSAPP,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Enrich with session status
    return channels.map((channel) => {
      const session = sessionManager.getSession(channel.id);
      return {
        ...channel,
        liveStatus: session?.status || channel.status,
      };
    });
  }

  /**
   * Send a message
   */
  async sendMessage(input: SendMessageInput) {
    const channel = await prisma.channel.findUnique({
      where: { id: input.channelId },
    });

    if (!channel) {
      throw new Error('Channel not found');
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

    // Create message record
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
      // Send via WhatsApp
      let result: proto.WebMessageInfo | undefined;

      if (input.text) {
        result = await sessionManager.sendTextMessage(input.channelId, input.to, input.text);
      } else if (input.media) {
        result = await sessionManager.sendMediaMessage(input.channelId, input.to, input.media);
      }

      // Update message with external ID and sent status
      await prisma.message.update({
        where: { id: message.id },
        data: {
          externalId: result?.key?.id,
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
        externalId: result?.key?.id,
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
   * Handle incoming WhatsApp message
   */
  private async handleIncomingMessage(channelId: string, waMessage: proto.IWebMessageInfo) {
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
    });

    if (!channel) return;

    const remoteJid = waMessage.key?.remoteJid;
    if (!remoteJid) return;

    // Extract phone number from JID
    const contactIdentifier = remoteJid.split('@')[0];

    // Get or create contact
    let contact = await prisma.contact.findFirst({
      where: {
        organizationId: channel.organizationId,
        channelType: ChannelType.WHATSAPP,
        identifier: contactIdentifier,
      },
    });

    if (!contact) {
      // Try to get push name from message
      const pushName = waMessage.pushName;

      contact = await prisma.contact.create({
        data: {
          organizationId: channel.organizationId,
          channelType: ChannelType.WHATSAPP,
          identifier: contactIdentifier,
          displayName: pushName,
        },
      });
    } else if (waMessage.pushName && !contact.displayName) {
      // Update display name if we didn't have one
      await prisma.contact.update({
        where: { id: contact.id },
        data: { displayName: waMessage.pushName },
      });
    }

    // Get or create conversation
    let conversation = await prisma.conversation.findFirst({
      where: {
        channelId,
        contactId: contact.id,
      },
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
      // Update conversation
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
    const { type, content } = this.parseMessageContent(waMessage.message!);

    // Create message
    const message = await prisma.message.create({
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
          timestamp: waMessage.messageTimestamp,
          pushName: waMessage.pushName,
        },
      },
      include: {
        conversation: {
          include: { contact: true },
        },
      },
    });

    // Emit to WebSocket for real-time updates
    socketServer.to(`org:${channel.organizationId}`).emit('message:new', {
      message,
      conversation: message.conversation,
    });

    // Emit to conversation room
    socketServer.to(`conversation:${conversation.id}`).emit('message:new', {
      message,
    });
  }

  /**
   * Handle message status updates
   */
  private async handleMessageUpdate(
    channelId: string,
    update: { key: proto.IMessageKey; update: Partial<proto.IWebMessageInfo> }
  ) {
    const externalId = update.key.id;
    if (!externalId) return;

    const message = await prisma.message.findFirst({
      where: { externalId, channelId },
    });

    if (!message) return;

    const statusUpdate: any = {};

    // Update based on status
    if (update.update.status === 2) {
      // DELIVERY_ACK
      statusUpdate.status = MessageStatus.DELIVERED;
      statusUpdate.deliveredAt = new Date();
    } else if (update.update.status === 3 || update.update.status === 4) {
      // READ
      statusUpdate.status = MessageStatus.READ;
      statusUpdate.readAt = new Date();
    }

    if (Object.keys(statusUpdate).length > 0) {
      const updatedMessage = await prisma.message.update({
        where: { id: message.id },
        data: statusUpdate,
      });

      // Emit status update
      socketServer.to(`conversation:${message.conversationId}`).emit('message:update', {
        messageId: message.id,
        ...statusUpdate,
      });
    }
  }

  /**
   * Parse WhatsApp message content
   */
  private parseMessageContent(waMessage: proto.IMessage): { type: MessageType; content: any } {
    if (waMessage.conversation || waMessage.extendedTextMessage) {
      return {
        type: MessageType.TEXT,
        content: {
          text: waMessage.conversation || waMessage.extendedTextMessage?.text,
        },
      };
    }

    if (waMessage.imageMessage) {
      return {
        type: MessageType.IMAGE,
        content: {
          url: waMessage.imageMessage.url,
          mimetype: waMessage.imageMessage.mimetype,
          caption: waMessage.imageMessage.caption,
          fileLength: waMessage.imageMessage.fileLength,
        },
      };
    }

    if (waMessage.videoMessage) {
      return {
        type: MessageType.VIDEO,
        content: {
          url: waMessage.videoMessage.url,
          mimetype: waMessage.videoMessage.mimetype,
          caption: waMessage.videoMessage.caption,
          fileLength: waMessage.videoMessage.fileLength,
          seconds: waMessage.videoMessage.seconds,
        },
      };
    }

    if (waMessage.audioMessage) {
      return {
        type: MessageType.AUDIO,
        content: {
          url: waMessage.audioMessage.url,
          mimetype: waMessage.audioMessage.mimetype,
          seconds: waMessage.audioMessage.seconds,
          ptt: waMessage.audioMessage.ptt,
        },
      };
    }

    if (waMessage.documentMessage) {
      return {
        type: MessageType.DOCUMENT,
        content: {
          url: waMessage.documentMessage.url,
          mimetype: waMessage.documentMessage.mimetype,
          fileName: waMessage.documentMessage.fileName,
          fileLength: waMessage.documentMessage.fileLength,
        },
      };
    }

    if (waMessage.stickerMessage) {
      return {
        type: MessageType.STICKER,
        content: {
          url: waMessage.stickerMessage.url,
          mimetype: waMessage.stickerMessage.mimetype,
        },
      };
    }

    if (waMessage.locationMessage) {
      return {
        type: MessageType.LOCATION,
        content: {
          latitude: waMessage.locationMessage.degreesLatitude,
          longitude: waMessage.locationMessage.degreesLongitude,
          name: waMessage.locationMessage.name,
          address: waMessage.locationMessage.address,
        },
      };
    }

    if (waMessage.contactMessage) {
      return {
        type: MessageType.CONTACT,
        content: {
          displayName: waMessage.contactMessage.displayName,
          vcard: waMessage.contactMessage.vcard,
        },
      };
    }

    if (waMessage.reactionMessage) {
      return {
        type: MessageType.REACTION,
        content: {
          emoji: waMessage.reactionMessage.text,
          key: waMessage.reactionMessage.key,
        },
      };
    }

    // Default for unknown types
    return {
      type: MessageType.SYSTEM,
      content: { raw: JSON.stringify(waMessage) },
    };
  }

  /**
   * Get message type from media type
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
