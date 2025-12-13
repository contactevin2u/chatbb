import { env } from './env.js';

export const redisConfig = {
  url: env.REDIS_URL,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  // Connection pool settings for Render Redis
  connectTimeout: 10000,
  keepAlive: 30000,
  lazyConnect: false,
  // Reconnection settings
  retryDelayOnClusterDown: 300,
  retryDelayOnFailover: 100,
  retryDelayOnTryAgain: 100,
  maxReconnectAttempts: 20,
};
