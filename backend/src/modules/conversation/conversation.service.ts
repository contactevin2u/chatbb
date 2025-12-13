/**
 * Conversation Service
 *
 * Business logic for conversation management
 */

import { ConversationStatus, Priority, Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { socketServer } from '../../core/websocket/server';

export interface ListConversationsInput {
  organizationId: string;
  status?: ConversationStatus | ConversationStatus[];
  assignedUserId?: string | null;
  channelId?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'lastMessageAt' | 'createdAt' | 'unreadCount';
  sortOrder?: 'asc' | 'desc';
}

export interface UpdateConversationInput {
  status?: ConversationStatus;
  priority?: Priority;
  assignedUserId?: string | null;
}

export class ConversationService {
  /**
   * List conversations with filters
   */
  async listConversations(input: ListConversationsInput) {
    const {
      organizationId,
      status,
      assignedUserId,
      channelId,
      search,
      limit = 50,
      offset = 0,
      sortBy = 'lastMessageAt',
      sortOrder = 'desc',
    } = input;

    const where: Prisma.ConversationWhereInput = {
      organizationId,
    };

    // Filter by status
    if (status) {
      if (Array.isArray(status)) {
        where.status = { in: status };
      } else {
        where.status = status;
      }
    }

    // Filter by assigned user
    if (assignedUserId !== undefined) {
      where.assignedUserId = assignedUserId;
    }

    // Filter by channel
    if (channelId) {
      where.channelId = channelId;
    }

    // Search by contact name or identifier
    if (search) {
      where.contact = {
        OR: [
          { displayName: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { identifier: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    // Build orderBy
    const orderBy: Prisma.ConversationOrderByWithRelationInput = {};
    if (sortBy === 'lastMessageAt') {
      orderBy.lastMessageAt = sortOrder;
    } else if (sortBy === 'createdAt') {
      orderBy.createdAt = sortOrder;
    } else if (sortBy === 'unreadCount') {
      orderBy.unreadCount = sortOrder;
    }

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        orderBy,
        take: limit,
        skip: offset,
        include: {
          contact: {
            select: {
              id: true,
              identifier: true,
              displayName: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
          channel: {
            select: {
              id: true,
              name: true,
              type: true,
              identifier: true,
            },
          },
          assignedUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              type: true,
              content: true,
              direction: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.conversation.count({ where }),
    ]);

    return {
      conversations: conversations.map((conv) => ({
        ...conv,
        lastMessage: conv.messages[0] || null,
        messages: undefined, // Remove messages array from response
      })),
      total,
      limit,
      offset,
    };
  }

  /**
   * Get a single conversation with full details
   */
  async getConversation(conversationId: string, organizationId: string) {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        organizationId,
      },
      include: {
        contact: {
          include: {
            tags: {
              include: { tag: true },
            },
            customFields: {
              include: { definition: true },
            },
          },
        },
        channel: true,
        assignedUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            role: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    return conversation;
  }

  /**
   * Update a conversation
   */
  async updateConversation(
    conversationId: string,
    organizationId: string,
    input: UpdateConversationInput
  ) {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        organizationId,
      },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const updateData: Prisma.ConversationUpdateInput = {};

    if (input.status !== undefined) {
      updateData.status = input.status;
      if (input.status === ConversationStatus.CLOSED) {
        updateData.closedAt = new Date();
      } else if (conversation.status === ConversationStatus.CLOSED) {
        updateData.closedAt = null;
      }
    }

    if (input.priority !== undefined) {
      updateData.priority = input.priority;
    }

    if (input.assignedUserId !== undefined) {
      updateData.assignedUser = input.assignedUserId
        ? { connect: { id: input.assignedUserId } }
        : { disconnect: true };
    }

    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: updateData,
      include: {
        contact: {
          select: {
            id: true,
            displayName: true,
            identifier: true,
          },
        },
        assignedUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Emit update to WebSocket
    socketServer.to(`org:${organizationId}`).emit('conversation:updated', updated);
    socketServer.to(`conversation:${conversationId}`).emit('conversation:updated', updated);

    return updated;
  }

  /**
   * Assign a conversation to a user
   */
  async assignConversation(
    conversationId: string,
    organizationId: string,
    assignedUserId: string | null
  ) {
    return this.updateConversation(conversationId, organizationId, { assignedUserId });
  }

  /**
   * Close a conversation
   */
  async closeConversation(conversationId: string, organizationId: string) {
    return this.updateConversation(conversationId, organizationId, {
      status: ConversationStatus.CLOSED,
    });
  }

  /**
   * Reopen a conversation
   */
  async reopenConversation(conversationId: string, organizationId: string) {
    return this.updateConversation(conversationId, organizationId, {
      status: ConversationStatus.OPEN,
    });
  }

  /**
   * Mark conversation as read (reset unread count)
   */
  async markAsRead(conversationId: string, organizationId: string) {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        organizationId,
      },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: { unreadCount: 0 },
    });

    socketServer.to(`org:${organizationId}`).emit('conversation:read', {
      conversationId,
      unreadCount: 0,
    });

    return updated;
  }

  /**
   * Get conversation statistics
   */
  async getStats(organizationId: string) {
    const [open, pending, resolved, closed, unassigned] = await Promise.all([
      prisma.conversation.count({
        where: { organizationId, status: ConversationStatus.OPEN },
      }),
      prisma.conversation.count({
        where: { organizationId, status: ConversationStatus.PENDING },
      }),
      prisma.conversation.count({
        where: { organizationId, status: ConversationStatus.RESOLVED },
      }),
      prisma.conversation.count({
        where: { organizationId, status: ConversationStatus.CLOSED },
      }),
      prisma.conversation.count({
        where: {
          organizationId,
          status: { in: [ConversationStatus.OPEN, ConversationStatus.PENDING] },
          assignedUserId: null,
        },
      }),
    ]);

    return {
      open,
      pending,
      resolved,
      closed,
      unassigned,
      total: open + pending + resolved + closed,
    };
  }
}

export const conversationService = new ConversationService();
