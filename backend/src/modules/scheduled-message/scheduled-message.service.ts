/**
 * Scheduled Message Service
 *
 * Business logic for scheduling messages to be sent later
 */

import { ScheduledMessageStatus } from '@prisma/client';
import { prisma } from '../../core/database/prisma';

export interface ScheduledMessageContent {
  text?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  mediaUrl?: string;
  mediaFilename?: string;
}

export interface CreateScheduledMessageInput {
  organizationId: string;
  conversationId: string;
  createdById: string;
  content: ScheduledMessageContent;
  scheduledAt: Date;
}

export class ScheduledMessageService {
  /**
   * Create a new scheduled message
   */
  async createScheduledMessage(input: CreateScheduledMessageInput) {
    const { organizationId, conversationId, createdById, content, scheduledAt } = input;

    // Validate conversation exists and belongs to org
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, organizationId },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Validate scheduled time is in the future
    if (scheduledAt <= new Date()) {
      throw new Error('Scheduled time must be in the future');
    }

    const scheduledMessage = await prisma.scheduledMessage.create({
      data: {
        organizationId,
        conversationId,
        createdById,
        content: content as any,
        scheduledAt,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return scheduledMessage;
  }

  /**
   * List scheduled messages for a conversation
   */
  async listForConversation(conversationId: string, organizationId: string) {
    const scheduledMessages = await prisma.scheduledMessage.findMany({
      where: {
        conversationId,
        organizationId,
        status: ScheduledMessageStatus.PENDING,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    return scheduledMessages;
  }

  /**
   * Get a scheduled message by ID
   */
  async getScheduledMessage(id: string, organizationId: string) {
    const scheduledMessage = await prisma.scheduledMessage.findFirst({
      where: { id, organizationId },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        conversation: {
          select: {
            id: true,
            contact: {
              select: {
                id: true,
                identifier: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    if (!scheduledMessage) {
      throw new Error('Scheduled message not found');
    }

    return scheduledMessage;
  }

  /**
   * Cancel a scheduled message
   */
  async cancelScheduledMessage(id: string, organizationId: string) {
    const scheduledMessage = await prisma.scheduledMessage.findFirst({
      where: { id, organizationId },
    });

    if (!scheduledMessage) {
      throw new Error('Scheduled message not found');
    }

    if (scheduledMessage.status !== ScheduledMessageStatus.PENDING) {
      throw new Error('Cannot cancel a message that is not pending');
    }

    const updated = await prisma.scheduledMessage.update({
      where: { id },
      data: { status: ScheduledMessageStatus.CANCELLED },
    });

    return updated;
  }

  /**
   * Update scheduled message time
   */
  async updateScheduledTime(id: string, organizationId: string, scheduledAt: Date) {
    const scheduledMessage = await prisma.scheduledMessage.findFirst({
      where: { id, organizationId },
    });

    if (!scheduledMessage) {
      throw new Error('Scheduled message not found');
    }

    if (scheduledMessage.status !== ScheduledMessageStatus.PENDING) {
      throw new Error('Cannot update a message that is not pending');
    }

    if (scheduledAt <= new Date()) {
      throw new Error('Scheduled time must be in the future');
    }

    const updated = await prisma.scheduledMessage.update({
      where: { id },
      data: { scheduledAt },
    });

    return updated;
  }

  /**
   * Get pending messages that are due to be sent
   */
  async getPendingDueMessages() {
    const now = new Date();

    const pendingMessages = await prisma.scheduledMessage.findMany({
      where: {
        status: ScheduledMessageStatus.PENDING,
        scheduledAt: { lte: now },
      },
      include: {
        conversation: {
          select: {
            id: true,
            channelId: true,
            contact: {
              select: {
                id: true,
                identifier: true,
              },
            },
            channel: {
              select: {
                id: true,
                type: true,
                config: true,
              },
            },
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 100, // Process in batches
    });

    return pendingMessages;
  }

  /**
   * Mark a scheduled message as sent
   */
  async markAsSent(id: string) {
    await prisma.scheduledMessage.update({
      where: { id },
      data: {
        status: ScheduledMessageStatus.SENT,
        sentAt: new Date(),
      },
    });
  }

  /**
   * Mark a scheduled message as failed
   */
  async markAsFailed(id: string, errorMessage: string) {
    await prisma.scheduledMessage.update({
      where: { id },
      data: {
        status: ScheduledMessageStatus.FAILED,
        errorMessage,
      },
    });
  }
}

export const scheduledMessageService = new ScheduledMessageService();
