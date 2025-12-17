/**
 * Auto-Reply Handler
 *
 * Handles automatic AI responses to incoming messages
 */

import { prisma } from '../../core/database/prisma';
import { aiService } from './ai.service';
import { MessageService } from '../message/message.service';

const messageService = new MessageService();

export class AutoReplyHandler {
  /**
   * Handle an incoming message and potentially send AI auto-reply
   */
  async handleIncomingMessage(conversationId: string, message: any): Promise<void> {
    // Only process inbound text messages
    if (message.direction !== 'INBOUND' || message.type !== 'TEXT') {
      return;
    }

    try {
      // Get conversation with channel
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { channel: true },
      });

      if (!conversation) {
        console.log(`[AutoReply] Conversation not found: ${conversationId}`);
        return;
      }

      const organizationId = conversation.channel.organizationId;

      // Get AI config
      const config = await aiService.getConfig(organizationId);

      // Check if AI is enabled
      if (!config?.isEnabled) {
        return;
      }

      // Check API key
      if (!config.openaiApiKey) {
        console.log(`[AutoReply] No API key configured for org: ${organizationId}`);
        return;
      }

      // Check if should reply (all messages or unassigned only)
      if (!config.replyToAll && conversation.assignedUserId) {
        console.log(`[AutoReply] Skipping - agent assigned to conversation`);
        return;
      }

      // Check business hours
      if (!aiService.isWithinBusinessHours(config)) {
        if (config.offHoursMessage) {
          console.log(`[AutoReply] Outside business hours, sending off-hours message`);
          await this.sendMessage(conversationId, config.offHoursMessage, true);
        }
        return;
      }

      // Add human-like delay
      const delay = config.responseDelayMs || 2000;
      await this.sleep(delay);

      // Get message text
      const userText = (message.content as any)?.text || '';
      if (!userText.trim()) {
        return;
      }

      console.log(`[AutoReply] Generating response for: "${userText.substring(0, 50)}..."`);

      // Generate AI response
      const { response, shouldHandoff, sources } = await aiService.generateResponse(
        organizationId,
        conversationId,
        userText
      );

      if (response) {
        console.log(`[AutoReply] Sending response (sources: ${sources.join(', ')})`);
        await this.sendMessage(conversationId, response, true);
      }

      if (shouldHandoff) {
        console.log(`[AutoReply] Triggering handoff to human agent`);
        // Mark conversation as needing human attention
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { status: 'PENDING' },
        });
      }
    } catch (error: any) {
      console.error(`[AutoReply] Error processing message:`, error.message);
      // Don't throw - we don't want to break the message processing pipeline
    }
  }

  /**
   * Send an AI-generated message
   */
  private async sendMessage(
    conversationId: string,
    text: string,
    isAIGenerated: boolean
  ): Promise<void> {
    try {
      await messageService.sendMessage({
        conversationId,
        text,
        isAIGenerated,
      });
    } catch (error: any) {
      console.error(`[AutoReply] Error sending message:`, error.message);
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const autoReplyHandler = new AutoReplyHandler();
