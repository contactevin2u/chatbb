/**
 * Message Routes
 *
 * Express routes for message operations
 */

import { Router } from 'express';
import { z } from 'zod';

import { messageController } from './message.controller';
import { authMiddleware } from '../auth/auth.middleware';
import { requirePermission } from '../auth/guards/rbac.guard';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Validation schemas
const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().optional(),
  media: z
    .object({
      type: z.enum(['image', 'video', 'audio', 'document']),
      url: z.string().url().optional(),
      mimetype: z.string().optional(),
      filename: z.string().optional(),
      caption: z.string().optional(),
    })
    .optional(),
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
 * @route   POST /api/v1/messages
 * @desc    Send a message
 * @access  Private (conversations:reply)
 */
router.post(
  '/',
  requirePermission('conversations:reply'),
  validate(sendMessageSchema),
  messageController.sendMessage.bind(messageController)
);

/**
 * @route   GET /api/v1/messages/:id
 * @desc    Get a message
 * @access  Private (conversations:view)
 */
router.get(
  '/:id',
  requirePermission('conversations:view'),
  messageController.getMessage.bind(messageController)
);

/**
 * @route   DELETE /api/v1/messages/:id
 * @desc    Delete a message
 * @access  Private (conversations:edit)
 */
router.delete(
  '/:id',
  requirePermission('conversations:edit'),
  messageController.deleteMessage.bind(messageController)
);

export const messageRoutes = router;
