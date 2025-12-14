/**
 * User Service
 *
 * Business logic for user and agent management
 */

import { AgentAvailability, Prisma, ConversationStatus, UserRole } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { socketServer } from '../../core/websocket/server';
import { hashPassword } from '../../shared/utils/encryption';
import { ConflictException, NotFoundException, BadRequestException } from '../../shared/exceptions/base.exception';

// ==================== INTERFACES ====================

export interface AgentStats {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  availabilityStatus: AgentAvailability;
  lastActiveAt: Date | null;
  openConversations: number;
  totalAssigned: number;
}

export interface SetAvailabilityResult {
  user: {
    id: string;
    availabilityStatus: AgentAvailability;
    lastActiveAt: Date | null;
  };
}

export interface CreateUserInput {
  organizationId: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: UserRole;
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
}

// ==================== USER SERVICE ====================

export class UserService {
  /**
   * Create a new user in an organization
   */
  async createUser(input: CreateUserInput) {
    const { organizationId, email, password, firstName, lastName, role = 'AGENT' } = input;

    // Check if email already exists in organization
    const existing = await prisma.user.findFirst({
      where: {
        organizationId,
        email: email.toLowerCase(),
      },
    });

    if (existing) {
      throw new ConflictException('Email already exists in this organization');
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        organizationId,
        email: email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        role,
        status: 'ACTIVE',
        availabilityStatus: 'OFFLINE',
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        availabilityStatus: true,
        createdAt: true,
      },
    });

    return user;
  }

  /**
   * Update a user
   */
  async updateUser(userId: string, organizationId: string, input: UpdateUserInput) {
    const user = await prisma.user.findFirst({
      where: { id: userId, organizationId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Prevent changing owner role
    if (user.role === 'OWNER' && input.role && input.role !== 'OWNER') {
      throw new BadRequestException('Cannot change owner role');
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: input,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        availabilityStatus: true,
      },
    });

    return updated;
  }

  /**
   * Delete a user
   */
  async deleteUser(userId: string, organizationId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, organizationId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === 'OWNER') {
      throw new BadRequestException('Cannot delete organization owner');
    }

    await prisma.user.delete({
      where: { id: userId },
    });

    return { success: true };
  }

  /**
   * Set agent availability status
   */
  async setAvailability(
    userId: string,
    organizationId: string,
    status: AgentAvailability
  ): Promise<SetAvailabilityResult> {
    const user = await prisma.user.update({
      where: {
        id: userId,
        organizationId,
      },
      data: {
        availabilityStatus: status,
        lastActiveAt: new Date(),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        availabilityStatus: true,
        lastActiveAt: true,
      },
    });

    // Broadcast availability change to organization
    this.emitAvailabilityChange(organizationId, user);

    return { user };
  }

  /**
   * Get agent's current availability
   */
  async getAvailability(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        availabilityStatus: true,
        lastActiveAt: true,
      },
    });

    return user;
  }

  /**
   * Get all available agents for an organization
   * Optionally filter by channel (only agents in teams assigned to that channel)
   */
  async getAvailableAgents(
    organizationId: string,
    channelId?: string,
    statuses: AgentAvailability[] = ['ONLINE']
  ) {
    const where: Prisma.UserWhereInput = {
      organizationId,
      availabilityStatus: { in: statuses },
      status: 'ACTIVE',
    };

    // If channelId is provided, only get agents from teams assigned to that channel
    if (channelId) {
      where.teamMembers = {
        some: {
          team: {
            channels: {
              some: {
                channelId,
              },
            },
          },
        },
      };
    }

    const agents = await prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        avatarUrl: true,
        role: true,
        availabilityStatus: true,
        lastActiveAt: true,
      },
      orderBy: { lastActiveAt: 'desc' },
    });

    return agents;
  }

  /**
   * Get agent stats for an organization (workload per agent)
   */
  async getAgentStats(organizationId: string): Promise<AgentStats[]> {
    const users = await prisma.user.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        avatarUrl: true,
        role: true,
        availabilityStatus: true,
        lastActiveAt: true,
        _count: {
          select: {
            assignedChats: {
              where: {
                status: { in: ['OPEN', 'PENDING'] },
              },
            },
            conversationAssignments: {
              where: {
                conversation: {
                  status: { in: ['OPEN', 'PENDING'] },
                },
              },
            },
          },
        },
      },
      orderBy: [
        { availabilityStatus: 'asc' }, // ONLINE first
        { lastName: 'asc' },
      ],
    });

    return users.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: user.role,
      availabilityStatus: user.availabilityStatus,
      lastActiveAt: user.lastActiveAt,
      openConversations: user._count.assignedChats + user._count.conversationAssignments,
      totalAssigned: user._count.assignedChats + user._count.conversationAssignments,
    }));
  }

  /**
   * Update last active timestamp (heartbeat)
   */
  async heartbeat(userId: string) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { lastActiveAt: new Date() },
      select: {
        id: true,
        organizationId: true,
        availabilityStatus: true,
        lastActiveAt: true,
      },
    });

    return user;
  }

  /**
   * Get users who haven't been active for X minutes and mark them offline
   */
  async markInactiveUsersOffline(inactiveMinutes: number = 5) {
    const cutoffTime = new Date(Date.now() - inactiveMinutes * 60 * 1000);

    const inactiveUsers = await prisma.user.findMany({
      where: {
        availabilityStatus: { in: ['ONLINE', 'AWAY', 'BUSY'] },
        lastActiveAt: { lt: cutoffTime },
      },
      select: {
        id: true,
        organizationId: true,
      },
    });

    if (inactiveUsers.length > 0) {
      await prisma.user.updateMany({
        where: {
          id: { in: inactiveUsers.map((u) => u.id) },
        },
        data: {
          availabilityStatus: 'OFFLINE',
        },
      });

      // Broadcast availability changes
      for (const user of inactiveUsers) {
        this.emitAvailabilityChange(user.organizationId, {
          id: user.id,
          availabilityStatus: 'OFFLINE' as AgentAvailability,
          lastActiveAt: null,
        });
      }
    }

    return inactiveUsers.length;
  }

  /**
   * List all users in organization with availability info
   */
  async listUsers(organizationId: string) {
    const users = await prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        avatarUrl: true,
        availabilityStatus: true,
        lastActiveAt: true,
        createdAt: true,
        teamMembers: {
          select: {
            team: {
              select: {
                id: true,
                name: true,
              },
            },
            isLeader: true,
          },
        },
        _count: {
          select: {
            assignedChats: {
              where: { status: { in: ['OPEN', 'PENDING'] } },
            },
            conversationAssignments: {
              where: {
                conversation: { status: { in: ['OPEN', 'PENDING'] } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((user) => ({
      ...user,
      teams: user.teamMembers.map((tm) => ({
        ...tm.team,
        isLeader: tm.isLeader,
      })),
      openConversations: user._count.assignedChats + user._count.conversationAssignments,
      teamMembers: undefined,
      _count: undefined,
    }));
  }

  // ==================== HELPERS ====================

  /**
   * Emit availability change event via WebSocket
   */
  private emitAvailabilityChange(
    organizationId: string,
    user: { id: string; availabilityStatus: AgentAvailability; lastActiveAt: Date | null; firstName?: string; lastName?: string }
  ) {
    if (socketServer) {
      socketServer.to(`org:${organizationId}`).emit('agent:availability', {
        userId: user.id,
        status: user.availabilityStatus,
        lastActiveAt: user.lastActiveAt,
        name: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : undefined,
      });
    }
  }
}

// Export singleton instance
export const userService = new UserService();
