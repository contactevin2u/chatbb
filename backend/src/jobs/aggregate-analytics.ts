/**
 * Analytics Aggregation Job
 *
 * Daily job to aggregate message and conversation statistics
 * into the analytics_daily table for faster reporting.
 */

import { connectDatabase, disconnectDatabase, prisma } from '../core/database/prisma';
import { logger } from '../shared/utils/logger';
import { runPaymentChase } from './payment-chase';

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

  return {
    messagesIn,
    messagesOut,
    conversationsOpened,
    conversationsClosed,
    avgResponseTimeMs,
    newContacts,
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
