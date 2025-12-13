import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { logger } from './shared/utils/logger.js';
import { errorMiddleware } from './shared/middleware/error.middleware.js';

// Import routes
import { authRoutes } from './modules/auth/auth.routes.js';
import { userRoutes } from './modules/user/user.routes.js';
import { organizationRoutes } from './modules/organization/organization.routes.js';
import { teamRoutes } from './modules/team/team.routes.js';
import { channelRoutes } from './modules/channel/channel.routes.js';
import { whatsappRoutes } from './modules/whatsapp/whatsapp.routes.js';
import { conversationRoutes } from './modules/conversation/conversation.routes.js';
import { messageRoutes } from './modules/message/message.routes.js';
import { contactRoutes } from './modules/contact/contact.routes.js';
import { automationRoutes } from './modules/automation/automation.routes.js';
import { broadcastRoutes } from './modules/broadcast/broadcast.routes.js';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';
import { webhookRoutes } from './modules/webhook/webhook.routes.js';

export function createApp(): Express {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    })
  );

  // Rate limiting
  const limiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
    skip: (req) => req.path === '/health',
  });
  app.use(limiter);

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.info({ method: req.method, path: req.path }, 'Incoming request');
    next();
  });

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API Routes
  const apiPrefix = `/api/${env.API_VERSION}`;

  app.use(`${apiPrefix}/auth`, authRoutes);
  app.use(`${apiPrefix}/users`, userRoutes);
  app.use(`${apiPrefix}/organization`, organizationRoutes);
  app.use(`${apiPrefix}/teams`, teamRoutes);
  app.use(`${apiPrefix}/channels`, channelRoutes);
  app.use(`${apiPrefix}/channels/whatsapp`, whatsappRoutes);
  app.use(`${apiPrefix}/conversations`, conversationRoutes);
  app.use(`${apiPrefix}/messages`, messageRoutes);
  app.use(`${apiPrefix}/contacts`, contactRoutes);
  app.use(`${apiPrefix}/automations`, automationRoutes);
  app.use(`${apiPrefix}/broadcasts`, broadcastRoutes);
  app.use(`${apiPrefix}/analytics`, analyticsRoutes);
  app.use(`${apiPrefix}/webhooks`, webhookRoutes);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler
  app.use(errorMiddleware);

  return app;
}
