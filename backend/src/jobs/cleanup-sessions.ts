/**
 * Session Cleanup Job
 *
 * Periodic job to clean up:
 * - Expired refresh tokens
 * - Orphaned WhatsApp sync keys
 * - Stale session data in Redis
 */

import { connectDatabase, disconnectDatabase, prisma } from '../core/database/prisma';
import { connectRedis, disconnectRedis, redisClient } from '../core/cache/redis.client';
import { logger } from '../shared/utils/logger';

async function cleanupSessions() {
  logger.info('Starting session cleanup job');

  try {
    // Clean up expired refresh tokens
    const expiredTokensResult = await prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { not: null } },
        ],
      },
    });
    logger.info({ count: expiredTokensResult.count }, 'Deleted expired refresh tokens');

    // Clean up orphaned WhatsApp sync keys
    // (keys that belong to deleted auth states)
    const orphanedSyncKeys = await prisma.$executeRaw`
      DELETE FROM whatsapp_sync_keys
      WHERE auth_state_id NOT IN (
        SELECT id FROM whatsapp_auth_states
      )
    `;
    logger.info({ count: orphanedSyncKeys }, 'Deleted orphaned sync keys');

    // Clean up disconnected channels that haven't connected in 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const staleChannels = await prisma.channel.findMany({
      where: {
        status: 'DISCONNECTED',
        lastConnectedAt: { lt: thirtyDaysAgo },
        authState: { isNot: null },
      },
      select: { id: true },
    });

    if (staleChannels.length > 0) {
      // Delete auth states for stale channels
      await prisma.whatsAppAuthState.deleteMany({
        where: {
          channelId: { in: staleChannels.map((c) => c.id) },
        },
      });
      logger.info({ count: staleChannels.length }, 'Cleaned up stale channel auth states');
    }

    // Clean up old webhook delivery logs (keep last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const oldWebhookDeliveries = await prisma.webhookDelivery.deleteMany({
      where: {
        deliveredAt: { lt: sevenDaysAgo },
      },
    });
    logger.info({ count: oldWebhookDeliveries.count }, 'Deleted old webhook delivery logs');

    // Clean up old automation logs (keep last 30 days)
    const oldAutomationLogs = await prisma.automationLog.deleteMany({
      where: {
        executedAt: { lt: thirtyDaysAgo },
      },
    });
    logger.info({ count: oldAutomationLogs.count }, 'Deleted old automation logs');

    // Clean up Redis rate limit keys (older than 1 hour)
    const ratelimitKeys = await redisClient.keys('ratelimit:*');
    let deletedRedisKeys = 0;

    for (const key of ratelimitKeys) {
      const ttl = await redisClient.ttl(key);
      if (ttl === -1) {
        // Key has no expiry, delete it
        await redisClient.del(key);
        deletedRedisKeys++;
      }
    }
    logger.info({ count: deletedRedisKeys }, 'Deleted stale Redis rate limit keys');

    logger.info('Session cleanup completed');
  } catch (error) {
    logger.error({ error }, 'Session cleanup failed');
    throw error;
  }
}

async function main() {
  try {
    await connectDatabase();
    await connectRedis();
    await cleanupSessions();
    await disconnectRedis();
    await disconnectDatabase();
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Job failed');
    process.exit(1);
  }
}

main();
