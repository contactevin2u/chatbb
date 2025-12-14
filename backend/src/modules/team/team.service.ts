/**
 * Team Service
 *
 * Business logic for team management
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { socketServer } from '../../core/websocket/server';

// ==================== INTERFACES ====================

export interface CreateTeamInput {
  organizationId: string;
  name: string;
  description?: string;
}

export interface UpdateTeamInput {
  name?: string;
  description?: string;
}

export interface AddMemberInput {
  teamId: string;
  userId: string;
  isLeader?: boolean;
}

// ==================== TEAM SERVICE ====================

export class TeamService {
  // ==================== TEAM CRUD ====================

  /**
   * Create a new team
   */
  async createTeam(input: CreateTeamInput) {
    const { organizationId, name, description } = input;

    const team = await prisma.team.create({
      data: {
        organizationId,
        name,
        description,
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                avatarUrl: true,
                role: true,
              },
            },
          },
        },
        channels: {
          include: {
            channel: {
              select: {
                id: true,
                name: true,
                type: true,
                identifier: true,
              },
            },
          },
        },
      },
    });

    // Broadcast team created event
    this.emitTeamEvent(organizationId, 'team:created', { team });

    return team;
  }

  /**
   * List all teams for an organization
   */
  async listTeams(organizationId: string) {
    const teams = await prisma.team.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                avatarUrl: true,
                role: true,
              },
            },
          },
        },
        channels: {
          include: {
            channel: {
              select: {
                id: true,
                name: true,
                type: true,
                identifier: true,
              },
            },
          },
        },
        _count: {
          select: {
            members: true,
            channels: true,
          },
        },
      },
    });

    return teams;
  }

  /**
   * Get a single team by ID
   */
  async getTeam(teamId: string, organizationId: string) {
    const team = await prisma.team.findFirst({
      where: {
        id: teamId,
        organizationId,
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                avatarUrl: true,
                role: true,
                lastActiveAt: true,
              },
            },
          },
          orderBy: [
            { isLeader: 'desc' },
            { createdAt: 'asc' },
          ],
        },
        channels: {
          include: {
            channel: {
              select: {
                id: true,
                name: true,
                type: true,
                identifier: true,
                status: true,
              },
            },
          },
        },
      },
    });

    return team;
  }

  /**
   * Update a team
   */
  async updateTeam(teamId: string, organizationId: string, input: UpdateTeamInput) {
    const team = await prisma.team.update({
      where: {
        id: teamId,
        organizationId,
      },
      data: input,
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                avatarUrl: true,
                role: true,
              },
            },
          },
        },
        channels: {
          include: {
            channel: {
              select: {
                id: true,
                name: true,
                type: true,
                identifier: true,
              },
            },
          },
        },
      },
    });

    // Broadcast team updated event
    this.emitTeamEvent(organizationId, 'team:updated', { team });

    return team;
  }

  /**
   * Delete a team
   */
  async deleteTeam(teamId: string, organizationId: string) {
    await prisma.team.delete({
      where: {
        id: teamId,
        organizationId,
      },
    });

    // Broadcast team deleted event
    this.emitTeamEvent(organizationId, 'team:deleted', { teamId });

    return { success: true };
  }

  // ==================== TEAM MEMBERS ====================

  /**
   * Add a member to a team
   */
  async addMember(input: AddMemberInput, organizationId: string) {
    const { teamId, userId, isLeader = false } = input;

    // Verify user belongs to same organization
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
      },
    });

    if (!user) {
      throw new Error('User not found in organization');
    }

    // If setting as leader, ensure no other leaders (or demote them)
    if (isLeader) {
      await prisma.teamMember.updateMany({
        where: { teamId, isLeader: true },
        data: { isLeader: false },
      });
    }

    const member = await prisma.teamMember.upsert({
      where: {
        teamId_userId: { teamId, userId },
      },
      create: {
        teamId,
        userId,
        isLeader,
      },
      update: {
        isLeader,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
            role: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
            organizationId: true,
          },
        },
      },
    });

    // Broadcast member added event
    this.emitTeamEvent(organizationId, 'team:member:added', {
      teamId,
      member,
    });

    return member;
  }

  /**
   * Remove a member from a team
   */
  async removeMember(teamId: string, userId: string, organizationId: string) {
    // Verify team belongs to organization
    const team = await prisma.team.findFirst({
      where: { id: teamId, organizationId },
    });

    if (!team) {
      throw new Error('Team not found');
    }

    await prisma.teamMember.delete({
      where: {
        teamId_userId: { teamId, userId },
      },
    });

    // Broadcast member removed event
    this.emitTeamEvent(organizationId, 'team:member:removed', {
      teamId,
      userId,
    });

    return { success: true };
  }

  /**
   * Set or unset a member as team leader
   */
  async setLeader(teamId: string, userId: string, isLeader: boolean, organizationId: string) {
    // Verify team belongs to organization
    const team = await prisma.team.findFirst({
      where: { id: teamId, organizationId },
    });

    if (!team) {
      throw new Error('Team not found');
    }

    // If setting as leader, demote other leaders first
    if (isLeader) {
      await prisma.teamMember.updateMany({
        where: { teamId, isLeader: true },
        data: { isLeader: false },
      });
    }

    const member = await prisma.teamMember.update({
      where: {
        teamId_userId: { teamId, userId },
      },
      data: { isLeader },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
            role: true,
          },
        },
      },
    });

    // Broadcast leader changed event
    this.emitTeamEvent(organizationId, 'team:leader:changed', {
      teamId,
      member,
      isLeader,
    });

    return member;
  }

  /**
   * List all members of a team
   */
  async listMembers(teamId: string, organizationId: string) {
    // Verify team belongs to organization
    const team = await prisma.team.findFirst({
      where: { id: teamId, organizationId },
    });

    if (!team) {
      throw new Error('Team not found');
    }

    const members = await prisma.teamMember.findMany({
      where: { teamId },
      orderBy: [
        { isLeader: 'desc' },
        { createdAt: 'asc' },
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
            lastActiveAt: true,
          },
        },
      },
    });

    return members;
  }

  // ==================== TEAM-CHANNEL ASSIGNMENT ====================

  /**
   * Assign a channel to a team
   */
  async assignChannel(teamId: string, channelId: string, organizationId: string) {
    // Verify team and channel belong to same organization
    const [team, channel] = await Promise.all([
      prisma.team.findFirst({ where: { id: teamId, organizationId } }),
      prisma.channel.findFirst({ where: { id: channelId, organizationId } }),
    ]);

    if (!team) {
      throw new Error('Team not found');
    }

    if (!channel) {
      throw new Error('Channel not found');
    }

    const teamChannel = await prisma.teamChannel.upsert({
      where: {
        teamId_channelId: { teamId, channelId },
      },
      create: {
        teamId,
        channelId,
      },
      update: {},
      include: {
        channel: {
          select: {
            id: true,
            name: true,
            type: true,
            identifier: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Broadcast channel assigned event
    this.emitTeamEvent(organizationId, 'team:channel:assigned', {
      teamId,
      channelId,
      teamChannel,
    });

    return teamChannel;
  }

  /**
   * Unassign a channel from a team
   */
  async unassignChannel(teamId: string, channelId: string, organizationId: string) {
    // Verify team belongs to organization
    const team = await prisma.team.findFirst({
      where: { id: teamId, organizationId },
    });

    if (!team) {
      throw new Error('Team not found');
    }

    await prisma.teamChannel.delete({
      where: {
        teamId_channelId: { teamId, channelId },
      },
    });

    // Broadcast channel unassigned event
    this.emitTeamEvent(organizationId, 'team:channel:unassigned', {
      teamId,
      channelId,
    });

    return { success: true };
  }

  /**
   * List all channels assigned to a team
   */
  async listTeamChannels(teamId: string, organizationId: string) {
    // Verify team belongs to organization
    const team = await prisma.team.findFirst({
      where: { id: teamId, organizationId },
    });

    if (!team) {
      throw new Error('Team not found');
    }

    const teamChannels = await prisma.teamChannel.findMany({
      where: { teamId },
      include: {
        channel: {
          select: {
            id: true,
            name: true,
            type: true,
            identifier: true,
            status: true,
          },
        },
      },
    });

    return teamChannels.map((tc) => tc.channel);
  }

  /**
   * Get all teams assigned to a channel
   */
  async getTeamsForChannel(channelId: string, organizationId: string) {
    const teamChannels = await prisma.teamChannel.findMany({
      where: {
        channelId,
        team: {
          organizationId,
        },
      },
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
                    avatarUrl: true,
                    role: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return teamChannels.map((tc) => tc.team);
  }

  // ==================== HELPERS ====================

  /**
   * Emit team-related events via WebSocket
   */
  private emitTeamEvent(organizationId: string, event: string, data: unknown) {
    if (socketServer) {
      socketServer.to(`org:${organizationId}`).emit(event, data);
    }
  }
}

// Export singleton instance
export const teamService = new TeamService();
