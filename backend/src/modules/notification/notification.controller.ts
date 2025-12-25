import { Request, Response, NextFunction } from 'express';
import { notificationService } from './notification.service.js';
import { logger } from '../../shared/utils/logger.js';

class NotificationController {
  /**
   * Send a notification message
   * POST /api/v1/notifications/send
   */
  async send(req: Request, res: Response, next: NextFunction) {
    try {
      const { channel_id, to, message, media } = req.body;

      logger.info(
        { channelId: channel_id, to, hasMedia: !!media },
        '[Notification] Processing send request'
      );

      const result = await notificationService.sendNotification({
        channelId: channel_id,
        to,
        message,
        media,
      });

      if (result.success) {
        res.json({
          success: true,
          message_id: result.messageId,
          external_id: result.externalId,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      logger.error({ error, body: req.body }, '[Notification] Send failed');
      next(error);
    }
  }
}

export const notificationController = new NotificationController();
