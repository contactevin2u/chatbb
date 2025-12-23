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
      const { conversationId, text, media, quotedMessageId } = req.body;

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
        quotedMessageId,
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

  /**
   * React to a message
   * POST /api/v1/messages/:id/react
   */
  async reactToMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;
      const { emoji } = req.body;

      if (!emoji && emoji !== '') {
        return res.status(400).json({
          success: false,
          error: 'emoji is required (use empty string to remove reaction)',
        });
      }

      const result = await messageService.reactToMessage(id, organizationId, emoji);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Edit a message
   * PATCH /api/v1/messages/:id/edit
   */
  async editMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;
      const { text } = req.body;

      if (!text) {
        return res.status(400).json({
          success: false,
          error: 'text is required',
        });
      }

      const result = await messageService.editMessage(id, organizationId, text);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Send a poll
   * POST /api/v1/messages/poll
   */
  async sendPoll(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId, sub: userId } = req.user!;
      const { conversationId, name, options, selectableCount } = req.body;

      if (!conversationId) {
        return res.status(400).json({
          success: false,
          error: 'conversationId is required',
        });
      }

      if (!name || !options || options.length < 2) {
        return res.status(400).json({
          success: false,
          error: 'Poll name and at least 2 options are required',
        });
      }

      const message = await messageService.sendPoll({
        conversationId,
        organizationId,
        userId,
        name,
        options,
        selectableCount,
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
   * Forward a message
   * POST /api/v1/messages/:id/forward
   */
  async forwardMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId, sub: userId } = req.user!;
      const { id } = req.params;
      const { targetConversationId } = req.body;

      if (!targetConversationId) {
        return res.status(400).json({
          success: false,
          error: 'targetConversationId is required',
        });
      }

      const result = await messageService.forwardMessage(id, targetConversationId, organizationId, userId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete message for everyone
   * DELETE /api/v1/messages/:id/everyone
   */
  async deleteMessageForEveryone(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;

      const result = await messageService.deleteMessageForEveryone(id, organizationId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const messageController = new MessageController();
