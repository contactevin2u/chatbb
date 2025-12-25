/**
 * External Notification Webhook
 * Allows external systems (like Autocount) to send messages to WhatsApp
 *
 * POST /api/v1/notifications/send
 *
 * Headers:
 *   X-API-Key: <NOTIFICATION_API_KEY from environment>
 *
 * Body (Text Message):
 * {
 *   "channel_id": "uuid-of-whatsapp-channel",
 *   "to": "120363xxxxx@g.us",  // Group JID or phone number
 *   "message": "Your message text here"
 * }
 *
 * Body (Media Message):
 * {
 *   "channel_id": "uuid-of-whatsapp-channel",
 *   "to": "120363xxxxx@g.us",
 *   "media": {
 *     "type": "image",  // image, video, audio, document
 *     "url": "https://example.com/image.jpg",
 *     "caption": "Optional caption",
 *     "filename": "document.pdf"  // For documents
 *   }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "message_id": "xxx",
 *   "external_id": "xxx"
 * }
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env.js';
import { notificationController } from './notification.controller.js';
import { UnauthorizedException } from '../../shared/exceptions/base.exception.js';
import { logger } from '../../shared/utils/logger.js';

const router = Router();

// Request validation schema
const sendNotificationSchema = z.object({
  channel_id: z.string().uuid('Invalid channel_id format'),
  to: z.string().min(1, 'Recipient is required').max(50, 'Recipient too long'),
  message: z.string().min(1).max(4096).optional(),
  media: z.object({
    type: z.enum(['image', 'video', 'audio', 'document']),
    url: z.string().url('Invalid media URL'),
    filename: z.string().optional(),
    caption: z.string().max(4096).optional(),
  }).optional(),
}).refine(
  (data) => data.message || data.media,
  { message: 'Either message or media is required' }
);

// Validation middleware
const validate = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
    }
    req.body = result.data;
    next();
  };
};

// API Key authentication middleware
const apiKeyAuth = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];

  if (!env.NOTIFICATION_API_KEY) {
    logger.warn('[Notification] NOTIFICATION_API_KEY not configured');
    return res.status(503).json({
      success: false,
      error: 'Notification API not configured',
    });
  }

  if (!apiKey || apiKey !== env.NOTIFICATION_API_KEY) {
    logger.warn(
      { ip: req.ip, hasKey: !!apiKey },
      '[Notification] Invalid API key attempt'
    );
    return res.status(401).json({
      success: false,
      error: 'Invalid API key',
    });
  }

  next();
};

// Rate limiting: 60 requests per minute per IP
const notificationRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Rate limit exceeded. Maximum 60 requests per minute.',
  },
  keyGenerator: (req) => req.ip || 'unknown',
});

/**
 * @route   POST /api/v1/notifications/send
 * @desc    Send a notification message via WhatsApp
 * @access  API Key required (X-API-Key header)
 */
router.post(
  '/send',
  notificationRateLimit,
  apiKeyAuth,
  validate(sendNotificationSchema),
  notificationController.send.bind(notificationController)
);

export const notificationRoutes = router;
