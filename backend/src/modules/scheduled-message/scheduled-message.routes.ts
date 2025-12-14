/**
 * Scheduled Message Routes
 *
 * Express routes for scheduled message management
 */

import { Router } from 'express';
import { z } from 'zod';

import { scheduledMessageController } from './scheduled-message.controller';
import { authMiddleware } from '../auth/auth.middleware';
import { requirePermission } from '../auth/guards/rbac.guard';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Validation schemas
const contentSchema = z.object({
  text: z.string().max(4096).optional(),
  mediaType: z.enum(['image', 'video', 'audio', 'document']).optional(),
  mediaUrl: z.string().url().optional(),
  mediaFilename: z.string().optional(),
});

const createScheduledMessageSchema = z.object({
  conversationId: z.string().uuid(),
  content: contentSchema.refine(
    (data) => data.text || data.mediaUrl,
    { message: 'Either text or mediaUrl is required' }
  ),
  scheduledAt: z.string().refine(
    (val) => !isNaN(Date.parse(val)),
    { message: 'Invalid date format' }
  ),
});

const updateScheduledTimeSchema = z.object({
  scheduledAt: z.string().refine(
    (val) => !isNaN(Date.parse(val)),
    { message: 'Invalid date format' }
  ),
});

// Validation middleware
const validate = (schema: z.ZodSchema) => {
  return (req: any, res: any, next: any) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors,
        });
      }
      next(error);
    }
  };
};

/**
 * @route   POST /api/v1/scheduled-messages
 * @desc    Create a scheduled message
 * @access  Private (conversations:reply)
 */
router.post(
  '/',
  requirePermission('conversations:reply'),
  validate(createScheduledMessageSchema),
  scheduledMessageController.createScheduledMessage.bind(scheduledMessageController)
);

/**
 * @route   GET /api/v1/scheduled-messages/:id
 * @desc    Get a scheduled message
 * @access  Private (conversations:view)
 */
router.get(
  '/:id',
  requirePermission('conversations:view'),
  scheduledMessageController.getScheduledMessage.bind(scheduledMessageController)
);

/**
 * @route   PATCH /api/v1/scheduled-messages/:id
 * @desc    Update scheduled message time
 * @access  Private (conversations:reply)
 */
router.patch(
  '/:id',
  requirePermission('conversations:reply'),
  validate(updateScheduledTimeSchema),
  scheduledMessageController.updateScheduledTime.bind(scheduledMessageController)
);

/**
 * @route   DELETE /api/v1/scheduled-messages/:id
 * @desc    Cancel a scheduled message
 * @access  Private (conversations:reply)
 */
router.delete(
  '/:id',
  requirePermission('conversations:reply'),
  scheduledMessageController.cancelScheduledMessage.bind(scheduledMessageController)
);

export const scheduledMessageRoutes = router;
