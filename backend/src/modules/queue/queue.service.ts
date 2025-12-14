/**
 * Queue Service
 *
 * Business logic for conversation queue management and auto-assignment
 */

import { ConversationStatus, Priority, AgentAvailability, Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { socketServer } from '../../core/websocket/server';

// ==================== TYPES ====================

export type AssignmentMode = 'MANUAL' | 'ROUND_ROBIN' | 'LOAD_BALANCED' | 'TEAM_BASED';

export interface QueueConfig {
  assignmentMode: AssignmentMode;
  autoAssignOnNewMessage: boolean;
}

export interface QueueStats {
  waiting: number;
  avgWaitTime: number; // seconds
  onlineAgents: number;
  totalAgents: number;
  handledToday: number;
}

export interface UnassignedConversation {
  id: string;
  priority: Priority;
  contactName: string;
  contactIdentifier: string;
  channelName: string;
  channelType: string;
  waitingTime: number; // seconds
  unreadCount: number;
  createdAt: Date;
  lastMessageAt: Date | null;
}

// ==================== QUEUE SERVICE ====================

export class QueueService {
  // ==================== QUEUE OPERATIONS ====================

  /**
   * Get unassigned conversations queue (sorted by priority + wait time)
   */
  async getUnassignedQueue(
    organizationId: string,
    channelId?: string,
    limit: number = 50
  ): Promise<UnassignedConversation[]> {
    const where: Prisma.ConversationWhereInput = {
      organizationId,
      assignedUserId: null,
      status: { in: ['OPEN', 'PENDING'] },
      // Also check for conversations with no agents assigned
      agents: { none: {} },
    };

    if (channelId) {
      where.channelId = channelId;
    }

    const conversations = await prisma.conversation.findMany({
      where,
      orderBy: [
        { priority: 'desc' }, // URGENT > HIGH > NORMAL > LOW
        { createdAt: 'asc' }, // Oldest first (FIFO)
      ],
      take: limit,
      include: {
        contact: {
          select: {
            displayName: true,
            firstName: true,
            lastName: true,
            identifier: true,
          },
        },
        channel: {
          select: {
            name: true,
            type: true,
          },
        },
      },
    });

    const now = Date.now();

    return conversations.map((conv) => ({
      id: conv.id,
      priority: conv.priority,
      contactName:
        conv.contact.displayName ||
        [conv.contact.firstName, conv.contact.lastName].filter(Boolean).join(' ') ||
        conv.contact.identifier,
      contactIdentifier: conv.contact.identifier,
      channelName: conv.channel.name,
      channelType: conv.channel.type,
      waitingTime: Math.floor((now - conv.createdAt.getTime()) / 1000),
      unreadCount: conv.unreadCount,
      createdAt: conv.createdAt,
      lastMessageAt: conv.lastMessageAt,
    }));
  }

  /**
   * Get the next conversation in queue (highest priority, oldest)
   */
  async getNextConversation(organizationId: string, channelId?: string) {
    const queue = await this.getUnassignedQueue(organizationId, channelId, 1);
    return queue[0] || null;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(organizationId: string): Promise<QueueStats> {
    const [
      waitingCount,
      onlineAgents,
      totalAgents,
      handledToday,
      oldestWaiting,
    ] = await Promise.all([
      // Count waiting conversations
      prisma.conversation.count({
        where: {
          organizationId,
          assignedUserId: null,
          status: { in: ['OPEN', 'PENDING'] },
          agents: { none: {} },
        },
      }),
      // Count online agents
      prisma.user.count({
        where: {
          organizationId,
          status: 'ACTIVE',
          availabilityStatus: 'ONLINE',
        },
      }),
      // Count total active agents
      prisma.user.count({
        where: {
          organizationId,
          status: 'ACTIVE',
        },
      }),
      // Count conversations handled today
      prisma.conversation.count({
        where: {
          organizationId,
          assignedUserId: { not: null },
          updatedAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      // Get oldest waiting conversation
      prisma.conversation.findFirst({
        where: {
          organizationId,
          assignedUserId: null,
          status: { in: ['OPEN', 'PENDING'] },
          agents: { none: {} },
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);

    // Calculate average wait time
    let avgWaitTime = 0;
    if (oldestWaiting && waitingCount > 0) {
      const totalWaitMs = Date.now() - oldestWaiting.createdAt.getTime();
      avgWaitTime = Math.floor(totalWaitMs / 1000 / waitingCount);
    }

    return {
      waiting: waitingCount,
      avgWaitTime,
      onlineAgents,
      totalAgents,
      handledToday,
    };
  }

  // ==================== AGENT ASSIGNMENT ====================

  /**
   * Assign an agent to a conversation (add to collaborative list)
   */
  async assignAgent(
    conversationId: string,
    userId: string,
    organizationId: string,
    isPrimary: boolean = false,
    assignedById?: string
  ) {
    // Verify conversation belongs to organization
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, organizationId },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // If setting as primary, demote other primary agents
    if (isPrimary) {
      await prisma.conversationAgent.updateMany({
        where: { conversationId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    // Add agent to conversation
    const assignment = await prisma.conversationAgent.upsert({
      where: {
        conversationId_userId: { conversationId, userId },
      },
      create: {
        conversationId,
        userId,
        isPrimary,
        assignedById,
      },
      update: {
        isPrimary,
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

    // Also update the legacy assignedUserId field for backward compatibility
    if (isPrimary || !(await this.hasPrimaryAgent(conversationId))) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { assignedUserId: userId },
      });
    }

    // Broadcast assignment
    this.emitAssignmentChange(organizationId, conversationId, 'assigned', assignment);

    return assignment;
  }

  /**
   * Unassign an agent from a conversation
   */
  async unassignAgent(conversationId: string, userId: string, organizationId: string) {
    // Verify conversation belongs to organization
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, organizationId },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const assignment = await prisma.conversationAgent.delete({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    // If this was the primary agent, update legacy field
    if (conversation.assignedUserId === userId) {
      // Find another agent to be primary, or set to null
      const otherAgent = await prisma.conversationAgent.findFirst({
        where: { conversationId },
        orderBy: { assignedAt: 'asc' },
      });

      await prisma.conversation.update({
        where: { id: conversationId },
        data: { assignedUserId: otherAgent?.userId || null },
      });

      if (otherAgent) {
        await prisma.conversationAgent.update({
          where: { id: otherAgent.id },
          data: { isPrimary: true },
        });
      }
    }

    // Broadcast unassignment
    this.emitAssignmentChange(organizationId, conversationId, 'unassigned', { userId });

    return { success: true };
  }

  /**
   * Set primary agent for a conversation
   */
  async setPrimaryAgent(conversationId: string, userId: string, organizationId: string) {
    // Demote current primary
    await prisma.conversationAgent.updateMany({
      where: { conversationId, isPrimary: true },
      data: { isPrimary: false },
    });

    // Set new primary
    const assignment = await prisma.conversationAgent.update({
      where: {
        conversationId_userId: { conversationId, userId },
      },
      data: { isPrimary: true },
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

    // Update legacy field
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { assignedUserId: userId },
    });

    // Broadcast primary change
    this.emitAssignmentChange(organizationId, conversationId, 'primary_changed', assignment);

    return assignment;
  }

  /**
   * "Take" a conversation from the queue (self-assign)
   */
  async takeConversation(conversationId: string, userId: string, organizationId: string) {
    return this.assignAgent(conversationId, userId, organizationId, true, userId);
  }

  // ==================== AUTO-ASSIGNMENT ====================

  /**
   * Auto-assign a conversation based on organization's assignment mode
   */
  async autoAssign(
    conversationId: string,
    organizationId: string,
    channelId: string,
    mode: AssignmentMode = 'LOAD_BALANCED'
  ) {
    let agent = null;

    switch (mode) {
      case 'ROUND_ROBIN':
        agent = await this.getNextAgentRoundRobin(organizationId, channelId);
        break;
      case 'LOAD_BALANCED':
        agent = await this.getLeastLoadedAgent(organizationId, channelId);
        break;
      case 'TEAM_BASED':
        agent = await this.getTeamAgent(channelId, organizationId);
        break;
      case 'MANUAL':
      default:
        // No auto-assignment
        return null;
    }

    if (agent) {
      return this.assignAgent(conversationId, agent.id, organizationId, true);
    }

    return null;
  }

  /**
   * Round-robin assignment: falls back to load-balanced (simplest fair distribution)
   */
  async getNextAgentRoundRobin(organizationId: string, channelId?: string) {
    // Use load-balanced as a simple fair distribution
    return this.getLeastLoadedAgent(organizationId, channelId);
  }

  /**
   * Load-balanced assignment: get agent with fewest open conversations
   */
  async getLeastLoadedAgent(organizationId: string, channelId?: string) {
    const agents = await this.getAvailableAgentsForChannel(organizationId, channelId);

    if (agents.length === 0) return null;

    // Get conversation counts for each agent
    const agentsWithCounts = await Promise.all(
      agents.map(async (agent) => {
        const count = await prisma.conversation.count({
          where: {
            organizationId,
            status: { in: ['OPEN', 'PENDING'] },
            OR: [
              { assignedUserId: agent.id },
              { agents: { some: { userId: agent.id } } },
            ],
          },
        });
        return { ...agent, conversationCount: count };
      })
    );

    // Sort by conversation count (ascending)
    agentsWithCounts.sort((a, b) => a.conversationCount - b.conversationCount);

    return agentsWithCounts[0];
  }

  /**
   * Team-based assignment: get agent from team assigned to channel
   */
  async getTeamAgent(channelId: string, organizationId: string) {
    // Get teams assigned to this channel
    const teamChannels = await prisma.teamChannel.findMany({
      where: { channelId },
      include: {
        team: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    availabilityStatus: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Collect all online agents from those teams
    const agents = teamChannels.flatMap((tc) =>
      tc.team.members
        .filter(
          (m) =>
            m.user.availabilityStatus === 'ONLINE' && m.user.status === 'ACTIVE'
        )
        .map((m) => m.user)
    );

    // Remove duplicates (agent might be in multiple teams)
    const uniqueAgents = Array.from(
      new Map(agents.map((a) => [a.id, a])).values()
    );

    if (uniqueAgents.length === 0) {
      // Fall back to any available agent in org
      return this.getLeastLoadedAgent(organizationId);
    }

    // Use load-balanced selection among team agents
    const agentsWithCounts = await Promise.all(
      uniqueAgents.map(async (agent) => {
        const count = await prisma.conversation.count({
          where: {
            organizationId,
            status: { in: ['OPEN', 'PENDING'] },
            OR: [
              { assignedUserId: agent.id },
              { agents: { some: { userId: agent.id } } },
            ],
          },
        });
        return { ...agent, conversationCount: count };
      })
    );

    agentsWithCounts.sort((a, b) => a.conversationCount - b.conversationCount);

    return agentsWithCounts[0];
  }

  // ==================== COLLABORATIVE QUERIES ====================

  /**
   * Get all agents assigned to a conversation
   */
  async getAgentsForConversation(conversationId: string) {
    const assignments = await prisma.conversationAgent.findMany({
      where: { conversationId },
      orderBy: [
        { isPrimary: 'desc' },
        { assignedAt: 'asc' },
      ],
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
            role: true,
            availabilityStatus: true,
          },
        },
      },
    });

    return assignments.map((a) => ({
      ...a.user,
      isPrimary: a.isPrimary,
      assignedAt: a.assignedAt,
    }));
  }

  /**
   * Get all conversations for an agent
   */
  async getConversationsForAgent(userId: string, organizationId: string) {
    const conversations = await prisma.conversation.findMany({
      where: {
        organizationId,
        OR: [
          { assignedUserId: userId },
          { agents: { some: { userId } } },
        ],
        status: { in: ['OPEN', 'PENDING'] },
      },
      include: {
        contact: {
          select: {
            displayName: true,
            firstName: true,
            lastName: true,
            identifier: true,
            avatarUrl: true,
          },
        },
        channel: {
          select: {
            name: true,
            type: true,
          },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    return conversations;
  }

  // ==================== HELPERS ====================

  /**
   * Check if conversation has a primary agent
   */
  private async hasPrimaryAgent(conversationId: string): Promise<boolean> {
    const count = await prisma.conversationAgent.count({
      where: { conversationId, isPrimary: true },
    });
    return count > 0;
  }

  /**
   * Get available agents for a channel (or all if no channel specified)
   */
  private async getAvailableAgentsForChannel(organizationId: string, channelId?: string) {
    const where: Prisma.UserWhereInput = {
      organizationId,
      status: 'ACTIVE',
      availabilityStatus: 'ONLINE',
    };

    // If channel is specified, only get agents from teams assigned to it
    if (channelId) {
      const hasTeams = await prisma.teamChannel.count({ where: { channelId } });

      if (hasTeams > 0) {
        where.teamMembers = {
          some: {
            team: {
              channels: {
                some: { channelId },
              },
            },
          },
        };
      }
    }

    return prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        avatarUrl: true,
        availabilityStatus: true,
      },
    });
  }

  /**
   * Emit assignment change event via WebSocket
   */
  private emitAssignmentChange(
    organizationId: string,
    conversationId: string,
    action: 'assigned' | 'unassigned' | 'primary_changed',
    data: Record<string, unknown>
  ) {
    if (socketServer) {
      socketServer.to(`org:${organizationId}`).emit('conversation:assignment', {
        conversationId,
        action,
        ...data,
      });

      // Also emit queue update
      socketServer.to(`org:${organizationId}`).emit('queue:updated', {
        conversationId,
        action,
      });
    }
  }
}

// Export singleton instance
export const queueService = new QueueService();
