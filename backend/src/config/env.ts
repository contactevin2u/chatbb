import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('4000'),
  API_VERSION: z.string().default('v1'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // Encryption (for WhatsApp auth state, etc.)
  ENCRYPTION_KEY: z.string().length(64),

  // Frontend
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),

  // Cloudinary (for media storage)
  // Format: cloudinary://API_KEY:API_SECRET@CLOUD_NAME
  CLOUDINARY_URL: z.string().optional(),

  // File Upload
  MAX_FILE_SIZE: z.string().transform(Number).default('10485760'),
  UPLOAD_DIR: z.string().default('./uploads'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('60000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_QUERIES: z.string().transform((v) => v === 'true').default('false'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
