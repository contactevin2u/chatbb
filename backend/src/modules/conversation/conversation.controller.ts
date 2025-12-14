/**
 * Conversation Controller
 *
 * HTTP request handlers for conversation operations
 */

import { Request, Response, NextFunction } from 'express';
import { ConversationStatus, Priority } from '@prisma/client';
import { conversationService } from './conversation.service';
import { messageService } from '../message/message.service';

export class ConversationController {
  /**
   * List conversations
   * GET /api/v1/conversations
   */
  async listConversations(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const {
        status,
        assignedUserId,
        channelId,
        search,
        limit,
        offset,
        sortBy,
        sortOrder,
      } = req.query;

      // Parse status (can be comma-separated)
      let statusFilter: ConversationStatus | ConversationStatus[] | undefined;
      if (status) {
        const statusStr = status as string;
        if (statusStr.includes(',')) {
          statusFilter = statusStr.split(',') as ConversationStatus[];
        } else {
          statusFilter = statusStr as ConversationStatus;
        }
      }

      const result = await conversationService.listConversations({
        organizationId,
        status: statusFilter,
        assignedUserId: assignedUserId === 'null' ? null : (assignedUserId as string | undefined),
        channelId: channelId as string | undefined,
        search: search as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
        sortBy: sortBy as 'lastMessageAt' | 'createdAt' | 'unreadCount' | undefined,
        sortOrder: sortOrder as 'asc' | 'desc' | undefined,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get conversation
   * GET /api/v1/conversations/:id
   */
  async getConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;

      const conversation = await conversationService.getConversation(id, organizationId);

      res.json({
        success: true,
        data: conversation,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update conversation
   * PATCH /api/v1/conversations/:id
   */
  async updateConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;
      const { status, priority, assignedUserId } = req.body;

      const conversation = await conversationService.updateConversation(id, organizationId, {
        status: status as ConversationStatus | undefined,
        priority: priority as Priority | undefined,
        assignedUserId,
      });

      res.json({
        success: true,
        data: conversation,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Assign conversation to user
   * POST /api/v1/conversations/:id/assign
   */
  async assignConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;
      const { userId } = req.body;

      const conversation = await conversationService.assignConversation(
        id,
        organizationId,
        userId || null
      );

      res.json({
        success: true,
        data: conversation,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Close conversation
   * POST /api/v1/conversations/:id/close
   */
  async closeConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;

      const conversation = await conversationService.closeConversation(id, organizationId);

      res.json({
        success: true,
        data: conversation,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reopen conversation
   * POST /api/v1/conversations/:id/reopen
   */
  async reopenConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;

      const conversation = await conversationService.reopenConversation(id, organizationId);

      res.json({
        success: true,
        data: conversation,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark conversation as read
   * POST /api/v1/conversations/:id/read
   */
  async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;

      const conversation = await conversationService.markAsRead(id, organizationId);

      res.json({
        success: true,
        data: conversation,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get messages for a conversation
   * GET /api/v1/conversations/:id/messages
   */
  async getMessages(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;
      const { limit, before, after } = req.query;

      const result = await messageService.getMessages({
        conversationId: id,
        organizationId,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        before: before as string | undefined,
        after: after as string | undefined,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get conversation stats
   * GET /api/v1/conversations/stats
   */
  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;

      const stats = await conversationService.getStats(organizationId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Set active agent for a conversation (collision prevention)
   * POST /api/v1/conversations/:id/active
   */
  async setActiveAgent(req: Request, res: Response, next: NextFunction) {
    try {
      const { sub: userId, organizationId } = req.user!;
      const { id: conversationId } = req.params;

      const result = await conversationService.setActiveAgent(
        conversationId,
        userId,
        organizationId
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Clear active agent when leaving conversation
   * DELETE /api/v1/conversations/:id/active
   */
  async clearActiveAgent(req: Request, res: Response, next: NextFunction) {
    try {
      const { sub: userId } = req.user!;
      const { id: conversationId } = req.params;

      await conversationService.clearActiveAgent(conversationId, userId);

      res.json({
        success: true,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const conversationController = new ConversationController();
