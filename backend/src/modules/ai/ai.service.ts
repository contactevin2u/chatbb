/**
 * AI Service
 *
 * OpenAI integration for auto-reply functionality
 */

import OpenAI from 'openai';
import { prisma } from '../../core/database/prisma';
import { knowledgeService } from '../knowledge/knowledge.service';
import { KnowledgeItem } from '@prisma/client';

export interface AIResponse {
  response: string | null;
  shouldHandoff: boolean;
  sources: string[];
}

export interface AIConfigInput {
  openaiApiKey?: string;
  model?: string;
  isEnabled?: boolean;
  replyToAll?: boolean;
  responseDelayMs?: number;
  businessHoursOnly?: boolean;
  businessStart?: string;
  businessEnd?: string;
  offHoursMessage?: string;
  handoffKeywords?: string[];
  handoffMessage?: string;
  systemPrompt?: string;
  companyName?: string;
}

export class AIService {
  /**
   * Generate AI response for a message
   */
  async generateResponse(
    organizationId: string,
    conversationId: string,
    userMessage: string
  ): Promise<AIResponse> {
    // 1. Get AI config
    const config = await this.getConfig(organizationId);

    if (!config?.isEnabled || !config?.openaiApiKey) {
      return { response: null, shouldHandoff: true, sources: [] };
    }

    // 2. Check handoff keywords
    const messageLower = userMessage.toLowerCase();
    const shouldHandoff = config.handoffKeywords?.some((kw) =>
      messageLower.includes(kw.toLowerCase())
    );

    if (shouldHandoff) {
      return {
        response:
          config.handoffMessage ||
          "I'll connect you with our team. Please wait a moment.",
        shouldHandoff: true,
        sources: [],
      };
    }

    try {
      // 3. Get relevant knowledge using semantic search (falls back to keywords if needed)
      const relevantItems = await knowledgeService.searchSemantic(
        organizationId,
        userMessage,
        10
      );
      const knowledgeContext = this.buildKnowledgeContext(relevantItems);

      // 4. Get conversation history
      const history = await this.getConversationHistory(conversationId, 6);

      // 5. Build system prompt
      const systemPrompt = this.buildSystemPrompt(config, knowledgeContext);

      // 6. Call OpenAI
      const openai = new OpenAI({ apiKey: config.openaiApiKey });

      const completion = await openai.chat.completions.create({
        model: config.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: userMessage },
        ],
        max_tokens: 500,
        temperature: 0.7,
      });

      const response = completion.choices[0]?.message?.content || null;

      // Extract sources from relevant items
      const sources = relevantItems.slice(0, 3).map((item) => item.title);

      return { response, shouldHandoff: false, sources };
    } catch (error: any) {
      console.error('OpenAI API error:', error.message);
      return {
        response: "I'm having trouble processing your request. Let me connect you with our team.",
        shouldHandoff: true,
        sources: [],
      };
    }
  }

  /**
   * Build knowledge context string from items
   */
  private buildKnowledgeContext(items: KnowledgeItem[]): string {
    if (items.length === 0) return '';

    const sections = items.map((item) => {
      if (item.type === 'FAQ') {
        return `Q: ${item.title}\nA: ${item.content}`;
      }
      if (item.type === 'PRODUCT') {
        return `Product: ${item.title}\n${item.content}`;
      }
      return `${item.title}: ${item.content}`;
    });

    return sections.join('\n\n');
  }

  /**
   * Build system prompt with context
   */
  private buildSystemPrompt(config: any, knowledge: string): string {
    const companyName = config.companyName || 'our company';

    const defaultPrompt = `You are a helpful sales assistant for ${companyName}, a medical device equipment supplier in Malaysia.

YOUR ROLE:
- Answer product inquiries professionally
- Provide pricing information (always mention "subject to confirmation")
- Explain product specifications and certifications
- Help with stock availability questions

IMPORTANT RULES:
1. Be professional, helpful, and concise
2. Only answer based on the provided knowledge base
3. If you don't have the information, say "Let me check with our team and get back to you"
4. Keep responses short (2-3 sentences maximum)
5. Use MYR for all pricing
6. Mention relevant certifications when applicable (MDA, ISO 13485, CE)
7. Never make up product information or prices

NEVER:
- Give medical advice
- Promise specific delivery dates without confirmation
- Share competitor information
- Make up specifications or features`;

    const systemPrompt = config.systemPrompt || defaultPrompt;

    if (knowledge) {
      return `${systemPrompt}

--- KNOWLEDGE BASE ---
${knowledge}
--- END KNOWLEDGE BASE ---

Use the knowledge base above to answer questions. If the answer is not in the knowledge base, say you'll check with the team.`;
    }

    return systemPrompt;
  }

  /**
   * Get conversation history for context
   */
  private async getConversationHistory(
    conversationId: string,
    limit: number
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { direction: true, content: true },
    });

    return messages
      .reverse()
      .map((m) => ({
        role: (m.direction === 'INBOUND' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: (m.content as any)?.text || '',
      }))
      .filter((m) => m.content);
  }

  /**
   * Get AI config for organization
   */
  async getConfig(organizationId: string) {
    return prisma.aIConfig.findUnique({
      where: { organizationId },
    });
  }

  /**
   * Update AI config
   */
  async updateConfig(organizationId: string, input: AIConfigInput) {
    // Validate business hours format if provided
    if (input.businessStart && !/^\d{2}:\d{2}$/.test(input.businessStart)) {
      throw new Error('Invalid business start time format. Use HH:MM');
    }
    if (input.businessEnd && !/^\d{2}:\d{2}$/.test(input.businessEnd)) {
      throw new Error('Invalid business end time format. Use HH:MM');
    }

    return prisma.aIConfig.upsert({
      where: { organizationId },
      update: {
        ...input,
        handoffKeywords: input.handoffKeywords || undefined,
      },
      create: {
        organizationId,
        ...input,
        handoffKeywords: input.handoffKeywords || [],
      },
    });
  }

  /**
   * Test AI response without sending to WhatsApp
   */
  async testResponse(
    organizationId: string,
    testMessage: string
  ): Promise<{ response: string | null; sources: string[]; knowledgeFound: number }> {
    const config = await this.getConfig(organizationId);

    if (!config?.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Get relevant knowledge using semantic search
    const relevantItems = await knowledgeService.searchSemantic(
      organizationId,
      testMessage,
      10
    );
    const knowledgeContext = this.buildKnowledgeContext(relevantItems);
    const systemPrompt = this.buildSystemPrompt(config, knowledgeContext);

    // Call OpenAI
    const openai = new OpenAI({ apiKey: config.openaiApiKey });

    const completion = await openai.chat.completions.create({
      model: config.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: testMessage },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const response = completion.choices[0]?.message?.content || null;
    const sources = relevantItems.slice(0, 3).map((item) => item.title);

    return {
      response,
      sources,
      knowledgeFound: relevantItems.length,
    };
  }

  /**
   * Check if within business hours (Malaysia time UTC+8)
   */
  isWithinBusinessHours(config: any): boolean {
    if (!config.businessHoursOnly) return true;

    const now = new Date();
    // Convert to Malaysia time
    const malaysiaTime = new Date(
      now.toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' })
    );
    const hours = malaysiaTime.getHours();
    const minutes = malaysiaTime.getMinutes();
    const currentTime = hours * 60 + minutes;

    const [startH, startM] = (config.businessStart || '09:00').split(':').map(Number);
    const [endH, endM] = (config.businessEnd || '18:00').split(':').map(Number);

    const startTime = startH * 60 + startM;
    const endTime = endH * 60 + endM;

    // Check if weekend
    const day = malaysiaTime.getDay();
    if (day === 0 || day === 6) return false; // Sunday = 0, Saturday = 6

    return currentTime >= startTime && currentTime <= endTime;
  }
}

export const aiService = new AIService();
