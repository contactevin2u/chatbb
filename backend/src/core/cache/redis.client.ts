import Redis from 'ioredis';
import { redisConfig } from '../../config/redis.js';
import { logger } from '../../shared/utils/logger.js';

let redisInstance: Redis | null = null;
let reconnectAttempts = 0;

export const redis = new Redis(redisConfig.url, {
  maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
  enableReadyCheck: redisConfig.enableReadyCheck,
  connectTimeout: redisConfig.connectTimeout,
  keepAlive: redisConfig.keepAlive,
  lazyConnect: redisConfig.lazyConnect,
  retryStrategy: (times) => {
    reconnectAttempts = times;
    if (times > (redisConfig.maxReconnectAttempts || 20)) {
      logger.error({ attempts: times }, 'Redis connection failed after max retries');
      // Don't return null - keep trying to reconnect
      return 5000; // Wait 5 seconds between attempts after max
    }
    const delay = Math.min(times * 200, 5000);
    logger.info({ attempts: times, delay }, 'Redis reconnecting...');
    return delay;
  },
  reconnectOnError: (err) => {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ECONNREFUSED'];
    if (targetErrors.some(e => err.message.includes(e))) {
      logger.warn({ error: err.message }, 'Redis reconnecting on error');
      return true; // Reconnect
    }
    return false;
  },
});

redis.on('connect', () => {
  logger.info('Redis connected');
  reconnectAttempts = 0; // Reset on successful connection
});

redis.on('ready', () => {
  logger.info('Redis ready');
});

redis.on('error', (error) => {
  // Only log if not a common reconnection error
  if (!error.message?.includes('ECONNREFUSED')) {
    logger.error({ error }, 'Redis error');
  }
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

redis.on('reconnecting', (delay: number) => {
  logger.info({ delay, attempts: reconnectAttempts }, 'Redis reconnecting');
});

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  logger.info('Redis disconnected');
}

export async function connectRedis(): Promise<Redis> {
  if (redisInstance) {
    return redisInstance;
  }
  redisInstance = redis;
  return redisInstance;
}

// Alias for compatibility
export const redisClient = redis;
