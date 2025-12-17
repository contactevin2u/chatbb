/**
 * Distributed Lock Service
 *
 * Uses Redis to provide distributed locking across multiple worker instances.
 * Ensures only ONE instance can hold a lock (e.g., WhatsApp session) at a time.
 *
 * Features:
 * - Atomic lock acquisition using SET NX EX
 * - Automatic expiry (TTL) for crash recovery
 * - Heartbeat to keep locks alive
 * - Safe release (only owner can release)
 */

import { redisClient } from '../../core/cache/redis.client';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';
import os from 'os';

// Generate unique instance ID for this worker process
// Combines hostname + process ID + random UUID for uniqueness
const INSTANCE_ID = `${os.hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;

// Lock configuration
const LOCK_CONFIG = {
  TTL_SECONDS: 30,           // Lock expires after 30 seconds if not renewed
  HEARTBEAT_INTERVAL_MS: 10_000,  // Renew lock every 10 seconds
  ACQUIRE_RETRY_MS: 1000,    // Retry lock acquisition every 1 second
  MAX_ACQUIRE_ATTEMPTS: 5,   // Max attempts to acquire lock
};

// Track active heartbeats so we can stop them
const activeHeartbeats: Map<string, NodeJS.Timeout> = new Map();

/**
 * Get the current instance ID
 */
export function getInstanceId(): string {
  return INSTANCE_ID;
}

/**
 * Get the Redis key for a channel lock
 */
function getLockKey(channelId: string): string {
  return `lock:whatsapp:${channelId}`;
}

/**
 * Acquire a distributed lock for a channel
 *
 * @param channelId - The channel to lock
 * @param startHeartbeat - Whether to start automatic heartbeat (default: true)
 * @returns true if lock acquired, false if held by another instance
 */
export async function acquireLock(channelId: string, startHeartbeat: boolean = true): Promise<boolean> {
  const lockKey = getLockKey(channelId);

  try {
    // Try to set the lock with NX (only if not exists) and EX (expiry)
    // Value is our instance ID so we can verify ownership
    const result = await redisClient.set(lockKey, INSTANCE_ID, 'EX', LOCK_CONFIG.TTL_SECONDS, 'NX');

    if (result === 'OK') {
      logger.info({
        channelId,
        instanceId: INSTANCE_ID,
        ttl: LOCK_CONFIG.TTL_SECONDS,
      }, 'Acquired distributed lock for channel');

      // Start heartbeat to keep lock alive
      if (startHeartbeat) {
        startLockHeartbeat(channelId);
      }

      return true;
    }

    // Lock is held by another instance
    const holder = await redisClient.get(lockKey);
    logger.warn({
      channelId,
      instanceId: INSTANCE_ID,
      lockHolder: holder,
    }, 'Failed to acquire lock - held by another instance');

    return false;
  } catch (error) {
    logger.error({ channelId, error }, 'Error acquiring distributed lock');
    return false;
  }
}

/**
 * Acquire lock with retries
 *
 * @param channelId - The channel to lock
 * @param maxAttempts - Maximum retry attempts (default from config)
 * @returns true if lock acquired, false if failed after all attempts
 */
export async function acquireLockWithRetry(
  channelId: string,
  maxAttempts: number = LOCK_CONFIG.MAX_ACQUIRE_ATTEMPTS
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const acquired = await acquireLock(channelId);
    if (acquired) {
      return true;
    }

    if (attempt < maxAttempts) {
      logger.info({
        channelId,
        attempt,
        maxAttempts,
        retryMs: LOCK_CONFIG.ACQUIRE_RETRY_MS,
      }, 'Retrying lock acquisition');
      await new Promise(resolve => setTimeout(resolve, LOCK_CONFIG.ACQUIRE_RETRY_MS));
    }
  }

  logger.warn({
    channelId,
    maxAttempts,
  }, 'Failed to acquire lock after all retry attempts');

  return false;
}

/**
 * Release a distributed lock
 * Only releases if we are the owner (prevents releasing another instance's lock)
 *
 * @param channelId - The channel to unlock
 * @returns true if released, false if not owner or error
 */
export async function releaseLock(channelId: string): Promise<boolean> {
  const lockKey = getLockKey(channelId);

  // Stop heartbeat first
  stopLockHeartbeat(channelId);

  try {
    // Check if we own the lock before releasing
    const holder = await redisClient.get(lockKey);

    if (holder !== INSTANCE_ID) {
      logger.warn({
        channelId,
        instanceId: INSTANCE_ID,
        lockHolder: holder,
      }, 'Cannot release lock - not the owner');
      return false;
    }

    // Delete the lock
    await redisClient.del(lockKey);

    logger.info({
      channelId,
      instanceId: INSTANCE_ID,
    }, 'Released distributed lock for channel');

    return true;
  } catch (error) {
    logger.error({ channelId, error }, 'Error releasing distributed lock');
    return false;
  }
}

/**
 * Renew (extend) a lock's TTL
 * Only renews if we are the owner
 *
 * @param channelId - The channel lock to renew
 * @returns true if renewed, false if not owner or error
 */
export async function renewLock(channelId: string): Promise<boolean> {
  const lockKey = getLockKey(channelId);

  try {
    // Check if we own the lock
    const holder = await redisClient.get(lockKey);

    if (holder !== INSTANCE_ID) {
      logger.warn({
        channelId,
        instanceId: INSTANCE_ID,
        lockHolder: holder,
      }, 'Cannot renew lock - not the owner (lock may have been stolen)');

      // Stop heartbeat since we lost the lock
      stopLockHeartbeat(channelId);
      return false;
    }

    // Extend the TTL
    await redisClient.expire(lockKey, LOCK_CONFIG.TTL_SECONDS);

    logger.debug({
      channelId,
      instanceId: INSTANCE_ID,
      ttl: LOCK_CONFIG.TTL_SECONDS,
    }, 'Renewed distributed lock');

    return true;
  } catch (error) {
    logger.error({ channelId, error }, 'Error renewing distributed lock');
    return false;
  }
}

/**
 * Check if we own the lock for a channel
 *
 * @param channelId - The channel to check
 * @returns true if we own the lock
 */
export async function ownsLock(channelId: string): Promise<boolean> {
  const lockKey = getLockKey(channelId);

  try {
    const holder = await redisClient.get(lockKey);
    return holder === INSTANCE_ID;
  } catch (error) {
    logger.error({ channelId, error }, 'Error checking lock ownership');
    return false;
  }
}

/**
 * Get the instance ID that holds a lock
 *
 * @param channelId - The channel to check
 * @returns Instance ID of lock holder, or null if not locked
 */
export async function getLockHolder(channelId: string): Promise<string | null> {
  const lockKey = getLockKey(channelId);

  try {
    return await redisClient.get(lockKey);
  } catch (error) {
    logger.error({ channelId, error }, 'Error getting lock holder');
    return null;
  }
}

/**
 * Start heartbeat to keep lock alive
 * Automatically renews the lock at regular intervals
 */
function startLockHeartbeat(channelId: string): void {
  // Stop any existing heartbeat
  stopLockHeartbeat(channelId);

  const interval = setInterval(async () => {
    const renewed = await renewLock(channelId);

    if (!renewed) {
      // Lost the lock, stop heartbeat
      logger.warn({ channelId, instanceId: INSTANCE_ID }, 'Lost lock, stopping heartbeat');
      stopLockHeartbeat(channelId);
    }
  }, LOCK_CONFIG.HEARTBEAT_INTERVAL_MS);

  activeHeartbeats.set(channelId, interval);

  logger.debug({
    channelId,
    intervalMs: LOCK_CONFIG.HEARTBEAT_INTERVAL_MS,
  }, 'Started lock heartbeat');
}

/**
 * Stop heartbeat for a channel
 */
function stopLockHeartbeat(channelId: string): void {
  const interval = activeHeartbeats.get(channelId);

  if (interval) {
    clearInterval(interval);
    activeHeartbeats.delete(channelId);
    logger.debug({ channelId }, 'Stopped lock heartbeat');
  }
}

/**
 * Release all locks held by this instance
 * Call this on graceful shutdown
 */
export async function releaseAllLocks(): Promise<void> {
  logger.info({ instanceId: INSTANCE_ID, count: activeHeartbeats.size }, 'Releasing all locks on shutdown');

  const channelIds = Array.from(activeHeartbeats.keys());

  for (const channelId of channelIds) {
    await releaseLock(channelId);
  }
}

/**
 * Force acquire a lock (for admin/recovery purposes)
 * WARNING: This will steal the lock from another instance
 *
 * @param channelId - The channel to lock
 * @returns true if acquired
 */
export async function forceAcquireLock(channelId: string): Promise<boolean> {
  const lockKey = getLockKey(channelId);

  try {
    // Force set the lock regardless of current holder
    await redisClient.set(lockKey, INSTANCE_ID, 'EX', LOCK_CONFIG.TTL_SECONDS);

    logger.warn({
      channelId,
      instanceId: INSTANCE_ID,
    }, 'Force acquired lock (may have stolen from another instance)');

    startLockHeartbeat(channelId);
    return true;
  } catch (error) {
    logger.error({ channelId, error }, 'Error force acquiring lock');
    return false;
  }
}
