/**
 * Analytics Aggregation Job
 *
 * Daily job to aggregate message and conversation statistics
 * into the analytics_daily table for faster reporting.
 *
 * Includes Agent Engagement Metrics:
 * - Reply sessions (multiple outbound messages = 1 session)
 * - Continuation rate (did customer respond after agent reply?)
 * - Follow-up tracking (proactive agent outreach)
 */

import { connectDatabase, disconnectDatabase, prisma } from '../core/database/prisma';
import { logger } from '../shared/utils/logger';
import { runPaymentChase } from './payment-chase';

// Configuration for engagement calculation
const ENGAGEMENT_CONFIG = {
  sessionWindowMs: 30 * 60 * 1000,      // 30 min - outbounds within this window = 1 session
  diedThresholdMs: 72 * 60 * 60 * 1000, // 72 hours - no response = conversation died
  lookbackMs: 3 * 24 * 60 * 60 * 1000,  // 3 days - check future for customer response
};

async function aggregateAnalytics() {
  logger.info('Starting analytics aggregation job');

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const endOfYesterday = new Date(yesterday);
  endOfYesterday.setHours(23, 59, 59, 999);

  try {
    // Get all organizations
    const organizations = await prisma.organization.findMany({
      select: { id: true },
    });

    for (const org of organizations) {
      logger.info({ organizationId: org.id }, 'Aggregating analytics for organization');

      // Get all channels for this org
      const channels = await prisma.channel.findMany({
        where: { organizationId: org.id },
        select: { id: true },
      });

      // Get all users for this org
      const users = await prisma.user.findMany({
        where: { organizationId: org.id },
        select: { id: true },
      });

      // Aggregate by organization (overall)
      const orgStats = await aggregateStats(org.id, yesterday, endOfYesterday);
      await upsertAnalytics(org.id, yesterday, null, null, orgStats);

      // Aggregate by channel
      for (const channel of channels) {
        const channelStats = await aggregateStats(org.id, yesterday, endOfYesterday, channel.id);
        await upsertAnalytics(org.id, yesterday, channel.id, null, channelStats);
      }

      // Aggregate by user
      for (const user of users) {
        const userStats = await aggregateStats(org.id, yesterday, endOfYesterday, undefined, user.id);
        await upsertAnalytics(org.id, yesterday, null, user.id, userStats);
      }
    }

    logger.info('Analytics aggregation completed');
  } catch (error) {
    logger.error({ error }, 'Analytics aggregation failed');
    throw error;
  }
}

interface Stats {
  messagesIn: number;
  messagesOut: number;
  conversationsOpened: number;
  conversationsClosed: number;
  avgResponseTimeMs: number | null;
  newContacts: number;
  // Engagement metrics
  replySessions: number;
  continuedSessions: number;
  diedSessions: number;
  followUpSessions: number;
  continuationRate: number | null;
  avgHoursToResponse: number | null;
}

interface EngagementStats {
  replySessions: number;
  continuedSessions: number;
  diedSessions: number;
  followUpSessions: number;
  continuationRate: number | null;
  avgHoursToResponse: number | null;
}

interface MessageForEngagement {
  id: string;
  conversationId: string;
  direction: string;
  sentByUserId: string | null;
  createdAt: Date;
}

async function aggregateStats(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  channelId?: string,
  userId?: string
): Promise<Stats> {
  const messageWhere: any = {
    conversation: { organizationId },
    createdAt: { gte: startDate, lte: endDate },
  };

  if (channelId) {
    messageWhere.channelId = channelId;
  }

  if (userId) {
    messageWhere.sentByUserId = userId;
  }

  // Count messages
  const [messagesIn, messagesOut] = await Promise.all([
    prisma.message.count({
      where: { ...messageWhere, direction: 'INBOUND' },
    }),
    prisma.message.count({
      where: { ...messageWhere, direction: 'OUTBOUND' },
    }),
  ]);

  // Count conversations
  const conversationWhere: any = {
    organizationId,
  };

  if (channelId) {
    conversationWhere.channelId = channelId;
  }

  if (userId) {
    conversationWhere.assignedUserId = userId;
  }

  const [conversationsOpened, conversationsClosed] = await Promise.all([
    prisma.conversation.count({
      where: {
        ...conversationWhere,
        createdAt: { gte: startDate, lte: endDate },
      },
    }),
    prisma.conversation.count({
      where: {
        ...conversationWhere,
        closedAt: { gte: startDate, lte: endDate },
      },
    }),
  ]);

  // Count new contacts
  const contactWhere: any = {
    organizationId,
    createdAt: { gte: startDate, lte: endDate },
  };

  if (channelId) {
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { type: true },
    });
    if (channel) {
      contactWhere.channelType = channel.type;
    }
  }

  const newContacts = await prisma.contact.count({
    where: contactWhere,
  });

  // TODO: Calculate average response time
  // This would require tracking first response time per conversation
  const avgResponseTimeMs = null;

  // Calculate engagement metrics (only for user-level aggregation)
  let engagementStats: EngagementStats = {
    replySessions: 0,
    continuedSessions: 0,
    diedSessions: 0,
    followUpSessions: 0,
    continuationRate: null,
    avgHoursToResponse: null,
  };

  if (userId) {
    engagementStats = await calculateAgentEngagement(organizationId, startDate, endDate, userId);
  }

  return {
    messagesIn,
    messagesOut,
    conversationsOpened,
    conversationsClosed,
    avgResponseTimeMs,
    newContacts,
    ...engagementStats,
  };
}

/**
 * Calculate agent engagement metrics from message history
 *
 * A "reply session" = consecutive outbound messages from the same agent within 30 min.
 * Multiple outbounds in quick succession count as 1 session (prevents gaming metrics).
 *
 * Outcomes:
 * - CONTINUED: Customer responded after agent's reply session
 * - DIED: No customer response within 72 hours
 * - PENDING: Still waiting (within 72h window)
 */
async function calculateAgentEngagement(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  userId: string
): Promise<EngagementStats> {
  // Get all messages for this agent in the period
  // Include some context before and after for session detection
  const lookbackStart = new Date(startDate.getTime() - ENGAGEMENT_CONFIG.sessionWindowMs);
  const lookforwardEnd = new Date(endDate.getTime() + ENGAGEMENT_CONFIG.lookbackMs);

  const messages = await prisma.message.findMany({
    where: {
      createdAt: { gte: lookbackStart, lte: lookforwardEnd },
      // Get all messages in conversations where this agent participated
      conversation: {
        organizationId,
        messages: {
          some: {
            sentByUserId: userId,
            createdAt: { gte: startDate, lte: endDate },
          },
        },
      },
    },
    select: {
      id: true,
      conversationId: true,
      direction: true,
      sentByUserId: true,
      createdAt: true,
    },
    orderBy: [
      { conversationId: 'asc' },
      { createdAt: 'asc' },
    ],
  });

  // Group messages by conversation
  const conversationMap = new Map<string, MessageForEngagement[]>();
  for (const msg of messages) {
    const existing = conversationMap.get(msg.conversationId) || [];
    existing.push(msg);
    conversationMap.set(msg.conversationId, existing);
  }

  let totalReplySessions = 0;
  let continuedSessions = 0;
  let diedSessions = 0;
  let followUpSessions = 0;
  let totalResponseHours = 0;
  let responseCount = 0;

  // Process each conversation
  for (const [_convId, msgs] of conversationMap) {
    let lastInboundAt: Date | null = null;
    let sessionStart: Date | null = null;
    let sessionAgentId: string | null = null;
    let lastOutboundAt: Date | null = null;
    let sessionOutboundCount = 0;

    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      const msgTime = new Date(msg.createdAt).getTime();

      // Only count sessions that started within the aggregation period
      const isInPeriod = msg.createdAt >= startDate && msg.createdAt <= endDate;

      if (msg.direction === 'INBOUND') {
        // Customer message - check if this closes a previous session
        if (sessionStart && sessionAgentId === userId && lastOutboundAt) {
          const sessionStartedInPeriod = sessionStart >= startDate && sessionStart <= endDate;

          if (sessionStartedInPeriod) {
            const timeSinceLastOutbound = msgTime - lastOutboundAt.getTime();

            if (timeSinceLastOutbound <= ENGAGEMENT_CONFIG.diedThresholdMs) {
              // Customer responded within threshold - session continued!
              continuedSessions++;
              totalResponseHours += timeSinceLastOutbound / (1000 * 60 * 60);
              responseCount++;
            } else {
              // Response came too late - count as died
              diedSessions++;
            }
            totalReplySessions++;
          }
        }

        lastInboundAt = msg.createdAt;
        sessionStart = null;
        sessionAgentId = null;
        lastOutboundAt = null;
        sessionOutboundCount = 0;

      } else if (msg.direction === 'OUTBOUND' && msg.sentByUserId === userId) {
        // This agent's outbound message
        const lastOutboundTime = lastOutboundAt?.getTime() || 0;
        const timeSinceLastOutbound = msgTime - lastOutboundTime;

        if (!sessionStart) {
          // Start new session
          sessionStart = msg.createdAt;
          sessionAgentId = msg.sentByUserId;
          lastOutboundAt = msg.createdAt;
          sessionOutboundCount = 1;

          // Check if this is a follow-up (no recent inbound)
          if (isInPeriod) {
            const lastInboundTime = lastInboundAt?.getTime() || 0;
            const timeSinceInbound = msgTime - lastInboundTime;

            if (!lastInboundAt || timeSinceInbound > ENGAGEMENT_CONFIG.sessionWindowMs) {
              // Agent proactively reached out without recent customer message
              followUpSessions++;
            }
          }
        } else if (timeSinceLastOutbound < ENGAGEMENT_CONFIG.sessionWindowMs) {
          // Continue same session (multiple outbound = 1 session)
          lastOutboundAt = msg.createdAt;
          sessionOutboundCount++;
        } else {
          // Gap > 30 min = new session (this is a follow-up)
          const prevSessionInPeriod = sessionStart >= startDate && sessionStart <= endDate;

          if (prevSessionInPeriod && sessionAgentId === userId) {
            // Close previous session as died (no response before this follow-up)
            diedSessions++;
            totalReplySessions++;
          }

          // Start new session
          sessionStart = msg.createdAt;
          lastOutboundAt = msg.createdAt;
          sessionOutboundCount = 1;

          if (isInPeriod) {
            followUpSessions++;
          }
        }
      }
    }

    // Handle unclosed session at end of conversation
    if (sessionStart && sessionAgentId === userId && lastOutboundAt) {
      const sessionStartedInPeriod = sessionStart >= startDate && sessionStart <= endDate;

      if (sessionStartedInPeriod) {
        // Check if there's a future inbound (look ahead for response)
        const futureInbound = msgs.find(
          (m) =>
            m.direction === 'INBOUND' &&
            new Date(m.createdAt).getTime() > lastOutboundAt!.getTime() &&
            new Date(m.createdAt).getTime() <= lastOutboundAt!.getTime() + ENGAGEMENT_CONFIG.diedThresholdMs
        );

        if (futureInbound) {
          continuedSessions++;
          const responseTime = new Date(futureInbound.createdAt).getTime() - lastOutboundAt.getTime();
          totalResponseHours += responseTime / (1000 * 60 * 60);
          responseCount++;
        } else {
          // Check if we're still within the threshold (pending) or past it (died)
          const now = new Date();
          const timeSinceLastOutbound = now.getTime() - lastOutboundAt.getTime();

          if (timeSinceLastOutbound > ENGAGEMENT_CONFIG.diedThresholdMs) {
            diedSessions++;
          }
          // If still pending, don't count as either continued or died yet
        }
        totalReplySessions++;
      }
    }
  }

  // Calculate rates
  const continuationRate =
    totalReplySessions > 0
      ? Math.round((continuedSessions / totalReplySessions) * 1000) / 10 // One decimal place
      : null;

  const avgHoursToResponse =
    responseCount > 0 ? Math.round((totalResponseHours / responseCount) * 10) / 10 : null;

  logger.debug(
    {
      userId,
      totalReplySessions,
      continuedSessions,
      diedSessions,
      followUpSessions,
      continuationRate,
      avgHoursToResponse,
    },
    'Agent engagement calculated'
  );

  return {
    replySessions: totalReplySessions,
    continuedSessions,
    diedSessions,
    followUpSessions,
    continuationRate,
    avgHoursToResponse,
  };
}

async function upsertAnalytics(
  organizationId: string,
  date: Date,
  channelId: string | null,
  userId: string | null,
  stats: Stats
) {
  // Prisma compound unique doesn't handle null well in upsert
  // Use findFirst + create/update pattern instead
  const existing = await prisma.analyticsDaily.findFirst({
    where: {
      organizationId,
      date,
      channelId: channelId ?? undefined,
      userId: userId ?? undefined,
      // Handle null explicitly
      ...(channelId === null && { channelId: null }),
      ...(userId === null && { userId: null }),
    },
  });

  if (existing) {
    await prisma.analyticsDaily.update({
      where: { id: existing.id },
      data: stats,
    });
  } else {
    await prisma.analyticsDaily.create({
      data: {
        organizationId,
        date,
        channelId,
        userId,
        ...stats,
      },
    });
  }
}

async function main() {
  try {
    await connectDatabase();
    
    // Run analytics aggregation
    logger.info('Running analytics aggregation...');
    await aggregateAnalytics();
    
    // Run payment chase (sends reminders for overdue orders)
    logger.info('Running payment chase...');
    await runPaymentChase();
    
    await disconnectDatabase();
    logger.info('All cron jobs completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Cron job failed');
    process.exit(1);
  }
}

main();
