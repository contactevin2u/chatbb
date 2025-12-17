/**
 * WhatsApp Controller
 *
 * HTTP request handlers for WhatsApp operations
 */

import { Request, Response, NextFunction } from 'express';
import { whatsappService } from './whatsapp.service';

export class WhatsAppController {
  /**
   * List all WhatsApp channels
   * GET /api/v1/channels/whatsapp
   */
  async listChannels(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const channels = await whatsappService.listChannels(organizationId);

      res.json({
        success: true,
        data: channels,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create a new WhatsApp channel
   * POST /api/v1/channels/whatsapp
   */
  async createChannel(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { name } = req.body;

      const channel = await whatsappService.createChannel({
        organizationId,
        name,
      });

      res.status(201).json({
        success: true,
        data: channel,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get channel status
   * GET /api/v1/channels/whatsapp/:channelId
   */
  async getChannelStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { channelId } = req.params;

      const status = await whatsappService.getChannelStatus(channelId, organizationId);

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Connect a WhatsApp channel (start QR flow)
   * POST /api/v1/channels/whatsapp/:channelId/connect
   */
  async connectChannel(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { channelId } = req.params;

      const result = await whatsappService.connectChannel(channelId, organizationId);

      res.json({
        success: true,
        data: result,
        message: 'Connection initiated. Watch for QR code via WebSocket.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Request pairing code instead of QR
   * POST /api/v1/channels/whatsapp/:channelId/pairing-code
   */
  async requestPairingCode(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { channelId } = req.params;
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({
          success: false,
          error: 'Phone number is required',
        });
      }

      const result = await whatsappService.requestPairingCode(channelId, organizationId, phoneNumber);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Disconnect a WhatsApp channel
   * POST /api/v1/channels/whatsapp/:channelId/disconnect
   */
  async disconnectChannel(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { channelId } = req.params;

      const result = await whatsappService.disconnectChannel(channelId, organizationId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reconnect a WhatsApp channel using saved credentials
   * POST /api/v1/channels/whatsapp/:channelId/reconnect
   */
  async reconnectChannel(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { channelId } = req.params;

      const result = await whatsappService.reconnectChannel(channelId, organizationId);

      res.json({
        success: true,
        data: result,
        message: result.hasAuthState
          ? 'Reconnection initiated using saved credentials.'
          : 'No saved session found. Please scan QR code.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Send a message
   * POST /api/v1/channels/whatsapp/:channelId/messages
   */
  async sendMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { channelId } = req.params;
      const { to, text, media, quotedMessageId } = req.body;

      if (!to) {
        return res.status(400).json({
          success: false,
          error: 'Recipient (to) is required',
        });
      }

      if (!text && !media) {
        return res.status(400).json({
          success: false,
          error: 'Either text or media is required',
        });
      }

      const result = await whatsappService.sendMessage({
        channelId,
        to,
        text,
        media,
        quotedMessageId,
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
   * Clear session/auth state for a WhatsApp channel
   * DELETE /api/v1/channels/whatsapp/:channelId/session
   * Use when session is corrupted (PreKey errors, decryption failures)
   */
  async clearSession(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { channelId } = req.params;

      const result = await whatsappService.clearSession(channelId, organizationId);

      res.json({
        success: true,
        data: result,
        message: 'Session cleared. Please scan QR code to reconnect.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a WhatsApp channel
   * DELETE /api/v1/channels/whatsapp/:channelId
   */
  async deleteChannel(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { channelId } = req.params;

      // First disconnect if connected
      try {
        await whatsappService.disconnectChannel(channelId, organizationId);
      } catch {
        // Ignore disconnect errors
      }

      // Clear session/auth state first (avoid foreign key issues)
      try {
        await whatsappService.clearSession(channelId, organizationId);
      } catch {
        // Ignore if no session exists
      }

      // Delete from database
      const { prisma } = await import('../../core/database/prisma.js');
      await prisma.channel.delete({
        where: {
          id: channelId,
          organizationId,
          type: 'WHATSAPP',
        },
      });

      res.json({
        success: true,
        message: 'Channel deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get incognito mode status for a channel
   * GET /api/v1/channels/whatsapp/:channelId/incognito
   */
  async getIncognitoStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { channelId } = req.params;

      const status = await whatsappService.getIncognitoStatus(channelId, organizationId);

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Toggle incognito mode for a channel
   * POST /api/v1/channels/whatsapp/:channelId/incognito
   * Body: { enabled: boolean }
   */
  async setIncognitoMode(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { channelId } = req.params;
      const { enabled } = req.body;

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'enabled must be a boolean',
        });
      }

      await whatsappService.setIncognitoMode(channelId, organizationId, enabled);

      res.json({
        success: true,
        data: { enabled },
        message: enabled
          ? 'Incognito mode enabled - You appear offline, no typing indicators or read receipts'
          : 'Incognito mode disabled - Normal presence restored',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const whatsappController = new WhatsAppController();
