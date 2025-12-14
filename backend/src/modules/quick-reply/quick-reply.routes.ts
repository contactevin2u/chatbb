/**
 * Quick Reply Routes
 *
 * Express routes for quick reply management
 */

import { Router } from 'express';
import { z } from 'zod';

import { quickReplyController } from './quick-reply.controller';
import { authMiddleware } from '../auth/auth.middleware';
import { requirePermission } from '../auth/guards/rbac.guard';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Validation schemas
const contentSchema = z.object({
  text: z.string().min(1).max(4096),
  media: z
    .object({
      type: z.enum(['image', 'video', 'audio', 'document']),
      url: z.string().url(),
      filename: z.string().optional(),
      mimetype: z.string().optional(),
    })
    .optional(),
});

const createQuickReplySchema = z.object({
  name: z.string().min(1).max(100),
  shortcut: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Shortcut can only contain letters, numbers, underscores, and hyphens'),
  content: contentSchema,
  category: z.string().max(50).optional(),
});

const updateQuickReplySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  shortcut: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Shortcut can only contain letters, numbers, underscores, and hyphens')
    .optional(),
  content: contentSchema.optional(),
  category: z.string().max(50).nullable().optional(),
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
 * @route   GET /api/v1/quick-replies/search
 * @desc    Search quick replies by shortcut prefix (for autocomplete)
 * @access  Private
 */
router.get(
  '/search',
  requirePermission('conversations:view'),
  quickReplyController.searchByShortcut.bind(quickReplyController)
);

/**
 * @route   GET /api/v1/quick-replies/categories
 * @desc    Get all categories
 * @access  Private
 */
router.get(
  '/categories',
  requirePermission('conversations:view'),
  quickReplyController.getCategories.bind(quickReplyController)
);

/**
 * @route   GET /api/v1/quick-replies/shortcut/:shortcut
 * @desc    Get quick reply by shortcut
 * @access  Private
 */
router.get(
  '/shortcut/:shortcut',
  requirePermission('conversations:view'),
  quickReplyController.getByShortcut.bind(quickReplyController)
);

/**
 * @route   GET /api/v1/quick-replies
 * @desc    List all quick replies
 * @access  Private
 */
router.get(
  '/',
  requirePermission('conversations:view'),
  quickReplyController.listQuickReplies.bind(quickReplyController)
);

/**
 * @route   GET /api/v1/quick-replies/:id
 * @desc    Get quick reply by ID
 * @access  Private
 */
router.get(
  '/:id',
  requirePermission('conversations:view'),
  quickReplyController.getQuickReply.bind(quickReplyController)
);

/**
 * @route   POST /api/v1/quick-replies
 * @desc    Create new quick reply
 * @access  Private (automation:create - admin level)
 */
router.post(
  '/',
  requirePermission('automation:create'),
  validate(createQuickReplySchema),
  quickReplyController.createQuickReply.bind(quickReplyController)
);

/**
 * @route   PATCH /api/v1/quick-replies/:id
 * @desc    Update quick reply
 * @access  Private (automation:update - admin level)
 */
router.patch(
  '/:id',
  requirePermission('automation:update'),
  validate(updateQuickReplySchema),
  quickReplyController.updateQuickReply.bind(quickReplyController)
);

/**
 * @route   DELETE /api/v1/quick-replies/:id
 * @desc    Delete quick reply
 * @access  Private (automation:delete - admin level)
 */
router.delete(
  '/:id',
  requirePermission('automation:delete'),
  quickReplyController.deleteQuickReply.bind(quickReplyController)
);

/**
 * @route   POST /api/v1/quick-replies/:id/use
 * @desc    Increment usage count
 * @access  Private
 */
router.post(
  '/:id/use',
  requirePermission('conversations:view'),
  quickReplyController.useQuickReply.bind(quickReplyController)
);

export const quickReplyRoutes = router;
