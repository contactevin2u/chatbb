/**
 * Message Sequence Controller
 *
 * HTTP request handlers for message sequence operations
 */

import { Request, Response, NextFunction } from 'express';
import { MessageSequenceStatus } from '@prisma/client';
import { sequenceService } from './sequence.service';
import { redisClient } from '../../core/cache/redis.client';

export class SequenceController {
  /**
   * List sequences
   * GET /api/v1/sequences
   */
  async listSequences(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { status } = req.query;

      const sequences = await sequenceService.listSequences(
        organizationId,
        status as MessageSequenceStatus | undefined
      );

      res.json({
        success: true,
        data: sequences,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Search sequences by shortcut (for slash-command autocomplete)
   * GET /api/v1/sequences/search
   */
  async searchSequences(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { prefix, limit } = req.query;

      const sequences = await sequenceService.searchByShortcut(
        organizationId,
        prefix as string || '',
        limit ? parseInt(limit as string) : 5
      );

      res.json({
        success: true,
        data: sequences,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get sequence by ID
   * GET /api/v1/sequences/:id
   */
  async getSequence(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;

      const sequence = await sequenceService.getSequence(id, organizationId);

      res.json({
        success: true,
        data: sequence,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create sequence
   * POST /api/v1/sequences
   */
  async createSequence(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { name, shortcut, description, triggerType, triggerConfig, steps } = req.body;

      const sequence = await sequenceService.createSequence({
        organizationId,
        name,
        shortcut,
        description,
        triggerType,
        triggerConfig,
        steps: steps || [],
      });

      res.status(201).json({
        success: true,
        data: sequence,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update sequence
   * PATCH /api/v1/sequences/:id
   */
  async updateSequence(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;
      const { name, shortcut, description, status, triggerType, triggerConfig } = req.body;

      const sequence = await sequenceService.updateSequence(id, organizationId, {
        name,
        shortcut,
        description,
        status,
        triggerType,
        triggerConfig,
      });

      res.json({
        success: true,
        data: sequence,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete sequence
   * DELETE /api/v1/sequences/:id
   */
  async deleteSequence(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;

      await sequenceService.deleteSequence(id, organizationId);

      res.json({
        success: true,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Add step to sequence
   * POST /api/v1/sequences/:id/steps
   */
  async addStep(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;
      const { order, type, content } = req.body;

      const step = await sequenceService.addStep(id, organizationId, {
        order,
        type,
        content,
      });

      res.status(201).json({
        success: true,
        data: step,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update step
   * PATCH /api/v1/sequences/steps/:stepId
   */
  async updateStep(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { stepId } = req.params;
      const { order, type, content } = req.body;

      const step = await sequenceService.updateStep(stepId, organizationId, {
        order,
        type,
        content,
      });

      res.json({
        success: true,
        data: step,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete step
   * DELETE /api/v1/sequences/steps/:stepId
   */
  async deleteStep(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { stepId } = req.params;

      await sequenceService.deleteStep(stepId, organizationId);

      res.json({
        success: true,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reorder steps
   * PUT /api/v1/sequences/:id/reorder
   */
  async reorderSteps(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;
      const { stepIds } = req.body;

      const sequence = await sequenceService.reorderSteps(id, organizationId, stepIds);

      res.json({
        success: true,
        data: sequence,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Start sequence execution
   * POST /api/v1/sequences/:id/execute
   */
  async startExecution(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;
      const { conversationId } = req.body;

      const execution = await sequenceService.startExecution(id, conversationId, organizationId);

      // Trigger immediate processing via Redis pub/sub
      await redisClient.publish('sequence:execute', JSON.stringify({
        executionId: execution.id,
      }));

      res.status(201).json({
        success: true,
        data: execution,
      });
    } catch (error: any) {
      // Handle known error cases with proper HTTP status codes
      const message = error?.message || '';
      if (message.includes('not found') || message.includes('not active')) {
        return res.status(404).json({
          success: false,
          error: message,
        });
      }
      if (message.includes('already running')) {
        return res.status(409).json({
          success: false,
          error: message,
        });
      }
      next(error);
    }
  }

  /**
   * Stop sequence execution
   * POST /api/v1/sequences/executions/:executionId/stop
   */
  async stopExecution(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { executionId } = req.params;

      await sequenceService.stopExecution(executionId, organizationId);

      res.json({
        success: true,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get conversation executions
   * GET /api/v1/conversations/:conversationId/sequences
   */
  async getConversationExecutions(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { conversationId } = req.params;

      const executions = await sequenceService.getConversationExecutions(
        conversationId,
        organizationId
      );

      res.json({
        success: true,
        data: executions,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const sequenceController = new SequenceController();
