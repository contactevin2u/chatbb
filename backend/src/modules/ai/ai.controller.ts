/**
 * AI Controller
 *
 * HTTP request handlers for AI configuration and testing
 */

import { Request, Response } from 'express';
import { aiService } from './ai.service';

/**
 * Get AI configuration
 * GET /api/v1/ai/config
 */
export async function getAIConfig(req: Request, res: Response) {
  try {
    const organizationId = req.user!.organizationId;

    const config = await aiService.getConfig(organizationId);

    // Don't expose full API key
    const safeConfig = config
      ? {
          ...config,
          openaiApiKey: config.openaiApiKey
            ? `sk-...${config.openaiApiKey.slice(-4)}`
            : null,
        }
      : null;

    res.json({
      success: true,
      data: safeConfig,
    });
  } catch (error: any) {
    console.error('Error getting AI config:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get AI configuration',
    });
  }
}

/**
 * Update AI configuration
 * PATCH /api/v1/ai/config
 */
export async function updateAIConfig(req: Request, res: Response) {
  try {
    const organizationId = req.user!.organizationId;
    const {
      openaiApiKey,
      model,
      isEnabled,
      replyToAll,
      responseDelayMs,
      businessHoursOnly,
      businessStart,
      businessEnd,
      offHoursMessage,
      handoffKeywords,
      handoffMessage,
      systemPrompt,
      companyName,
    } = req.body;

    // Validate API key format if provided
    if (openaiApiKey && !openaiApiKey.startsWith('sk-')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid OpenAI API key format',
      });
    }

    // Validate model if provided
    const validModels = ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'];
    if (model && !validModels.includes(model)) {
      return res.status(400).json({
        success: false,
        error: `Invalid model. Must be one of: ${validModels.join(', ')}`,
      });
    }

    // Validate response delay
    if (responseDelayMs !== undefined && (responseDelayMs < 0 || responseDelayMs > 10000)) {
      return res.status(400).json({
        success: false,
        error: 'Response delay must be between 0 and 10000 milliseconds',
      });
    }

    const config = await aiService.updateConfig(organizationId, {
      openaiApiKey,
      model,
      isEnabled,
      replyToAll,
      responseDelayMs,
      businessHoursOnly,
      businessStart,
      businessEnd,
      offHoursMessage,
      handoffKeywords,
      handoffMessage,
      systemPrompt,
      companyName,
    });

    // Don't expose full API key in response
    const safeConfig = {
      ...config,
      openaiApiKey: config.openaiApiKey
        ? `sk-...${config.openaiApiKey.slice(-4)}`
        : null,
    };

    res.json({
      success: true,
      data: safeConfig,
    });
  } catch (error: any) {
    console.error('Error updating AI config:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update AI configuration',
    });
  }
}

/**
 * Test AI response
 * POST /api/v1/ai/test
 */
export async function testAIResponse(req: Request, res: Response) {
  try {
    const organizationId = req.user!.organizationId;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required',
      });
    }

    const result = await aiService.testResponse(organizationId, message);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Error testing AI:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to test AI response',
    });
  }
}

/**
 * Check if AI is within business hours
 * GET /api/v1/ai/status
 */
export async function getAIStatus(req: Request, res: Response) {
  try {
    const organizationId = req.user!.organizationId;

    const config = await aiService.getConfig(organizationId);

    if (!config) {
      return res.json({
        success: true,
        data: {
          configured: false,
          enabled: false,
          withinBusinessHours: false,
        },
      });
    }

    const withinBusinessHours = aiService.isWithinBusinessHours(config);

    res.json({
      success: true,
      data: {
        configured: !!config.openaiApiKey,
        enabled: config.isEnabled,
        withinBusinessHours,
        model: config.model,
        replyToAll: config.replyToAll,
      },
    });
  } catch (error: any) {
    console.error('Error getting AI status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get AI status',
    });
  }
}
