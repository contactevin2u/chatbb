/**
 * Message Controller
 *
 * HTTP request handlers for message operations
 */

import { Request, Response, NextFunction } from 'express';
import { messageService } from './message.service';

export class MessageController {
  /**
   * Send a message
   * POST /api/v1/messages
   */
  async sendMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId, sub: userId } = req.user!;
      const { conversationId, text, media } = req.body;

      if (!conversationId) {
        return res.status(400).json({
          success: false,
          error: 'conversationId is required',
        });
      }

      if (!text && !media) {
        return res.status(400).json({
          success: false,
          error: 'Either text or media is required',
        });
      }

      const message = await messageService.sendMessage({
        conversationId,
        organizationId,
        userId,
        text,
        media,
      });

      res.status(201).json({
        success: true,
        data: message,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a message
   * GET /api/v1/messages/:id
   */
  async getMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;

      const message = await messageService.getMessage(id, organizationId);

      res.json({
        success: true,
        data: message,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a message
   * DELETE /api/v1/messages/:id
   */
  async deleteMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;

      const message = await messageService.deleteMessage(id, organizationId);

      res.json({
        success: true,
        data: message,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const messageController = new MessageController();
