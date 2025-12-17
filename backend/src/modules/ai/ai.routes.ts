/**
 * AI Routes
 *
 * API endpoints for AI configuration and testing
 */

import { Router } from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import { requirePermission } from '../auth/guards/rbac.guard';
import {
  getAIConfig,
  updateAIConfig,
  testAIResponse,
  getAIStatus,
} from './ai.controller';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * @route   GET /api/v1/ai/config
 * @desc    Get AI configuration
 * @access  Private
 */
router.get('/config', getAIConfig);

/**
 * @route   PATCH /api/v1/ai/config
 * @desc    Update AI configuration
 * @access  Private (Admin only)
 * @body    openaiApiKey - OpenAI API key
 * @body    model - Model to use (gpt-4o-mini, gpt-4o, etc.)
 * @body    isEnabled - Enable/disable AI auto-reply
 * @body    replyToAll - Reply to all messages or only unassigned
 * @body    responseDelayMs - Delay before responding (human-like)
 * @body    businessHoursOnly - Only reply during business hours
 * @body    businessStart - Business hours start (HH:MM)
 * @body    businessEnd - Business hours end (HH:MM)
 * @body    offHoursMessage - Message to send outside business hours
 * @body    handoffKeywords - Keywords that trigger human handoff
 * @body    handoffMessage - Message when handing off to human
 * @body    systemPrompt - Custom system prompt
 * @body    companyName - Company name for prompts
 */
router.patch('/config', requirePermission('organization:update'), updateAIConfig);

/**
 * @route   POST /api/v1/ai/test
 * @desc    Test AI response with a sample message
 * @access  Private (Admin only)
 * @body    message - Test message to send to AI
 */
router.post('/test', requirePermission('organization:update'), testAIResponse);

/**
 * @route   GET /api/v1/ai/status
 * @desc    Get current AI status (configured, enabled, business hours)
 * @access  Private
 */
router.get('/status', getAIStatus);

export default router;
