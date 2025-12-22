/**
 * Gamification Routes
 *
 * API endpoints for random rewards, leaderboard, and game stats
 */

import { Router } from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import { gamificationService, RewardActionType, LeaderboardPeriod } from './gamification.service';

export const gamificationRoutes = Router();

// All routes require authentication
gamificationRoutes.use(authMiddleware);

/**
 * @route   POST /api/v1/gamification/reward
 * @desc    Try to get a random reward for an action
 * @access  Private
 * @body    { actionType: 'message' | 'view' | 'close' }
 */
gamificationRoutes.post('/reward', async (req, res, next) => {
  try {
    const userId = req.user!.sub as string;
    const organizationId = req.user!.organizationId as string;
    const { actionType } = req.body as { actionType: RewardActionType };

    if (!['message', 'view', 'close'].includes(actionType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid action type. Must be: message, view, or close',
      });
    }

    const result = await gamificationService.maybeReward(userId, organizationId, actionType);

    res.json({
      success: true,
      data: result, // null if no reward
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/gamification/leaderboard
 * @desc    Get leaderboard for the organization
 * @access  Private
 * @query   period - today, week, month, all (default: today)
 * @query   limit - number of entries (default: 10, max: 50)
 */
gamificationRoutes.get('/leaderboard', async (req, res, next) => {
  try {
    const organizationId = req.user!.organizationId as string;
    const period = (req.query.period as LeaderboardPeriod) || 'today';
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    if (!['today', 'week', 'month', 'all'].includes(period)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid period. Must be: today, week, month, or all',
      });
    }

    const leaderboard = await gamificationService.getLeaderboard(organizationId, period, limit);

    res.json({
      success: true,
      data: leaderboard,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/gamification/stats
 * @desc    Get current user's game stats
 * @access  Private
 */
gamificationRoutes.get('/stats', async (req, res, next) => {
  try {
    const userId = req.user!.sub as string;
    const organizationId = req.user!.organizationId as string;

    const stats = await gamificationService.getUserStats(userId);
    const rank = await gamificationService.getUserRank(userId, organizationId, 'today');

    res.json({
      success: true,
      data: {
        ...stats,
        todayRank: rank,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/gamification/rank
 * @desc    Get current user's rank
 * @access  Private
 * @query   period - today, week, month, all (default: today)
 */
gamificationRoutes.get('/rank', async (req, res, next) => {
  try {
    const userId = req.user!.sub as string;
    const organizationId = req.user!.organizationId as string;
    const period = (req.query.period as LeaderboardPeriod) || 'today';

    const rank = await gamificationService.getUserRank(userId, organizationId, period);

    res.json({
      success: true,
      data: { rank, period },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/gamification/history
 * @desc    Get recent reward events for current user
 * @access  Private
 * @query   limit - number of events (default: 20, max: 100)
 */
gamificationRoutes.get('/history', async (req, res, next) => {
  try {
    const userId = req.user!.sub as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const events = await gamificationService.getRecentRewards(userId, limit);

    res.json({
      success: true,
      data: events,
    });
  } catch (error) {
    next(error);
  }
});
