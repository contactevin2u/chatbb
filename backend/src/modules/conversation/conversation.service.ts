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

    // Build orderBy - pinned conversations always first
    const orderBy: Prisma.ConversationOrderByWithRelationInput[] = [
      { isPinned: 'desc' }, // Pinned first
      { pinnedAt: 'desc' }, // Most recently pinned first among pinned
    ];

    // Add user-specified sort
    if (sortBy === 'lastMessageAt') {
      orderBy.push({ lastMessageAt: sortOrder });
    } else if (sortBy === 'createdAt') {
      orderBy.push({ createdAt: sortOrder });
    } else if (sortBy === 'unreadCount') {
      orderBy.push({ unreadCount: sortOrder });
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
              isGroup: true,
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
          tags: {
            include: {
              tag: {
                select: {
                  id: true,
                  name: true,
                  color: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
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
        tags: conv.tags.map((ct) => ct.tag), // Flatten tags
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
            isGroup: true,
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
   * Set active agent for a conversation (collision prevention)
   * Returns warning if another agent is currently active
   */
  async setActiveAgent(
    conversationId: string,
    userId: string,
    organizationId: string
  ): Promise<{ warning?: string; activeAgent?: { id: string; name: string } }> {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, organizationId },
      include: {
        activeAgent: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Check if another agent is active (within last 60 seconds)
    const ACTIVE_TIMEOUT_MS = 60000;

    if (
      conversation.activeAgentId &&
      conversation.activeAgentId !== userId &&
      conversation.activeAgentSince
    ) {
      const activeFor = Date.now() - conversation.activeAgentSince.getTime();

      if (activeFor < ACTIVE_TIMEOUT_MS) {
        const agentName = conversation.activeAgent
          ? `${conversation.activeAgent.firstName} ${conversation.activeAgent.lastName}`.trim()
          : 'Another agent';

        return {
          warning: `${agentName} is currently viewing this conversation`,
          activeAgent: conversation.activeAgent
            ? {
                id: conversation.activeAgent.id,
                name: agentName,
              }
            : undefined,
        };
      }
    }

    // Set this agent as active
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        activeAgentId: userId,
        activeAgentSince: new Date(),
      },
    });

    // Get user info for broadcast
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });

    // Broadcast to conversation room
    socketServer.to(`conversation:${conversationId}`).emit('agent:active', {
      conversationId,
      agentId: userId,
      agentName: `${user?.firstName} ${user?.lastName}`.trim(),
      timestamp: Date.now(),
    });

    return {};
  }

  /**
   * Clear active agent when leaving conversation
   */
  async clearActiveAgent(conversationId: string, userId: string): Promise<void> {
    await prisma.conversation.updateMany({
      where: {
        id: conversationId,
        activeAgentId: userId,
      },
      data: {
        activeAgentId: null,
        activeAgentSince: null,
      },
    });

    socketServer.to(`conversation:${conversationId}`).emit('agent:left', {
      conversationId,
      agentId: userId,
      timestamp: Date.now(),
    });
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

  /**
   * Get unreplied conversations count (last 72 hours)
   * Returns conversations where the last message is inbound and waiting for reply
   */
  async getUnrepliedCount(organizationId: string) {
    const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);

    // Find conversations where:
    // 1. Status is OPEN or PENDING
    // 2. Last message is within 72 hours
    const unrepliedConversations = await prisma.conversation.findMany({
      where: {
        organizationId,
        status: { in: [ConversationStatus.OPEN, ConversationStatus.PENDING] },
        lastMessageAt: { gte: seventyTwoHoursAgo },
      },
      include: {
        contact: {
          select: {
            id: true,
            identifier: true,
            displayName: true,
            firstName: true,
            lastName: true,
            isGroup: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            direction: true,
            createdAt: true,
            type: true,
            content: true,
          },
        },
        channel: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { lastMessageAt: 'asc' }, // Oldest first (longest waiting)
    });

    // Map to include lastMessage and filter to only those where last message is INBOUND
    const conversationsWithLastMessage = unrepliedConversations.map((c) => ({
      ...c,
      lastMessage: c.messages[0] || null,
    }));

    const waitingConversations = conversationsWithLastMessage.filter(
      (c) => c.lastMessage?.direction === 'INBOUND'
    );

    // Categorize by wait time
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

    const urgent = waitingConversations.filter(
      (c) => c.lastMessage && new Date(c.lastMessage.createdAt).getTime() < twentyFourHoursAgo
    );
    const warning = waitingConversations.filter(
      (c) =>
        c.lastMessage &&
        new Date(c.lastMessage.createdAt).getTime() >= twentyFourHoursAgo &&
        new Date(c.lastMessage.createdAt).getTime() < oneHourAgo
    );
    const recent = waitingConversations.filter(
      (c) => c.lastMessage && new Date(c.lastMessage.createdAt).getTime() >= oneHourAgo
    );

    return {
      total: waitingConversations.length,
      urgent: urgent.length,    // > 24 hours
      warning: warning.length,  // 1-24 hours
      recent: recent.length,    // < 1 hour
      conversations: waitingConversations.slice(0, 10).map((c) => ({
        id: c.id,
        contactName:
          c.contact.displayName ||
          (c.contact.firstName ? `${c.contact.firstName} ${c.contact.lastName || ''}`.trim() : null) ||
          c.contact.identifier,
        channelName: c.channel.name,
        lastMessageAt: c.lastMessageAt,
        waitMinutes: c.lastMessage ? Math.floor((now - new Date(c.lastMessage.createdAt).getTime()) / (1000 * 60)) : 0,
      })),
    };
  }

  // ==================== PIN FUNCTIONALITY ====================

  /**
   * Pin a conversation
   */
  async pinConversation(conversationId: string, organizationId: string) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, organizationId },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        isPinned: true,
        pinnedAt: new Date(),
      },
    });

    socketServer.to(`org:${organizationId}`).emit('conversation:updated', {
      id: conversationId,
      isPinned: true,
      pinnedAt: updated.pinnedAt,
    });

    return updated;
  }

  /**
   * Unpin a conversation
   */
  async unpinConversation(conversationId: string, organizationId: string) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, organizationId },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        isPinned: false,
        pinnedAt: null,
      },
    });

    socketServer.to(`org:${organizationId}`).emit('conversation:updated', {
      id: conversationId,
      isPinned: false,
      pinnedAt: null,
    });

    return updated;
  }

  // ==================== TAGS FUNCTIONALITY ====================

  /**
   * Add tag to conversation
   */
  async addTag(conversationId: string, tagId: string, organizationId: string) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, organizationId },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const tag = await prisma.tag.findFirst({
      where: { id: tagId, organizationId },
    });

    if (!tag) {
      throw new Error('Tag not found');
    }

    const conversationTag = await prisma.conversationTag.upsert({
      where: {
        conversationId_tagId: { conversationId, tagId },
      },
      create: { conversationId, tagId },
      update: {},
      include: {
        tag: true,
      },
    });

    socketServer.to(`org:${organizationId}`).emit('conversation:tag:added', {
      conversationId,
      tag: conversationTag.tag,
    });

    return conversationTag;
  }

  /**
   * Remove tag from conversation
   */
  async removeTag(conversationId: string, tagId: string, organizationId: string) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, organizationId },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    await prisma.conversationTag.delete({
      where: {
        conversationId_tagId: { conversationId, tagId },
      },
    });

    socketServer.to(`org:${organizationId}`).emit('conversation:tag:removed', {
      conversationId,
      tagId,
    });

    return { success: true };
  }

  /**
   * Get tags for a conversation
   */
  async getTags(conversationId: string, organizationId: string) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, organizationId },
      include: {
        tags: {
          include: { tag: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    return conversation.tags.map((ct) => ct.tag);
  }

  // ==================== NOTES FUNCTIONALITY ====================

  /**
   * Add note to conversation
   */
  async addNote(conversationId: string, userId: string, content: string, organizationId: string) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, organizationId },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const note = await prisma.conversationNote.create({
      data: {
        conversationId,
        userId,
        content,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });

    socketServer.to(`conversation:${conversationId}`).emit('conversation:note:added', note);

    return note;
  }

  /**
   * Update note
   */
  async updateNote(noteId: string, userId: string, content: string, organizationId: string) {
    const note = await prisma.conversationNote.findFirst({
      where: { id: noteId },
      include: {
        conversation: {
          select: { organizationId: true },
        },
      },
    });

    if (!note || note.conversation.organizationId !== organizationId) {
      throw new Error('Note not found');
    }

    // Only note author can edit
    if (note.userId !== userId) {
      throw new Error('Only the note author can edit');
    }

    const updated = await prisma.conversationNote.update({
      where: { id: noteId },
      data: { content },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });

    socketServer.to(`conversation:${note.conversationId}`).emit('conversation:note:updated', updated);

    return updated;
  }

  /**
   * Delete note
   */
  async deleteNote(noteId: string, userId: string, organizationId: string) {
    const note = await prisma.conversationNote.findFirst({
      where: { id: noteId },
      include: {
        conversation: {
          select: { organizationId: true },
        },
      },
    });

    if (!note || note.conversation.organizationId !== organizationId) {
      throw new Error('Note not found');
    }

    // Only note author can delete
    if (note.userId !== userId) {
      throw new Error('Only the note author can delete');
    }

    await prisma.conversationNote.delete({
      where: { id: noteId },
    });

    socketServer.to(`conversation:${note.conversationId}`).emit('conversation:note:deleted', {
      noteId,
      conversationId: note.conversationId,
    });

    return { success: true };
  }

  /**
   * Get notes for a conversation
   */
  async getNotes(conversationId: string, organizationId: string) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, organizationId },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const notes = await prisma.conversationNote.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });

    return notes;
  }

  // ==================== GROUP FUNCTIONALITY ====================

  /**
   * Get group participants for a conversation
   * Only works for group conversations
   *
   * Baileys GroupParticipant structure:
   * - id: string (LID or JID format)
   * - lid?: string (LID format @lid)
   * - phoneNumber?: string (PN format @s.whatsapp.net)
   * - name?: string (name you saved)
   * - notify?: string (name they set on WhatsApp)
   * - admin?: 'admin' | 'superadmin' | null
   *
   * Priority for display name:
   * 1. Our Contact database (user may have edited)
   * 2. Baileys name field (from your WhatsApp contacts)
   * 3. Baileys notify field (their WhatsApp profile name)
   * 4. Phone number (fallback)
   */
  async getGroupParticipants(conversationId: string, organizationId: string) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, organizationId },
      include: {
        contact: {
          select: { identifier: true, displayName: true, isGroup: true },
        },
        channel: {
          select: { id: true },
        },
      },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Check if this is a group using the isGroup field from database
    if (!conversation.contact.isGroup) {
      return { isGroup: false, participants: [], participantCount: 0 };
    }

    // Try to get from Redis cache
    const groupJid = `${conversation.contact.identifier}@g.us`;
    const { redisClient } = await import('../../core/cache/redis.client.js');
    const { normalizeIdentifier } = await import('../../shared/utils/identifier.js');

    try {
      const cached = await redisClient.get(`group:${groupJid}:metadata`);
      if (cached) {
        const metadata = JSON.parse(cached);
        const rawParticipants = metadata.participants || [];

        // Extract phone numbers - prefer phoneNumber field, fallback to id
        // Baileys v7: phoneNumber field contains @s.whatsapp.net format if available
        const phoneNumbers: string[] = [];
        const participantPhoneMap = new Map<string, string>(); // original id -> normalized phone

        for (const p of rawParticipants) {
          // Get phone number: prefer phoneNumber field, then extract from id
          let phoneNumber: string | null = null;

          if (p.phoneNumber) {
            // phoneNumber is in format like "1234567890@s.whatsapp.net"
            phoneNumber = normalizeIdentifier(p.phoneNumber);
          } else if (p.id && !p.id.includes('@lid')) {
            // id is in phone format (not LID)
            phoneNumber = normalizeIdentifier(p.id);
          } else if (p.id) {
            // id is LID - normalize it (we'll try to match in DB)
            phoneNumber = normalizeIdentifier(p.id);
          }

          if (phoneNumber) {
            phoneNumbers.push(phoneNumber);
            participantPhoneMap.set(p.id || '', phoneNumber);
          }
        }

        // Look up participants in contacts database
        const existingContacts = await prisma.contact.findMany({
          where: {
            organizationId,
            identifier: { in: [...new Set(phoneNumbers)] },
          },
          select: {
            identifier: true,
            displayName: true,
            avatarUrl: true,
          },
        });

        // Create a map for quick lookup
        const contactMap = new Map(
          existingContacts.map(c => [c.identifier, c])
        );

        // Build enriched participants list
        const enrichedParticipants = rawParticipants.map((p: any) => {
          const originalId = p.id || '';
          const phoneNumber = participantPhoneMap.get(originalId) || normalizeIdentifier(originalId);
          const existingContact = contactMap.get(phoneNumber);

          // Priority: DB contact name > Baileys name > Baileys notify > null
          const displayName =
            existingContact?.displayName ||
            p.name ||
            p.notify ||
            p.verifiedName ||
            null;

          return {
            id: originalId,
            identifier: phoneNumber,
            admin: p.admin || null,
            displayName,
            avatarUrl: existingContact?.avatarUrl || p.imgUrl || null,
          };
        });

        return {
          isGroup: true,
          subject: metadata.subject || 'Group Chat',
          participants: enrichedParticipants,
          participantCount: rawParticipants.length,
        };
      }
    } catch (error) {
      // Cache miss or parse error, continue
    }

    // Return basic info if no cached metadata
    return {
      isGroup: true,
      subject: conversation.contact.displayName || 'Group Chat',
      participants: [],
      participantCount: 0,
    };
  }
}

export const conversationService = new ConversationService();
