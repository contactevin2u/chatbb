/**
 * Queue Controller
 *
 * HTTP request handlers for queue operations
 */

import { Request, Response, NextFunction } from 'express';
import { queueService, AssignmentMode } from './queue.service';

export class QueueController {
  /**
   * Get queue statistics
   * GET /api/v1/queue/stats
   */
  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;

      const stats = await queueService.getQueueStats(organizationId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get unassigned conversations queue
   * GET /api/v1/queue
   */
  async getQueue(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { channelId, limit } = req.query;

      const queue = await queueService.getUnassignedQueue(
        organizationId,
        channelId as string | undefined,
        limit ? parseInt(limit as string, 10) : 50
      );

      res.json({
        success: true,
        data: queue,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Take a conversation from the queue (self-assign)
   * POST /api/v1/queue/take/:conversationId
   */
  async takeConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId, sub: userId } = req.user!;
      const { conversationId } = req.params;

      const assignment = await queueService.takeConversation(
        conversationId,
        userId,
        organizationId
      );

      res.json({
        success: true,
        data: assignment,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Assign an agent to a conversation
   * POST /api/v1/queue/assign
   */
  async assignAgent(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId, sub: assignedById } = req.user!;
      const { conversationId, userId, isPrimary } = req.body;

      const assignment = await queueService.assignAgent(
        conversationId,
        userId,
        organizationId,
        isPrimary,
        assignedById
      );

      res.json({
        success: true,
        data: assignment,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Unassign an agent from a conversation
   * DELETE /api/v1/queue/assign/:conversationId/:userId
   */
  async unassignAgent(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { conversationId, userId } = req.params;

      await queueService.unassignAgent(conversationId, userId, organizationId);

      res.json({
        success: true,
        message: 'Agent unassigned successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Set primary agent for a conversation
   * PUT /api/v1/queue/primary
   */
  async setPrimaryAgent(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { conversationId, userId } = req.body;

      const assignment = await queueService.setPrimaryAgent(
        conversationId,
        userId,
        organizationId
      );

      res.json({
        success: true,
        data: assignment,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get agents assigned to a conversation
   * GET /api/v1/queue/agents/:conversationId
   */
  async getConversationAgents(req: Request, res: Response, next: NextFunction) {
    try {
      const { conversationId } = req.params;

      const agents = await queueService.getAgentsForConversation(conversationId);

      res.json({
        success: true,
        data: agents,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Auto-assign a conversation
   * POST /api/v1/queue/auto-assign/:conversationId
   */
  async autoAssign(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { conversationId } = req.params;
      const { mode, channelId } = req.body;

      const assignment = await queueService.autoAssign(
        conversationId,
        organizationId,
        channelId,
        mode as AssignmentMode
      );

      if (!assignment) {
        return res.json({
          success: true,
          data: null,
          message: 'No available agents for auto-assignment',
        });
      }

      res.json({
        success: true,
        data: assignment,
      });
    } catch (error) {
      next(error);
    }
  }
}

// Export singleton instance
export const queueController = new QueueController();
