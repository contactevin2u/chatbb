/**
 * Message Service
 *
 * Business logic for message operations
 */

import { MessageDirection, MessageStatus, MessageType, Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { socketServer, emitToOrgExceptUser, emitToConversation } from '../../core/websocket/server';
import { whatsappService } from '../whatsapp/whatsapp.service';

export interface GetMessagesInput {
  conversationId: string;
  organizationId: string;
  limit?: number;
  before?: string; // Message ID for pagination
  after?: string; // Message ID for pagination
}

export interface SendMessageInput {
  conversationId: string;
  organizationId: string;
  userId: string;
  text?: string;
  media?: {
    type: 'image' | 'video' | 'audio' | 'document';
    url?: string;
    buffer?: Buffer;
    mimetype?: string;
    filename?: string;
    caption?: string;
  };
  quotedMessageId?: string;
}

export class MessageService {
  /**
   * Get messages for a conversation with pagination
   */
  async getMessages(input: GetMessagesInput) {
    const { conversationId, organizationId, limit = 50, before, after } = input;

    // Verify conversation belongs to organization
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        organizationId,
      },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const where: Prisma.MessageWhereInput = {
      conversationId,
    };

    // Cursor-based pagination
    if (before) {
      const beforeMessage = await prisma.message.findUnique({
        where: { id: before },
        select: { createdAt: true },
      });
      if (beforeMessage) {
        where.createdAt = { lt: beforeMessage.createdAt };
      }
    }

    if (after) {
      const afterMessage = await prisma.message.findUnique({
        where: { id: after },
        select: { createdAt: true },
      });
      if (afterMessage) {
        where.createdAt = { gt: afterMessage.createdAt };
      }
    }

    const messages = await prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        sentByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        attachments: true,
      },
    });

    // Enrich group sender metadata with contact info
    const enrichedMessages = await this.enrichGroupSenderInfo(messages, organizationId);

    // Reverse to get chronological order
    const sortedMessages = enrichedMessages.reverse();

    return {
      messages: sortedMessages,
      hasMore: messages.length === limit,
      oldestId: sortedMessages[0]?.id,
      newestId: sortedMessages[sortedMessages.length - 1]?.id,
    };
  }

  /**
   * Enrich group sender metadata with contact info (displayName, avatarUrl)
   */
  private async enrichGroupSenderInfo(messages: any[], organizationId: string) {
    // Extract unique group sender identifiers
    const senderIdentifiers = new Set<string>();
    for (const msg of messages) {
      const groupSender = (msg.metadata as any)?.groupSender;
      if (groupSender?.identifier) {
        senderIdentifiers.add(groupSender.identifier);
      }
    }

    if (senderIdentifiers.size === 0) {
      return messages;
    }

    // Look up contacts in database
    const contacts = await prisma.contact.findMany({
      where: {
        organizationId,
        identifier: { in: Array.from(senderIdentifiers) },
      },
      select: {
        identifier: true,
        displayName: true,
        avatarUrl: true,
      },
    });

    // Create lookup map
    const contactMap = new Map(
      contacts.map(c => [c.identifier, c])
    );

    // Enrich messages with contact info
    return messages.map(msg => {
      const metadata = msg.metadata as any;
      if (metadata?.groupSender?.identifier) {
        const contact = contactMap.get(metadata.groupSender.identifier);
        if (contact) {
          return {
            ...msg,
            metadata: {
              ...metadata,
              groupSender: {
                ...metadata.groupSender,
                displayName: contact.displayName,
                avatarUrl: contact.avatarUrl,
              },
            },
          };
        }
      }
      return msg;
    });
  }

  /**
   * Send a message
   */
  async sendMessage(input: SendMessageInput) {
    const { conversationId, organizationId, userId, text, media, quotedMessageId } = input;

    // Get conversation with channel info
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        organizationId,
      },
      include: {
        channel: true,
        contact: true,
      },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Determine message type
    let messageType: MessageType = MessageType.TEXT;
    if (media) {
      const typeMap: Record<string, MessageType> = {
        image: MessageType.IMAGE,
        video: MessageType.VIDEO,
        audio: MessageType.AUDIO,
        document: MessageType.DOCUMENT,
      };
      messageType = typeMap[media.type] || MessageType.TEXT;
    }

    // Build message content
    let messageContent: any = {};
    if (text) {
      messageContent.text = text;
    }
    if (media) {
      messageContent.mediaType = media.type;
      messageContent.mediaUrl = media.url;
      messageContent.mimeType = media.mimetype;
      messageContent.fileName = media.filename;
      // For media with caption, text is stored as caption
      if (text) {
        messageContent.caption = text;
      }
    }
    if (quotedMessageId) {
      messageContent.quotedMessageId = quotedMessageId;
    }

    // Create message record
    const message = await prisma.message.create({
      data: {
        conversationId,
        channelId: conversation.channelId,
        direction: MessageDirection.OUTBOUND,
        type: messageType,
        content: messageContent,
        status: MessageStatus.PENDING,
        sentByUserId: userId,
      },
      include: {
        sentByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Send via channel provider
    try {
      let externalId: string | undefined;

      if (conversation.channel.type === 'WHATSAPP') {
        // Send via WhatsApp using whatsappService (sends command to WhatsApp Worker via Redis)
        const recipient = conversation.contact.identifier;

        // Use low-level method since we're already handling DB operations here
        const result = await whatsappService.sendMessageRaw(
          conversation.channelId,
          recipient,
          text,
          media,
          { quotedMessageId }
        );
        externalId = result.externalId;
      }

      // Update message with external ID and sent status
      const updatedMessage = await prisma.message.update({
        where: { id: message.id },
        data: {
          externalId,
          status: MessageStatus.SENT,
          sentAt: new Date(),
        },
        include: {
          sentByUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
        },
      });

      // Update conversation
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      });

      // Emit to WebSocket - exclude sender to prevent duplicate UI updates
      // Sender already has the message from mutation's onSuccess
      emitToOrgExceptUser(organizationId, userId, 'message:new', {
        message: updatedMessage,
        conversationId,
      });
      // Also emit to conversation room for users viewing it (sender excluded via their user room)
      emitToConversation(conversationId, 'message:new', {
        message: updatedMessage,
      });

      return updatedMessage;
    } catch (error) {
      // Mark message as failed
      const failedMessage = await prisma.message.update({
        where: { id: message.id },
        data: {
          status: MessageStatus.FAILED,
          failedReason: (error as Error).message,
        },
        include: {
          sentByUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
        },
      });

      // Still emit the failed message
      socketServer.to(`conversation:${conversationId}`).emit('message:new', {
        message: failedMessage,
      });

      throw error;
    }
  }

  /**
   * Get a single message
   */
  async getMessage(messageId: string, organizationId: string) {
    const message = await prisma.message.findFirst({
      where: {
        id: messageId,
        conversation: {
          organizationId,
        },
      },
      include: {
        sentByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        attachments: true,
        conversation: {
          select: {
            id: true,
            contactId: true,
          },
        },
      },
    });

    if (!message) {
      throw new Error('Message not found');
    }

    return message;
  }

  /**
   * Update message status
   */
  async updateMessageStatus(
    messageId: string,
    status: MessageStatus,
    timestamp?: Date
  ) {
    const updateData: Prisma.MessageUpdateInput = { status };

    if (status === MessageStatus.DELIVERED && timestamp) {
      updateData.deliveredAt = timestamp;
    } else if (status === MessageStatus.READ && timestamp) {
      updateData.readAt = timestamp;
    }

    const message = await prisma.message.update({
      where: { id: messageId },
      data: updateData,
    });

    // Emit status update
    socketServer.to(`conversation:${message.conversationId}`).emit('message:status', {
      messageId: message.id,
      status: message.status,
      deliveredAt: message.deliveredAt,
      readAt: message.readAt,
    });

    return message;
  }

  /**
   * Delete a message (soft delete / mark as deleted)
   */
  async deleteMessage(messageId: string, organizationId: string) {
    const message = await prisma.message.findFirst({
      where: {
        id: messageId,
        conversation: {
          organizationId,
        },
      },
    });

    if (!message) {
      throw new Error('Message not found');
    }

    // Update message content to indicate deletion
    const deletedMessage = await prisma.message.update({
      where: { id: messageId },
      data: {
        content: { deleted: true, originalType: message.type },
        type: MessageType.SYSTEM,
      },
    });

    socketServer.to(`conversation:${message.conversationId}`).emit('message:deleted', {
      messageId: message.id,
    });

    return deletedMessage;
  }

  /**
   * React to a message
   * Sends reaction via WhatsApp and stores it locally
   */
  async reactToMessage(messageId: string, organizationId: string, emoji: string) {
    // Find the message with its conversation and channel info
    const message = await prisma.message.findFirst({
      where: {
        id: messageId,
        conversation: {
          organizationId,
        },
      },
      include: {
        conversation: {
          include: {
            channel: true,
            contact: true,
          },
        },
      },
    });

    if (!message) {
      throw new Error('Message not found');
    }

    if (!message.externalId) {
      throw new Error('Cannot react to this message (no external ID)');
    }

    if (message.conversation.channel.type !== 'WHATSAPP') {
      throw new Error('Reactions are only supported for WhatsApp messages');
    }

    // Build message key for the reaction
    const recipient = message.conversation.contact.identifier;
    const messageKey = {
      remoteJid: `${recipient}@s.whatsapp.net`,
      id: message.externalId,
      fromMe: message.direction === MessageDirection.OUTBOUND,
    };

    // Send reaction via WhatsApp
    await whatsappService.sendMessageRaw(
      message.conversation.channelId,
      recipient,
      undefined,
      undefined,
      { reaction: { messageKey, emoji } }
    );

    // Update local message metadata with our reaction
    const currentMetadata = (message.metadata as any) || {};
    const reactions = currentMetadata.reactions || [];

    // Remove any existing reaction from "me" (the business/agent)
    const filteredReactions = reactions.filter((r: any) => r.senderId !== 'me');

    if (emoji) {
      filteredReactions.push({
        emoji,
        senderId: 'me',
        timestamp: Date.now(),
      });
    }

    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: {
        metadata: { ...currentMetadata, reactions: filteredReactions },
      },
    });

    // Emit reaction update to conversation
    socketServer.to(`conversation:${message.conversationId}`).emit('message:reaction', {
      messageId: message.id,
      emoji,
      reactions: filteredReactions,
    });

    return {
      messageId: message.id,
      emoji,
      reactions: filteredReactions,
    };
  }
}

export const messageService = new MessageService();
