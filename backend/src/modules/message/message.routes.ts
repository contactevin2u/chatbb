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
  quotedMessageId: z.string().optional(),
});

const reactToMessageSchema = z.object({
  emoji: z.string(), // Empty string to remove reaction
});

const editMessageSchema = z.object({
  text: z.string().min(1),
});

const sendPollSchema = z.object({
  conversationId: z.string().uuid(),
  name: z.string().min(1).max(256),
  options: z.array(z.string().min(1).max(100)).min(2).max(12),
  selectableCount: z.number().min(1).optional(),
});

const forwardMessageSchema = z.object({
  targetConversationId: z.string().uuid(),
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

/**
 * @route   POST /api/v1/messages/:id/react
 * @desc    React to a message
 * @access  Private (conversations:reply)
 */
router.post(
  '/:id/react',
  requirePermission('conversations:reply'),
  validate(reactToMessageSchema),
  messageController.reactToMessage.bind(messageController)
);

/**
 * @route   PATCH /api/v1/messages/:id/edit
 * @desc    Edit a message
 * @access  Private (conversations:edit)
 */
router.patch(
  '/:id/edit',
  requirePermission('conversations:edit'),
  validate(editMessageSchema),
  messageController.editMessage.bind(messageController)
);

/**
 * @route   POST /api/v1/messages/poll
 * @desc    Send a poll
 * @access  Private (conversations:reply)
 */
router.post(
  '/poll',
  requirePermission('conversations:reply'),
  validate(sendPollSchema),
  messageController.sendPoll.bind(messageController)
);

/**
 * @route   DELETE /api/v1/messages/:id/everyone
 * @desc    Delete message for everyone
 * @access  Private (conversations:edit)
 */
router.delete(
  '/:id/everyone',
  requirePermission('conversations:edit'),
  messageController.deleteMessageForEveryone.bind(messageController)
);

/**
 * @route   POST /api/v1/messages/:id/forward
 * @desc    Forward a message to another conversation
 * @access  Private (conversations:reply)
 */
router.post(
  '/:id/forward',
  requirePermission('conversations:reply'),
  validate(forwardMessageSchema),
  messageController.forwardMessage.bind(messageController)
);

export const messageRoutes = router;
