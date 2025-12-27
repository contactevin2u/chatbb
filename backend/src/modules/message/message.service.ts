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
  organizationId?: string;
  userId?: string;
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
  isAIGenerated?: boolean;
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
   * Send a message (optimized for speed)
   */
  async sendMessage(input: SendMessageInput) {
    const { conversationId, organizationId, userId, text, media, quotedMessageId, isAIGenerated } = input;

    // Get conversation with channel info
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        ...(organizationId && { organizationId }),
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

    // Build proper JID based on whether this is a group or individual chat
    const isGroup = conversation.contact.isGroup;
    const recipient = isGroup
      ? `${conversation.contact.identifier}@g.us`
      : `${conversation.contact.identifier}@s.whatsapp.net`;

    // Start WhatsApp send in parallel with DB record creation
    // Wrap the promise to prevent unhandled rejection crashes (e.g., rate limit errors)
    // The error is captured and re-thrown when awaited
    type SendResult = { externalId: string | undefined };
    type SendOutcome = { success: true; result: SendResult } | { success: false; error: Error };

    const sendPromise: Promise<SendOutcome> = conversation.channel.type === 'WHATSAPP'
      ? whatsappService.sendMessageRaw(
          conversation.channelId,
          recipient,
          text,
          media,
          { quotedMessageId }
        ).then((result): SendOutcome => ({ success: true, result }))
         .catch((err): SendOutcome => ({ success: false, error: err }))
      : Promise.resolve({ success: true, result: { externalId: undefined } } as SendOutcome);

    // Create message record in parallel with sending
    const message = await prisma.message.create({
      data: {
        conversationId,
        channelId: conversation.channelId,
        direction: MessageDirection.OUTBOUND,
        type: messageType,
        content: messageContent,
        status: MessageStatus.PENDING,
        sentByUserId: userId || null,
        isAIGenerated: isAIGenerated || false,
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

    // Now wait for send to complete
    const sendOutcome = await sendPromise;

    // If send failed, handle the error
    if (!sendOutcome.success) {
      const error = (sendOutcome as { success: false; error: Error }).error;
      // Mark message as failed
      const failedMessage = await prisma.message.update({
        where: { id: message.id },
        data: {
          status: MessageStatus.FAILED,
          failedReason: error.message,
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

    try {
      const externalId = sendOutcome.result.externalId;

      // Update message and conversation in parallel
      const [updatedMessage] = await Promise.all([
        prisma.message.update({
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
        }),
        prisma.conversation.update({
          where: { id: conversationId },
          data: { lastMessageAt: new Date() },
        }),
      ]);

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
   * Edit a message
   * Sends edit via WhatsApp and updates locally
   */
  async editMessage(messageId: string, organizationId: string, newText: string) {
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
      throw new Error('Cannot edit this message (no external ID)');
    }

    if (message.direction !== MessageDirection.OUTBOUND) {
      throw new Error('Can only edit outbound messages');
    }

    if (message.conversation.channel.type !== 'WHATSAPP') {
      throw new Error('Edit is only supported for WhatsApp messages');
    }

    // Build message key for the edit
    const recipient = message.conversation.contact.identifier;
    const isGroup = message.conversation.contact.isGroup;
    const messageKey = {
      remoteJid: isGroup ? `${recipient}@g.us` : `${recipient}@s.whatsapp.net`,
      id: message.externalId,
      fromMe: true,
    };

    // Send edit via WhatsApp
    await whatsappService.editMessage(
      message.conversation.channelId,
      messageKey,
      newText
    );

    // Update local message
    const currentContent = message.content as any || {};
    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: {
        content: {
          ...currentContent,
          text: newText,
          edited: true,
          editedAt: new Date().toISOString(),
        },
      },
    });

    // Emit update to conversation
    socketServer.to(`conversation:${message.conversationId}`).emit('message:edited', {
      messageId: message.id,
      newText,
      editedAt: new Date().toISOString(),
    });

    return updatedMessage;
  }

  /**
   * Send a poll
   */
  async sendPoll(input: {
    conversationId: string;
    organizationId: string;
    userId: string;
    name: string;
    options: string[];
    selectableCount?: number;
  }) {
    const { conversationId, organizationId, userId, name, options, selectableCount = 1 } = input;

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

    if (conversation.channel.type !== 'WHATSAPP') {
      throw new Error('Polls are only supported for WhatsApp');
    }

    // Create message record
    const message = await prisma.message.create({
      data: {
        conversationId,
        channelId: conversation.channelId,
        direction: MessageDirection.OUTBOUND,
        type: MessageType.INTERACTIVE,
        content: {
          poll: { name, options, selectableCount },
        },
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

    try {
      // Build proper JID based on whether this is a group or individual chat
      const isGroup = conversation.contact.isGroup;
      const recipient = isGroup
        ? `${conversation.contact.identifier}@g.us`
        : `${conversation.contact.identifier}@s.whatsapp.net`;

      // Send poll via WhatsApp
      const result = await whatsappService.sendPoll(
        conversation.channelId,
        recipient,
        { name, options, selectableCount }
      );

      // Update message with external ID
      const updatedMessage = await prisma.message.update({
        where: { id: message.id },
        data: {
          externalId: result?.key?.id,
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

      // Update conversation lastMessageAt
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      });

      // Emit to WebSocket
      socketServer.to(`conversation:${conversationId}`).emit('message:new', {
        message: updatedMessage,
      });

      return updatedMessage;
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
   * Delete a message via WhatsApp (delete for everyone)
   */
  async deleteMessageForEveryone(messageId: string, organizationId: string) {
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
      throw new Error('Cannot delete this message (no external ID)');
    }

    if (message.direction !== MessageDirection.OUTBOUND) {
      throw new Error('Can only delete outbound messages');
    }

    if (message.conversation.channel.type !== 'WHATSAPP') {
      throw new Error('Delete for everyone is only supported for WhatsApp');
    }

    // Build message key
    const recipient = message.conversation.contact.identifier;
    const isGroup = message.conversation.contact.isGroup;
    const messageKey = {
      remoteJid: isGroup ? `${recipient}@g.us` : `${recipient}@s.whatsapp.net`,
      id: message.externalId,
      fromMe: true,
    };

    // Delete via WhatsApp
    await whatsappService.deleteMessage(message.conversation.channelId, messageKey);

    // Update local message
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
   * Forward a message to another conversation
   * Supports forwarding to the same channel or different channels within the same organization
   */
  async forwardMessage(
    messageId: string,
    targetConversationId: string,
    organizationId: string,
    userId: string
  ) {
    // Find the original message with its content
    const originalMessage = await prisma.message.findFirst({
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

    if (!originalMessage) {
      throw new Error('Message not found');
    }

    if (!originalMessage.externalId) {
      throw new Error('Cannot forward this message (no external ID)');
    }

    // Find target conversation
    const targetConversation = await prisma.conversation.findFirst({
      where: {
        id: targetConversationId,
        organizationId,
      },
      include: {
        channel: true,
        contact: true,
      },
    });

    if (!targetConversation) {
      throw new Error('Target conversation not found');
    }

    if (targetConversation.channel.type !== 'WHATSAPP') {
      throw new Error('Message forwarding is only supported for WhatsApp conversations');
    }

    // Build the WhatsApp message object for forwarding
    // Baileys needs the original WAMessage structure
    const recipient = targetConversation.contact.identifier;
    const isGroup = targetConversation.contact.isGroup;
    const originalRemoteJid = originalMessage.conversation.contact.isGroup
      ? `${originalMessage.conversation.contact.identifier}@g.us`
      : `${originalMessage.conversation.contact.identifier}@s.whatsapp.net`;

    // Reconstruct WAMessage structure from stored content
    const waMessage = {
      key: {
        remoteJid: originalRemoteJid,
        id: originalMessage.externalId,
        fromMe: originalMessage.direction === MessageDirection.OUTBOUND,
      },
      message: (originalMessage.content as any)?.message || originalMessage.content,
    };

    // Create pending message record
    const pendingMessage = await prisma.message.create({
      data: {
        conversationId: targetConversationId,
        channelId: targetConversation.channelId,
        direction: MessageDirection.OUTBOUND,
        type: originalMessage.type,
        content: {
          ...originalMessage.content as any,
          forwarded: true,
          forwardedFrom: messageId,
        },
        status: MessageStatus.PENDING,
        sentByUserId: userId,
      },
    });

    // Emit pending message to UI for immediate feedback
    socketServer.to(`conversation:${targetConversationId}`).emit('message:pending', {
      ...pendingMessage,
      sentByUser: await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      }),
    });

    try {
      // Forward via WhatsApp
      const targetJid = isGroup
        ? `${recipient}@g.us`
        : `${recipient}@s.whatsapp.net`;

      const result = await whatsappService.forwardMessage(
        targetConversation.channelId,
        waMessage,
        targetJid
      );

      // Update message with external ID and sent status
      const sentMessage = await prisma.message.update({
        where: { id: pendingMessage.id },
        data: {
          externalId: result.externalId,
          status: MessageStatus.SENT,
          sentAt: new Date(),
        },
        include: {
          sentByUser: {
            select: { firstName: true, lastName: true },
          },
        },
      });

      // Update conversation last message time
      await prisma.conversation.update({
        where: { id: targetConversationId },
        data: { lastMessageAt: new Date() },
      });

      // Emit message sent event
      socketServer.to(`conversation:${targetConversationId}`).emit('message:new', sentMessage);

      return {
        messageId: sentMessage.id,
        externalId: result.externalId,
        status: 'SENT',
        targetConversationId,
      };
    } catch (error) {
      // Mark message as failed
      await prisma.message.update({
        where: { id: pendingMessage.id },
        data: {
          status: MessageStatus.FAILED,
          failedReason: (error as Error).message,
        },
      });

      throw error;
    }
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
    const isGroup = message.conversation.contact.isGroup;
    const remoteJid = isGroup
      ? `${recipient}@g.us`
      : `${recipient}@s.whatsapp.net`;

    const messageKey = {
      remoteJid,
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

  /**
   * Get the oldest message in a conversation with data needed to reconstruct WhatsApp key
   * Used as anchor for on-demand history fetch
   * Prefers INBOUND messages as WhatsApp may reject OUTBOUND anchors (error 479)
   */
  async getOldestMessage(conversationId: string) {
    // First try to get oldest INBOUND message (preferred for fetch history)
    const inboundMessage = await prisma.message.findFirst({
      where: { conversationId, direction: 'INBOUND' },
      orderBy: { createdAt: 'asc' },
      include: {
        conversation: {
          include: {
            contact: {
              select: { identifier: true, isGroup: true },
            },
          },
        },
      },
    });

    if (inboundMessage) {
      return inboundMessage;
    }

    // Fall back to any oldest message if no inbound messages exist
    return await prisma.message.findFirst({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      include: {
        conversation: {
          include: {
            contact: {
              select: { identifier: true, isGroup: true },
            },
          },
        },
      },
    });
  }
}

export const messageService = new MessageService();
