/**
 * Queue Routes
 *
 * Express routes for queue management and agent assignment
 */

import { Router } from 'express';
import { z } from 'zod';

import { queueController } from './queue.controller';
import { authMiddleware } from '../auth/auth.middleware';
import { requirePermission } from '../auth/guards/rbac.guard';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// ==================== VALIDATION SCHEMAS ====================

const assignAgentSchema = z.object({
  conversationId: z.string().uuid(),
  userId: z.string().uuid(),
  isPrimary: z.boolean().optional(),
});

const setPrimarySchema = z.object({
  conversationId: z.string().uuid(),
  userId: z.string().uuid(),
});

const autoAssignSchema = z.object({
  channelId: z.string().uuid().optional(),
  mode: z.enum(['MANUAL', 'ROUND_ROBIN', 'LOAD_BALANCED', 'TEAM_BASED']).optional(),
});

// ==================== VALIDATION MIDDLEWARE ====================

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

// ==================== ROUTES ====================

/**
 * @route   GET /api/v1/queue/stats
 * @desc    Get queue statistics
 * @access  Private (conversations:view)
 */
router.get(
  '/stats',
  requirePermission('conversations:view'),
  queueController.getStats.bind(queueController)
);

/**
 * @route   GET /api/v1/queue
 * @desc    Get unassigned conversations queue
 * @access  Private (conversations:view)
 */
router.get(
  '/',
  requirePermission('conversations:view'),
  queueController.getQueue.bind(queueController)
);

/**
 * @route   POST /api/v1/queue/take/:conversationId
 * @desc    Take a conversation from the queue (self-assign)
 * @access  Private (conversations:reply)
 */
router.post(
  '/take/:conversationId',
  requirePermission('conversations:reply'),
  queueController.takeConversation.bind(queueController)
);

/**
 * @route   POST /api/v1/queue/assign
 * @desc    Assign an agent to a conversation
 * @access  Private (conversations:assign)
 */
router.post(
  '/assign',
  requirePermission('conversations:assign'),
  validate(assignAgentSchema),
  queueController.assignAgent.bind(queueController)
);

/**
 * @route   DELETE /api/v1/queue/assign/:conversationId/:userId
 * @desc    Unassign an agent from a conversation
 * @access  Private (conversations:assign)
 */
router.delete(
  '/assign/:conversationId/:userId',
  requirePermission('conversations:assign'),
  queueController.unassignAgent.bind(queueController)
);

/**
 * @route   PUT /api/v1/queue/primary
 * @desc    Set primary agent for a conversation
 * @access  Private (conversations:assign)
 */
router.put(
  '/primary',
  requirePermission('conversations:assign'),
  validate(setPrimarySchema),
  queueController.setPrimaryAgent.bind(queueController)
);

/**
 * @route   GET /api/v1/queue/agents/:conversationId
 * @desc    Get agents assigned to a conversation
 * @access  Private (conversations:view)
 */
router.get(
  '/agents/:conversationId',
  requirePermission('conversations:view'),
  queueController.getConversationAgents.bind(queueController)
);

/**
 * @route   POST /api/v1/queue/auto-assign/:conversationId
 * @desc    Auto-assign a conversation
 * @access  Private (conversations:assign)
 */
router.post(
  '/auto-assign/:conversationId',
  requirePermission('conversations:assign'),
  validate(autoAssignSchema),
  queueController.autoAssign.bind(queueController)
);

export const queueRoutes = router;
