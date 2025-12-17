/**
 * Message Sequence Routes
 *
 * Express routes for message sequence management
 */

import { Router } from 'express';
import { z } from 'zod';

import { sequenceController } from './sequence.controller';
import { authMiddleware } from '../auth/auth.middleware';
import { requirePermission } from '../auth/guards/rbac.guard';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Validation schemas
const stepContentSchema = z.object({
  text: z.string().max(4096).optional(),
  mediaUrl: z.string().url().optional(),
  mediaFilename: z.string().optional(),
  mediaType: z.enum(['image', 'video', 'audio', 'document']).optional(),
  delayMinutes: z.number().min(1).max(10080).optional(), // Max 7 days
});

const stepSchema = z.object({
  order: z.number().int().min(0),
  type: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'DELAY']),
  content: stepContentSchema,
});

const createSequenceSchema = z.object({
  name: z.string().min(1).max(100),
  shortcut: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  description: z.string().max(500).optional(),
  triggerType: z.string().optional(),
  triggerConfig: z.any().optional(),
  steps: z.array(stepSchema).optional(),
});

const updateSequenceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  shortcut: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
  triggerType: z.string().optional(),
  triggerConfig: z.any().optional(),
});

const reorderStepsSchema = z.object({
  stepIds: z.array(z.string().uuid()),
});

const executeSequenceSchema = z.object({
  conversationId: z.string().uuid(),
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

// ==================== STEP ROUTES (must be before :id routes) ====================

/**
 * @route   PATCH /api/v1/sequences/steps/:stepId
 * @desc    Update a step
 * @access  Private (automation:update)
 */
router.patch(
  '/steps/:stepId',
  requirePermission('automation:update'),
  validate(stepSchema.partial()),
  sequenceController.updateStep.bind(sequenceController)
);

/**
 * @route   DELETE /api/v1/sequences/steps/:stepId
 * @desc    Delete a step
 * @access  Private (automation:delete)
 */
router.delete(
  '/steps/:stepId',
  requirePermission('automation:delete'),
  sequenceController.deleteStep.bind(sequenceController)
);

// ==================== EXECUTION ROUTES ====================

/**
 * @route   POST /api/v1/sequences/executions/:executionId/stop
 * @desc    Stop a sequence execution
 * @access  Private (automation:update)
 */
router.post(
  '/executions/:executionId/stop',
  requirePermission('automation:update'),
  sequenceController.stopExecution.bind(sequenceController)
);

// ==================== SEQUENCE ROUTES ====================

/**
 * @route   GET /api/v1/sequences
 * @desc    List all sequences
 * @access  Private (automation:read)
 */
router.get(
  '/',
  requirePermission('automation:read'),
  sequenceController.listSequences.bind(sequenceController)
);

/**
 * @route   GET /api/v1/sequences/search
 * @desc    Search sequences by shortcut prefix (for autocomplete)
 * @access  Private (automation:read)
 */
router.get(
  '/search',
  requirePermission('automation:read'),
  sequenceController.searchSequences.bind(sequenceController)
);

/**
 * @route   POST /api/v1/sequences
 * @desc    Create a new sequence
 * @access  Private (automation:create)
 */
router.post(
  '/',
  requirePermission('automation:create'),
  validate(createSequenceSchema),
  sequenceController.createSequence.bind(sequenceController)
);

/**
 * @route   GET /api/v1/sequences/:id
 * @desc    Get sequence by ID
 * @access  Private (automation:read)
 */
router.get(
  '/:id',
  requirePermission('automation:read'),
  sequenceController.getSequence.bind(sequenceController)
);

/**
 * @route   PATCH /api/v1/sequences/:id
 * @desc    Update a sequence
 * @access  Private (automation:update)
 */
router.patch(
  '/:id',
  requirePermission('automation:update'),
  validate(updateSequenceSchema),
  sequenceController.updateSequence.bind(sequenceController)
);

/**
 * @route   DELETE /api/v1/sequences/:id
 * @desc    Delete a sequence
 * @access  Private (automation:delete)
 */
router.delete(
  '/:id',
  requirePermission('automation:delete'),
  sequenceController.deleteSequence.bind(sequenceController)
);

/**
 * @route   POST /api/v1/sequences/:id/steps
 * @desc    Add step to sequence
 * @access  Private (automation:update)
 */
router.post(
  '/:id/steps',
  requirePermission('automation:update'),
  validate(stepSchema),
  sequenceController.addStep.bind(sequenceController)
);

/**
 * @route   PUT /api/v1/sequences/:id/reorder
 * @desc    Reorder steps in sequence
 * @access  Private (automation:update)
 */
router.put(
  '/:id/reorder',
  requirePermission('automation:update'),
  validate(reorderStepsSchema),
  sequenceController.reorderSteps.bind(sequenceController)
);

/**
 * @route   POST /api/v1/sequences/:id/execute
 * @desc    Start sequence execution for a conversation
 * @access  Private (automation:read) - executing/using a sequence is reading, not modifying
 */
router.post(
  '/:id/execute',
  requirePermission('automation:read'),
  validate(executeSequenceSchema),
  sequenceController.startExecution.bind(sequenceController)
);

export const sequenceRoutes = router;
