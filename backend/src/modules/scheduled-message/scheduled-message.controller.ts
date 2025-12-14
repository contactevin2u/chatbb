/**
 * Scheduled Message Controller
 *
 * HTTP request handlers for scheduled message operations
 */

import { Request, Response, NextFunction } from 'express';
import { scheduledMessageService } from './scheduled-message.service';

export class ScheduledMessageController {
  /**
   * Create a scheduled message
   * POST /api/v1/scheduled-messages
   */
  async createScheduledMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { sub: userId, organizationId } = req.user!;
      const { conversationId, content, scheduledAt } = req.body;

      const scheduledMessage = await scheduledMessageService.createScheduledMessage({
        organizationId,
        conversationId,
        createdById: userId,
        content,
        scheduledAt: new Date(scheduledAt),
      });

      res.status(201).json({
        success: true,
        data: scheduledMessage,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List scheduled messages for a conversation
   * GET /api/v1/conversations/:conversationId/scheduled-messages
   */
  async listForConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { conversationId } = req.params;

      const scheduledMessages = await scheduledMessageService.listForConversation(
        conversationId,
        organizationId
      );

      res.json({
        success: true,
        data: scheduledMessages,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a scheduled message
   * GET /api/v1/scheduled-messages/:id
   */
  async getScheduledMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;

      const scheduledMessage = await scheduledMessageService.getScheduledMessage(
        id,
        organizationId
      );

      res.json({
        success: true,
        data: scheduledMessage,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancel a scheduled message
   * DELETE /api/v1/scheduled-messages/:id
   */
  async cancelScheduledMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;

      await scheduledMessageService.cancelScheduledMessage(id, organizationId);

      res.json({
        success: true,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update scheduled message time
   * PATCH /api/v1/scheduled-messages/:id
   */
  async updateScheduledTime(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;
      const { scheduledAt } = req.body;

      const scheduledMessage = await scheduledMessageService.updateScheduledTime(
        id,
        organizationId,
        new Date(scheduledAt)
      );

      res.json({
        success: true,
        data: scheduledMessage,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const scheduledMessageController = new ScheduledMessageController();
