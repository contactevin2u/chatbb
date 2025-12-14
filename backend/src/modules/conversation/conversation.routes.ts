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

const addTagSchema = z.object({
  tagId: z.string().uuid(),
});

const addNoteSchema = z.object({
  content: z.string().min(1).max(5000),
});

const updateNoteSchema = z.object({
  content: z.string().min(1).max(5000),
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

/**
 * @route   POST /api/v1/conversations/:id/active
 * @desc    Set active agent for conversation (collision prevention)
 * @access  Private (conversations:view)
 */
router.post(
  '/:id/active',
  requirePermission('conversations:view'),
  conversationController.setActiveAgent.bind(conversationController)
);

/**
 * @route   DELETE /api/v1/conversations/:id/active
 * @desc    Clear active agent when leaving conversation
 * @access  Private (conversations:view)
 */
router.delete(
  '/:id/active',
  requirePermission('conversations:view'),
  conversationController.clearActiveAgent.bind(conversationController)
);

// ==================== PIN ROUTES ====================

/**
 * @route   PUT /api/v1/conversations/:id/pin
 * @desc    Pin conversation
 * @access  Private (conversations:edit)
 */
router.put(
  '/:id/pin',
  requirePermission('conversations:edit'),
  conversationController.pinConversation.bind(conversationController)
);

/**
 * @route   DELETE /api/v1/conversations/:id/pin
 * @desc    Unpin conversation
 * @access  Private (conversations:edit)
 */
router.delete(
  '/:id/pin',
  requirePermission('conversations:edit'),
  conversationController.unpinConversation.bind(conversationController)
);

// ==================== TAG ROUTES ====================

/**
 * @route   GET /api/v1/conversations/:id/tags
 * @desc    Get tags for conversation
 * @access  Private (conversations:view)
 */
router.get(
  '/:id/tags',
  requirePermission('conversations:view'),
  conversationController.getTags.bind(conversationController)
);

/**
 * @route   POST /api/v1/conversations/:id/tags
 * @desc    Add tag to conversation
 * @access  Private (conversations:edit)
 */
router.post(
  '/:id/tags',
  requirePermission('conversations:edit'),
  validate(addTagSchema),
  conversationController.addTag.bind(conversationController)
);

/**
 * @route   DELETE /api/v1/conversations/:id/tags/:tagId
 * @desc    Remove tag from conversation
 * @access  Private (conversations:edit)
 */
router.delete(
  '/:id/tags/:tagId',
  requirePermission('conversations:edit'),
  conversationController.removeTag.bind(conversationController)
);

// ==================== NOTE ROUTES ====================

/**
 * @route   GET /api/v1/conversations/:id/notes
 * @desc    Get notes for conversation
 * @access  Private (conversations:view)
 */
router.get(
  '/:id/notes',
  requirePermission('conversations:view'),
  conversationController.getNotes.bind(conversationController)
);

/**
 * @route   POST /api/v1/conversations/:id/notes
 * @desc    Add note to conversation
 * @access  Private (conversations:edit)
 */
router.post(
  '/:id/notes',
  requirePermission('conversations:edit'),
  validate(addNoteSchema),
  conversationController.addNote.bind(conversationController)
);

/**
 * @route   PATCH /api/v1/notes/:noteId
 * @desc    Update note
 * @access  Private (conversations:edit)
 */
router.patch(
  '/notes/:noteId',
  requirePermission('conversations:edit'),
  validate(updateNoteSchema),
  conversationController.updateNote.bind(conversationController)
);

/**
 * @route   DELETE /api/v1/notes/:noteId
 * @desc    Delete note
 * @access  Private (conversations:edit)
 */
router.delete(
  '/notes/:noteId',
  requirePermission('conversations:edit'),
  conversationController.deleteNote.bind(conversationController)
);

// ==================== GROUP ROUTES ====================

/**
 * @route   GET /api/v1/conversations/:id/participants
 * @desc    Get group participants
 * @access  Private (conversations:view)
 */
router.get(
  '/:id/participants',
  requirePermission('conversations:view'),
  conversationController.getGroupParticipants.bind(conversationController)
);

export const conversationRoutes = router;
