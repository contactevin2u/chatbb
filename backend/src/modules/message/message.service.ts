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

    // Reverse to get chronological order
    const sortedMessages = messages.reverse();

    return {
      messages: sortedMessages,
      hasMore: messages.length === limit,
      oldestId: sortedMessages[0]?.id,
      newestId: sortedMessages[sortedMessages.length - 1]?.id,
    };
  }

  /**
   * Send a message
   */
  async sendMessage(input: SendMessageInput) {
    const { conversationId, organizationId, userId, text, media } = input;

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

    // Create message record
    const message = await prisma.message.create({
      data: {
        conversationId,
        channelId: conversation.channelId,
        direction: MessageDirection.OUTBOUND,
        type: messageType,
        content: text ? { text } : { media },
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
          media
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
}

export const messageService = new MessageService();
