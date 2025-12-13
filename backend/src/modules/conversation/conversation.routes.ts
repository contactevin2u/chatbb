/**
 * Conversation Routes
 *
 * Express routes for conversation management
 */

import { Router } from 'express';
import { z } from 'zod';

import { conversationController } from './conversation.controller';
import { authMiddleware } from '../auth/auth.middleware';
import { requirePermission } from '../auth/guards/rbac.guard';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Validation schemas
const updateConversationSchema = z.object({
  status: z.enum(['OPEN', 'PENDING', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
});

const assignConversationSchema = z.object({
  userId: z.string().uuid().nullable().optional(),
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
 * @route   GET /api/v1/conversations/stats
 * @desc    Get conversation statistics
 * @access  Private (conversations:view)
 */
router.get(
  '/stats',
  requirePermission('conversations:view'),
  conversationController.getStats.bind(conversationController)
);

/**
 * @route   GET /api/v1/conversations
 * @desc    List conversations with filters
 * @access  Private (conversations:view)
 */
router.get(
  '/',
  requirePermission('conversations:view'),
  conversationController.listConversations.bind(conversationController)
);

/**
 * @route   GET /api/v1/conversations/:id
 * @desc    Get conversation details
 * @access  Private (conversations:view)
 */
router.get(
  '/:id',
  requirePermission('conversations:view'),
  conversationController.getConversation.bind(conversationController)
);

/**
 * @route   PATCH /api/v1/conversations/:id
 * @desc    Update conversation
 * @access  Private (conversations:edit)
 */
router.patch(
  '/:id',
  requirePermission('conversations:edit'),
  validate(updateConversationSchema),
  conversationController.updateConversation.bind(conversationController)
);

/**
 * @route   POST /api/v1/conversations/:id/assign
 * @desc    Assign conversation to user
 * @access  Private (conversations:assign)
 */
router.post(
  '/:id/assign',
  requirePermission('conversations:assign'),
  validate(assignConversationSchema),
  conversationController.assignConversation.bind(conversationController)
);

/**
 * @route   POST /api/v1/conversations/:id/close
 * @desc    Close conversation
 * @access  Private (conversations:edit)
 */
router.post(
  '/:id/close',
  requirePermission('conversations:edit'),
  conversationController.closeConversation.bind(conversationController)
);

/**
 * @route   POST /api/v1/conversations/:id/reopen
 * @desc    Reopen conversation
 * @access  Private (conversations:edit)
 */
router.post(
  '/:id/reopen',
  requirePermission('conversations:edit'),
  conversationController.reopenConversation.bind(conversationController)
);

/**
 * @route   POST /api/v1/conversations/:id/read
 * @desc    Mark conversation as read
 * @access  Private (conversations:view)
 */
router.post(
  '/:id/read',
  requirePermission('conversations:view'),
  conversationController.markAsRead.bind(conversationController)
);

/**
 * @route   GET /api/v1/conversations/:id/messages
 * @desc    Get messages for conversation
 * @access  Private (conversations:view)
 */
router.get(
  '/:id/messages',
  requirePermission('conversations:view'),
  conversationController.getMessages.bind(conversationController)
);

export const conversationRoutes = router;
