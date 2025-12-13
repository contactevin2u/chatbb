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
   * Send a message
   * POST /api/v1/channels/whatsapp/:channelId/messages
   */
  async sendMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { channelId } = req.params;
      const { to, text, media } = req.body;

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
}

export const whatsappController = new WhatsAppController();
