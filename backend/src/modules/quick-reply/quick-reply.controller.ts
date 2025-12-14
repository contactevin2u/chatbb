/**
 * Quick Reply Controller
 *
 * HTTP request handlers for quick reply operations
 */

import { Request, Response, NextFunction } from 'express';
import { quickReplyService } from './quick-reply.service';

export class QuickReplyController {
  /**
   * List quick replies
   * GET /api/v1/quick-replies
   */
  async listQuickReplies(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { search } = req.query;

      const quickReplies = await quickReplyService.listQuickReplies(
        organizationId,
        search as string | undefined
      );

      res.json({
        success: true,
        data: quickReplies,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Search quick replies by shortcut prefix (for autocomplete)
   * GET /api/v1/quick-replies/search
   */
  async searchByShortcut(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { prefix, limit } = req.query;

      if (!prefix) {
        return res.status(400).json({
          success: false,
          error: 'Prefix is required',
        });
      }

      const quickReplies = await quickReplyService.searchByShortcut(
        organizationId,
        prefix as string,
        limit ? parseInt(limit as string, 10) : undefined
      );

      res.json({
        success: true,
        data: quickReplies,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get quick reply by ID
   * GET /api/v1/quick-replies/:id
   */
  async getQuickReply(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;

      const quickReply = await quickReplyService.getQuickReply(id, organizationId);

      res.json({
        success: true,
        data: quickReply,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get quick reply by shortcut
   * GET /api/v1/quick-replies/shortcut/:shortcut
   */
  async getByShortcut(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { shortcut } = req.params;

      const quickReply = await quickReplyService.getByShortcut(organizationId, shortcut);

      if (!quickReply) {
        return res.status(404).json({
          success: false,
          error: 'Quick reply not found',
        });
      }

      res.json({
        success: true,
        data: quickReply,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create quick reply
   * POST /api/v1/quick-replies
   */
  async createQuickReply(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { name, shortcut, content, category } = req.body;

      const quickReply = await quickReplyService.createQuickReply({
        organizationId,
        name,
        shortcut,
        content,
        category,
      });

      res.status(201).json({
        success: true,
        data: quickReply,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update quick reply
   * PATCH /api/v1/quick-replies/:id
   */
  async updateQuickReply(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;
      const { name, shortcut, content, category } = req.body;

      const quickReply = await quickReplyService.updateQuickReply(id, organizationId, {
        name,
        shortcut,
        content,
        category,
      });

      res.json({
        success: true,
        data: quickReply,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete quick reply
   * DELETE /api/v1/quick-replies/:id
   */
  async deleteQuickReply(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;

      await quickReplyService.deleteQuickReply(id, organizationId);

      res.json({
        success: true,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Use quick reply (increment usage count)
   * POST /api/v1/quick-replies/:id/use
   */
  async useQuickReply(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;

      await quickReplyService.incrementUsageCount(id, organizationId);

      res.json({
        success: true,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get categories
   * GET /api/v1/quick-replies/categories
   */
  async getCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;

      const categories = await quickReplyService.getCategories(organizationId);

      res.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const quickReplyController = new QuickReplyController();
