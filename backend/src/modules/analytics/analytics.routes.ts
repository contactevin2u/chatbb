/**
 * Analytics Routes
 *
 * API endpoints for dashboard analytics and reporting
 */

import { Router } from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import { requirePermission } from '../auth/guards/rbac.guard';
import { analyticsService } from './analytics.service';

export const analyticsRoutes = Router();

// All routes require authentication
analyticsRoutes.use(authMiddleware);

/**
 * @route   GET /api/v1/analytics/overview
 * @desc    Get dashboard overview stats
 * @access  Private (analytics:read)
 * @query   period - today, yesterday, week, month, quarter (default: week)
 */
analyticsRoutes.get('/overview', requirePermission('analytics:read'), async (req, res, next) => {
  try {
    const organizationId = req.user!.organizationId;
    const period = (req.query.period as string) || 'week';

    const stats = await analyticsService.getOverview(organizationId, period);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/analytics/daily
 * @desc    Get daily stats for charts
 * @access  Private (analytics:read)
 * @query   period - today, yesterday, week, month, quarter (default: week)
 */
analyticsRoutes.get('/daily', requirePermission('analytics:read'), async (req, res, next) => {
  try {
    const organizationId = req.user!.organizationId;
    const period = (req.query.period as string) || 'week';

    const stats = await analyticsService.getDailyStats(organizationId, period);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/analytics/messages
 * @desc    Get message analytics with breakdown
 * @access  Private (analytics:read)
 * @query   period - today, yesterday, week, month, quarter (default: week)
 */
analyticsRoutes.get('/messages', requirePermission('analytics:read'), async (req, res, next) => {
  try {
    const organizationId = req.user!.organizationId;
    const period = (req.query.period as string) || 'week';

    const stats = await analyticsService.getMessageAnalytics(organizationId, period);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/analytics/conversations
 * @desc    Get conversation analytics
 * @access  Private (analytics:read)
 * @query   period - today, yesterday, week, month, quarter (default: week)
 */
analyticsRoutes.get('/conversations', requirePermission('analytics:read'), async (req, res, next) => {
  try {
    const organizationId = req.user!.organizationId;
    const period = (req.query.period as string) || 'week';

    const stats = await analyticsService.getConversationAnalytics(organizationId, period);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/analytics/agents
 * @desc    Get agent performance stats
 * @access  Private (analytics:read:team)
 * @query   period - today, yesterday, week, month, quarter (default: week)
 */
analyticsRoutes.get('/agents', requirePermission('analytics:read'), async (req, res, next) => {
  try {
    const organizationId = req.user!.organizationId;
    const period = (req.query.period as string) || 'week';

    const stats = await analyticsService.getAgentStats(organizationId, period);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/analytics/channels
 * @desc    Get channel performance stats
 * @access  Private (analytics:read)
 * @query   period - today, yesterday, week, month, quarter (default: week)
 */
analyticsRoutes.get('/channels', requirePermission('analytics:read'), async (req, res, next) => {
  try {
    const organizationId = req.user!.organizationId;
    const period = (req.query.period as string) || 'week';

    const stats = await analyticsService.getChannelStats(organizationId, period);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/analytics/engagement
 * @desc    Get agent engagement analytics (reply sessions, continuation rate, follow-ups)
 * @access  Private (analytics:read)
 * @query   period - today, yesterday, week, month, quarter (default: week)
 */
analyticsRoutes.get('/engagement', requirePermission('analytics:read'), async (req, res, next) => {
  try {
    const organizationId = req.user!.organizationId;
    const period = (req.query.period as string) || 'week';

    const stats = await analyticsService.getAgentEngagement(organizationId, period);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});
