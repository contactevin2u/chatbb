/**
 * Conversation Controller
 *
 * HTTP request handlers for conversation operations
 */

import { Request, Response, NextFunction } from 'express';
import { ConversationStatus, Priority } from '@prisma/client';
import { conversationService } from './conversation.service';
import { messageService } from '../message/message.service';
import { redisClient } from '../../core/cache/redis.client';

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
        tagIds,
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

      // Parse tagIds (can be comma-separated)
      let tagIdsFilter: string[] | undefined;
      if (tagIds) {
        tagIdsFilter = (tagIds as string).split(',').filter(Boolean);
      }

      const result = await conversationService.listConversations({
        organizationId,
        status: statusFilter,
        assignedUserId: assignedUserId === 'null' ? null : (assignedUserId as string | undefined),
        channelId: channelId as string | undefined,
        tagIds: tagIdsFilter,
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
   * Get unreplied conversations count (last 72 hours)
   * GET /api/v1/conversations/unreplied
   */
  async getUnrepliedCount(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;

      const unreplied = await conversationService.getUnrepliedCount(organizationId);

      res.json({
        success: true,
        data: unreplied,
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

  // ==================== PIN METHODS ====================

  /**
   * Pin conversation
   * PUT /api/v1/conversations/:id/pin
   */
  async pinConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;

      const conversation = await conversationService.pinConversation(id, organizationId);

      res.json({
        success: true,
        data: conversation,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Unpin conversation
   * DELETE /api/v1/conversations/:id/pin
   */
  async unpinConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;

      const conversation = await conversationService.unpinConversation(id, organizationId);

      res.json({
        success: true,
        data: conversation,
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== TAG METHODS ====================

  /**
   * Get tags for conversation
   * GET /api/v1/conversations/:id/tags
   */
  async getTags(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;

      const tags = await conversationService.getTags(id, organizationId);

      res.json({
        success: true,
        data: tags,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Add tag to conversation
   * POST /api/v1/conversations/:id/tags
   */
  async addTag(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;
      const { tagId } = req.body;

      const conversationTag = await conversationService.addTag(id, tagId, organizationId);

      res.json({
        success: true,
        data: conversationTag,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Remove tag from conversation
   * DELETE /api/v1/conversations/:id/tags/:tagId
   */
  async removeTag(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id, tagId } = req.params;

      await conversationService.removeTag(id, tagId, organizationId);

      res.json({
        success: true,
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== NOTE METHODS ====================

  /**
   * Get notes for conversation
   * GET /api/v1/conversations/:id/notes
   */
  async getNotes(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;

      const notes = await conversationService.getNotes(id, organizationId);

      res.json({
        success: true,
        data: notes,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Add note to conversation
   * POST /api/v1/conversations/:id/notes
   */
  async addNote(req: Request, res: Response, next: NextFunction) {
    try {
      const { sub: userId, organizationId } = req.user!;
      const { id } = req.params;
      const { content } = req.body;

      const note = await conversationService.addNote(id, userId, content, organizationId);

      res.json({
        success: true,
        data: note,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update note
   * PATCH /api/v1/notes/:noteId
   */
  async updateNote(req: Request, res: Response, next: NextFunction) {
    try {
      const { sub: userId, organizationId } = req.user!;
      const { noteId } = req.params;
      const { content } = req.body;

      const note = await conversationService.updateNote(noteId, userId, content, organizationId);

      res.json({
        success: true,
        data: note,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete note
   * DELETE /api/v1/notes/:noteId
   */
  async deleteNote(req: Request, res: Response, next: NextFunction) {
    try {
      const { sub: userId, organizationId } = req.user!;
      const { noteId } = req.params;

      await conversationService.deleteNote(noteId, userId, organizationId);

      res.json({
        success: true,
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== GROUP METHODS ====================

  /**
   * Get group participants
   * GET /api/v1/conversations/:id/participants
   */
  async getGroupParticipants(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;

      const result = await conversationService.getGroupParticipants(id, organizationId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Fetch older message history from WhatsApp (on-demand)
   * POST /api/v1/conversations/:id/fetch-history
   *
   * This triggers a request to WhatsApp to fetch older messages.
   * Messages will arrive via WebSocket when ready.
   */
  async fetchHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;

      // Get conversation details
      const conversation = await conversationService.getConversation(id, organizationId);
      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found',
        });
      }

      // Get oldest message to use as anchor for history fetch
      const oldestMessage = await messageService.getOldestMessage(id);

      if (!oldestMessage) {
        return res.json({
          success: true,
          data: { fetching: false, reason: 'no_messages' },
        });
      }

      // Check if we have externalId (WhatsApp message ID) - required for fetch
      if (!oldestMessage.externalId) {
        console.log('[fetchHistory] No externalId found, returning no_external_id');
        return res.json({
          success: true,
          data: { fetching: false, reason: 'no_external_id' },
        });
      }

      // Try to get key from metadata first, otherwise reconstruct from existing data
      const metadata = oldestMessage.metadata as any;
      let messageKey: { remoteJid: string; id: string; fromMe: boolean };
      let messageTimestamp: number;

      if (metadata?.key) {
        // Use stored key from metadata (newer messages)
        messageKey = metadata.key;
        messageTimestamp = metadata.messageTimestamp || Math.floor(new Date(oldestMessage.createdAt).getTime() / 1000);
        console.log('[fetchHistory] Using key from metadata:', { messageKey, messageTimestamp });
      } else {
        // Reconstruct key from existing data (older messages without stored key)
        const contactIdentifier = oldestMessage.conversation?.contact?.identifier;
        if (!contactIdentifier) {
          console.log('[fetchHistory] No contact identifier found, returning no_contact');
          return res.json({
            success: true,
            data: { fetching: false, reason: 'no_contact' },
          });
        }

        // Determine remoteJid - check if it's a group or individual chat
        const isGroup = oldestMessage.conversation?.contact?.isGroup || false;
        const remoteJid = isGroup
          ? `${contactIdentifier}@g.us`  // Group JID format
          : `${contactIdentifier}@s.whatsapp.net`;  // Individual JID format

        messageKey = {
          remoteJid,
          id: oldestMessage.externalId,
          fromMe: oldestMessage.direction === 'OUTBOUND',
        };
        messageTimestamp = metadata?.timestamp || Math.floor(new Date(oldestMessage.createdAt).getTime() / 1000);
        console.log('[fetchHistory] Reconstructed key from data:', { messageKey, messageTimestamp, contactIdentifier });
      }

      // Publish command to WhatsApp worker
      // Pattern: whatsapp:cmd:{command}:{channelId}
      const commandPayload = {
        conversationId: conversation.id,
        messageKey,
        messageTimestamp,
      };
      console.log('[fetchHistory] Publishing command:', {
        channel: `whatsapp:cmd:fetch-history:${conversation.channelId}`,
        payload: commandPayload
      });

      await redisClient.publish(
        `whatsapp:cmd:fetch-history:${conversation.channelId}`,
        JSON.stringify(commandPayload)
      );

      res.json({
        success: true,
        data: { fetching: true },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const conversationController = new ConversationController();
