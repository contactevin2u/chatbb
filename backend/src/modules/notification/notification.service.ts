import { prisma } from '../../core/database/prisma.js';
import { whatsappService } from '../whatsapp/whatsapp.service.js';
import { ChannelType } from '@prisma/client';
import { NotFoundException, BadRequestException } from '../../shared/exceptions/base.exception.js';
import { logger } from '../../shared/utils/logger.js';

interface SendNotificationInput {
  channelId: string;
  to: string;
  message?: string;
  media?: {
    type: 'image' | 'video' | 'audio' | 'document';
    url: string;
    filename?: string;
    caption?: string;
  };
}

interface SendNotificationResult {
  success: boolean;
  messageId?: string;
  externalId?: string;
  error?: string;
}

class NotificationService {
  /**
   * Send a notification message via WhatsApp
   * Supports both text and media messages
   */
  async sendNotification(input: SendNotificationInput): Promise<SendNotificationResult> {
    const { channelId, to, message, media } = input;

    // Validate channel exists and is a WhatsApp channel
    const channel = await prisma.channel.findFirst({
      where: {
        id: channelId,
        type: ChannelType.WHATSAPP,
      },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // Format the recipient - allow both phone numbers and JIDs
    const formattedTo = this.formatRecipient(to);

    try {
      // Build sendMessage input
      const sendInput: any = {
        channelId,
        to: formattedTo,
      };

      if (message) {
        sendInput.text = message;
      }

      if (media) {
        sendInput.media = {
          type: media.type,
          url: media.url,
          filename: media.filename,
          caption: media.caption,
        };
      }

      // Use whatsappService.sendMessage() which:
      // - Creates/updates Contact record
      // - Creates/updates Conversation record
      // - Creates Message record with status tracking
      // - Sends via Redis pub/sub to WhatsApp worker
      const result = await whatsappService.sendMessage(sendInput);

      logger.info(
        { channelId, to: formattedTo, messageId: result.messageId },
        '[Notification] Message sent successfully'
      );

      return {
        success: true,
        messageId: result.messageId,
        externalId: result.externalId,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;

      logger.error(
        { error, channelId, to: formattedTo },
        '[Notification] Failed to send message'
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Format recipient to WhatsApp JID format if needed
   * Accepts: phone numbers, group JIDs (@g.us), individual JIDs (@s.whatsapp.net)
   */
  private formatRecipient(to: string): string {
    // Already a JID (group or individual)
    if (to.includes('@')) {
      return to;
    }

    // Phone number: clean and add @s.whatsapp.net
    // whatsappService.sendMessage handles the conversion internally
    // but we keep the raw format for clarity
    const cleaned = to.replace(/[^0-9]/g, '');
    return cleaned;
  }
}

export const notificationService = new NotificationService();
