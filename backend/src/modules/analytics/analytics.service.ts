/**
 * Analytics Service
 *
 * Business logic for dashboard analytics and reporting
 * Uses aggregated data from analytics_daily table + real-time queries
 */

import { prisma } from '../../core/database/prisma';
import { logger } from '../../shared/utils/logger';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface OverviewStats {
  totalConversations: number;
  activeContacts: number;
  messagesIn: number;
  messagesOut: number;
  responseRate: number;
  avgResponseTimeMs: number | null;
  conversationsOpened: number;
  conversationsClosed: number;
  newContacts: number;
}

export interface DailyStats {
  date: string;
  messagesIn: number;
  messagesOut: number;
  conversationsOpened: number;
  conversationsClosed: number;
  newContacts: number;
}

export interface ChannelStats {
  channelId: string;
  channelName: string;
  channelType: string;
  messagesIn: number;
  messagesOut: number;
  conversationsOpened: number;
  conversationsClosed: number;
  percentage: number;
}

export interface AgentStats {
  userId: string;
  firstName: string;
  lastName: string;
  messagesOut: number;
  conversationsClosed: number;
  avgResponseTimeMs: number | null;
  isAvailable: boolean;
}

export class AnalyticsService {
  /**
   * Get date range for period
   */
  private getDateRange(period: string): DateRange {
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    switch (period) {
      case 'today':
        // Already set to today
        break;
      case 'yesterday':
        startDate.setDate(startDate.getDate() - 1);
        endDate.setDate(endDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case 'quarter':
        startDate.setDate(startDate.getDate() - 90);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7); // Default to week
    }

    return { startDate, endDate };
  }

  /**
   * Get dashboard overview stats
   */
  async getOverview(organizationId: string, period = 'week'): Promise<OverviewStats> {
    const { startDate, endDate } = this.getDateRange(period);

    // Get aggregated stats from analytics_daily (for historical data)
    const aggregatedStats = await prisma.analyticsDaily.aggregate({
      where: {
        organizationId,
        date: { gte: startDate, lte: endDate },
        channelId: null, // Org-level stats only
        userId: null,
      },
      _sum: {
        messagesIn: true,
        messagesOut: true,
        conversationsOpened: true,
        conversationsClosed: true,
        newContacts: true,
      },
      _avg: {
        avgResponseTimeMs: true,
      },
    });

    // Get real-time counts for today (not yet aggregated)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      todayMessages,
      totalConversations,
      activeContacts,
      todayConversationsOpened,
      todayNewContacts,
    ] = await Promise.all([
      // Today's messages (real-time)
      prisma.message.groupBy({
        by: ['direction'],
        where: {
          conversation: { organizationId },
          createdAt: { gte: today },
        },
        _count: true,
      }),
      // Total conversations count
      prisma.conversation.count({
        where: { organizationId },
      }),
      // Active contacts (had conversation in period)
      prisma.contact.count({
        where: {
          organizationId,
          conversations: {
            some: {
              lastMessageAt: { gte: startDate },
            },
          },
        },
      }),
      // Today's opened conversations
      prisma.conversation.count({
        where: {
          organizationId,
          createdAt: { gte: today },
        },
      }),
      // Today's new contacts
      prisma.contact.count({
        where: {
          organizationId,
          createdAt: { gte: today },
        },
      }),
    ]);

    // Combine aggregated + today's real-time data
    const todayIn = todayMessages.find((m) => m.direction === 'INBOUND')?._count || 0;
    const todayOut = todayMessages.find((m) => m.direction === 'OUTBOUND')?._count || 0;

    const messagesIn = (aggregatedStats._sum.messagesIn || 0) + todayIn;
    const messagesOut = (aggregatedStats._sum.messagesOut || 0) + todayOut;
    const conversationsOpened = (aggregatedStats._sum.conversationsOpened || 0) + todayConversationsOpened;
    const conversationsClosed = aggregatedStats._sum.conversationsClosed || 0;
    const newContacts = (aggregatedStats._sum.newContacts || 0) + todayNewContacts;

    // Calculate response rate (outbound / inbound messages)
    const responseRate = messagesIn > 0 ? Math.round((messagesOut / messagesIn) * 100) : 0;

    return {
      totalConversations,
      activeContacts,
      messagesIn,
      messagesOut,
      responseRate,
      avgResponseTimeMs: aggregatedStats._avg.avgResponseTimeMs,
      conversationsOpened,
      conversationsClosed,
      newContacts,
    };
  }

  /**
   * Get daily stats for charts
   */
  async getDailyStats(organizationId: string, period = 'week'): Promise<DailyStats[]> {
    const { startDate, endDate } = this.getDateRange(period);

    const dailyStats = await prisma.analyticsDaily.findMany({
      where: {
        organizationId,
        date: { gte: startDate, lte: endDate },
        channelId: null,
        userId: null,
      },
      orderBy: { date: 'asc' },
      select: {
        date: true,
        messagesIn: true,
        messagesOut: true,
        conversationsOpened: true,
        conversationsClosed: true,
        newContacts: true,
      },
    });

    return dailyStats.map((stat) => ({
      date: stat.date.toISOString().split('T')[0],
      messagesIn: stat.messagesIn,
      messagesOut: stat.messagesOut,
      conversationsOpened: stat.conversationsOpened,
      conversationsClosed: stat.conversationsClosed,
      newContacts: stat.newContacts,
    }));
  }

  /**
   * Get channel performance stats
   */
  async getChannelStats(organizationId: string, period = 'week'): Promise<ChannelStats[]> {
    const { startDate, endDate } = this.getDateRange(period);

    // Get channels with their stats
    const channels = await prisma.channel.findMany({
      where: { organizationId },
      select: { id: true, name: true, type: true },
    });

    const channelStats = await prisma.analyticsDaily.groupBy({
      by: ['channelId'],
      where: {
        organizationId,
        date: { gte: startDate, lte: endDate },
        channelId: { not: null },
        userId: null,
      },
      _sum: {
        messagesIn: true,
        messagesOut: true,
        conversationsOpened: true,
        conversationsClosed: true,
      },
    });

    // Calculate total messages for percentage
    const totalMessages = channelStats.reduce(
      (sum, stat) => sum + (stat._sum.messagesIn || 0) + (stat._sum.messagesOut || 0),
      0
    );

    return channels.map((channel) => {
      const stats = channelStats.find((s) => s.channelId === channel.id);
      const channelTotal = (stats?._sum.messagesIn || 0) + (stats?._sum.messagesOut || 0);

      return {
        channelId: channel.id,
        channelName: channel.name,
        channelType: channel.type,
        messagesIn: stats?._sum.messagesIn || 0,
        messagesOut: stats?._sum.messagesOut || 0,
        conversationsOpened: stats?._sum.conversationsOpened || 0,
        conversationsClosed: stats?._sum.conversationsClosed || 0,
        percentage: totalMessages > 0 ? Math.round((channelTotal / totalMessages) * 100) : 0,
      };
    });
  }

  /**
   * Get agent performance stats
   */
  async getAgentStats(organizationId: string, period = 'week'): Promise<AgentStats[]> {
    const { startDate, endDate } = this.getDateRange(period);

    // Get users with their stats
    const users = await prisma.user.findMany({
      where: { organizationId },
      select: { id: true, firstName: true, lastName: true, availabilityStatus: true },
    });

    const userStats = await prisma.analyticsDaily.groupBy({
      by: ['userId'],
      where: {
        organizationId,
        date: { gte: startDate, lte: endDate },
        userId: { not: null },
        channelId: null,
      },
      _sum: {
        messagesOut: true,
        conversationsClosed: true,
      },
      _avg: {
        avgResponseTimeMs: true,
      },
    });

    return users.map((user) => {
      const stats = userStats.find((s) => s.userId === user.id);

      return {
        userId: user.id,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        messagesOut: stats?._sum.messagesOut || 0,
        conversationsClosed: stats?._sum.conversationsClosed || 0,
        avgResponseTimeMs: stats?._avg.avgResponseTimeMs || null,
        isAvailable: user.availabilityStatus === 'ONLINE',
      };
    });
  }

  /**
   * Get message analytics with breakdown
   */
  async getMessageAnalytics(organizationId: string, period = 'week') {
    const { startDate, endDate } = this.getDateRange(period);

    const [byDirection, byType, daily] = await Promise.all([
      // Messages by direction
      prisma.message.groupBy({
        by: ['direction'],
        where: {
          conversation: { organizationId },
          createdAt: { gte: startDate, lte: endDate },
        },
        _count: true,
      }),
      // Messages by type
      prisma.message.groupBy({
        by: ['type'],
        where: {
          conversation: { organizationId },
          createdAt: { gte: startDate, lte: endDate },
        },
        _count: true,
      }),
      // Daily breakdown
      this.getDailyStats(organizationId, period),
    ]);

    return {
      byDirection: byDirection.map((d) => ({ direction: d.direction, count: d._count })),
      byType: byType.map((t) => ({ type: t.type, count: t._count })),
      daily,
    };
  }

  /**
   * Get conversation analytics
   */
  async getConversationAnalytics(organizationId: string, period = 'week') {
    const { startDate, endDate } = this.getDateRange(period);

    const [byStatus, byPriority, total, open, closed] = await Promise.all([
      // By status
      prisma.conversation.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: true,
      }),
      // By priority
      prisma.conversation.groupBy({
        by: ['priority'],
        where: { organizationId },
        _count: true,
      }),
      // Total in period
      prisma.conversation.count({
        where: {
          organizationId,
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
      // Currently open
      prisma.conversation.count({
        where: {
          organizationId,
          status: { not: 'CLOSED' },
        },
      }),
      // Closed in period
      prisma.conversation.count({
        where: {
          organizationId,
          closedAt: { gte: startDate, lte: endDate },
        },
      }),
    ]);

    return {
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
      byPriority: byPriority.map((p) => ({ priority: p.priority, count: p._count })),
      totalInPeriod: total,
      currentlyOpen: open,
      closedInPeriod: closed,
    };
  }

  /**
   * Get agent engagement analytics
   *
   * Tracks how well agents keep conversations alive:
   * - Reply sessions (multiple outbound = 1)
   * - Continuation rate (did customer respond?)
   * - Follow-up effectiveness
   */
  async getAgentEngagement(organizationId: string, period = 'week') {
    const { startDate, endDate } = this.getDateRange(period);

    // Get users with their engagement stats
    const users = await prisma.user.findMany({
      where: { organizationId },
      select: { id: true, firstName: true, lastName: true, avatarUrl: true },
    });

    // Get aggregated engagement stats from analytics_daily
    const userStats = await prisma.analyticsDaily.findMany({
      where: {
        organizationId,
        date: { gte: startDate, lte: endDate },
        userId: { not: null },
        channelId: null,
      },
      select: {
        userId: true,
        date: true,
        replySessions: true,
        continuedSessions: true,
        diedSessions: true,
        followUpSessions: true,
        continuationRate: true,
        avgHoursToResponse: true,
      },
    });

    // Aggregate by user
    const userAggregates = new Map<
      string,
      {
        replySessions: number;
        continuedSessions: number;
        diedSessions: number;
        followUpSessions: number;
        totalHoursToResponse: number;
        responseCount: number;
        dailyRates: number[];
      }
    >();

    for (const stat of userStats) {
      if (!stat.userId) continue;

      const existing = userAggregates.get(stat.userId) || {
        replySessions: 0,
        continuedSessions: 0,
        diedSessions: 0,
        followUpSessions: 0,
        totalHoursToResponse: 0,
        responseCount: 0,
        dailyRates: [],
      };

      existing.replySessions += stat.replySessions;
      existing.continuedSessions += stat.continuedSessions;
      existing.diedSessions += stat.diedSessions;
      existing.followUpSessions += stat.followUpSessions;

      if (stat.avgHoursToResponse !== null) {
        existing.totalHoursToResponse += stat.avgHoursToResponse;
        existing.responseCount++;
      }

      if (stat.continuationRate !== null) {
        existing.dailyRates.push(stat.continuationRate);
      }

      userAggregates.set(stat.userId, existing);
    }

    // Build leaderboard
    const leaderboard = users
      .map((user) => {
        const stats = userAggregates.get(user.id);

        if (!stats || stats.replySessions === 0) {
          return null; // Skip users with no activity
        }

        const continuationRate =
          stats.replySessions > 0
            ? Math.round((stats.continuedSessions / stats.replySessions) * 1000) / 10
            : null;

        const avgHoursToResponse =
          stats.responseCount > 0
            ? Math.round((stats.totalHoursToResponse / stats.responseCount) * 10) / 10
            : null;

        // Calculate engagement score
        // Formula: +2 for continued, +1 for follow-up, -1 for died
        const score =
          stats.continuedSessions * 2 + stats.followUpSessions * 1 - stats.diedSessions * 1;

        return {
          userId: user.id,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown',
          avatarUrl: user.avatarUrl,
          replySessions: stats.replySessions,
          continuedSessions: stats.continuedSessions,
          diedSessions: stats.diedSessions,
          followUpSessions: stats.followUpSessions,
          continuationRate,
          avgHoursToResponse,
          score,
        };
      })
      .filter((u): u is NonNullable<typeof u> => u !== null)
      .sort((a, b) => b.score - a.score);

    // Calculate summary stats
    const totalReplySessions = leaderboard.reduce((sum, u) => sum + u.replySessions, 0);
    const totalContinued = leaderboard.reduce((sum, u) => sum + u.continuedSessions, 0);
    const totalDied = leaderboard.reduce((sum, u) => sum + u.diedSessions, 0);
    const totalFollowUps = leaderboard.reduce((sum, u) => sum + u.followUpSessions, 0);

    const avgContinuationRate =
      totalReplySessions > 0
        ? Math.round((totalContinued / totalReplySessions) * 1000) / 10
        : null;

    // Get daily trend for charts
    const dailyTrend = await prisma.analyticsDaily.groupBy({
      by: ['date'],
      where: {
        organizationId,
        date: { gte: startDate, lte: endDate },
        userId: { not: null },
        channelId: null,
      },
      _sum: {
        replySessions: true,
        continuedSessions: true,
        diedSessions: true,
        followUpSessions: true,
      },
      orderBy: { date: 'asc' },
    });

    const daily = dailyTrend.map((d) => ({
      date: d.date.toISOString().split('T')[0],
      replySessions: d._sum.replySessions || 0,
      continuedSessions: d._sum.continuedSessions || 0,
      diedSessions: d._sum.diedSessions || 0,
      continuationRate:
        (d._sum.replySessions || 0) > 0
          ? Math.round(((d._sum.continuedSessions || 0) / (d._sum.replySessions || 1)) * 1000) / 10
          : null,
    }));

    return {
      summary: {
        totalSessions: totalReplySessions,
        continuedSessions: totalContinued,
        diedSessions: totalDied,
        followUpSessions: totalFollowUps,
        continuationRate: avgContinuationRate,
      },
      leaderboard,
      daily,
    };
  }
}

export const analyticsService = new AnalyticsService();
