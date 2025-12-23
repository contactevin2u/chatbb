/**
 * Gamification Service
 *
 * Handles random rewards, leaderboard scoring, and achievement tracking.
 * Lightweight system - uses PostgreSQL functions for atomic point updates.
 */

import { prisma } from '../../core/database/prisma';

// Random reward messages
const REWARD_MESSAGES = [
  'Nice one!',
  "You're crushing it!",
  'Boom!',
  'Sweet!',
  'Ka-ching!',
  'Keep it up!',
  'On fire!',
  'Awesome!',
  'Great job!',
  'Nailed it!',
];

const LUCKY_STAR_MESSAGES = [
  'LUCKY STAR! You hit the jackpot!',
  'WOW! Lucky Star bonus!',
  'Jackpot! Lucky Star activated!',
];

// Reward configuration - MORE FREQUENT & MORE RANDOM!
const REWARD_CONFIG = {
  message: { chance: 0.35, minPoints: 5, maxPoints: 30 },   // 35% chance (was 15%)
  view: { chance: 0.25, minPoints: 3, maxPoints: 20 },      // 25% chance (was 10%)
  close: { chance: 0.50, minPoints: 15, maxPoints: 75 },    // 50% chance (was 30%)
  luckyStar: { chance: 0.05, points: 100 },                 // 5% jackpot (was 2%)
  streakBonus: { points: 50 },
  welcomeBonus: { points: 25 },
};

export type RewardActionType = 'message' | 'view' | 'close';
export type LeaderboardPeriod = 'today' | 'week' | 'month' | 'all';

export interface RewardResult {
  rewarded: boolean;
  points: number;
  message: string;
  isLuckyStar: boolean;
  isStreakBonus: boolean;
  isNewDay: boolean;
  totalPoints: number;
  todayPoints: number;
  streak: number;
}

export interface LeaderboardEntry {
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  points: number;
  messagesSent: number;
  conversationsClosed: number;
  streak: number;
  rank: number;
}

export interface UserGameStats {
  totalPoints: number;
  todayPoints: number;
  weekPoints: number;
  monthPoints: number;
  currentStreak: number;
  longestStreak: number;
  messagesSent: number;
  conversationsClosed: number;
  conversationsViewed: number;
  luckyStarsWon: number;
}

class GamificationService {
  /**
   * Maybe reward a user for an action (random chance)
   * Returns null if no reward was given
   */
  async maybeReward(
    userId: string,
    organizationId: string,
    actionType: RewardActionType
  ): Promise<RewardResult | null> {
    const config = REWARD_CONFIG[actionType];
    const roll = Math.random();

    // Check if user gets rewarded
    if (roll > config.chance) {
      return null;
    }

    // Calculate points
    let points = Math.floor(
      Math.random() * (config.maxPoints - config.minPoints + 1) + config.minPoints
    );

    // Check for lucky star (2% chance on any reward)
    const luckyStarRoll = Math.random();
    const isLuckyStar = luckyStarRoll < REWARD_CONFIG.luckyStar.chance;
    if (isLuckyStar) {
      points = REWARD_CONFIG.luckyStar.points;
    }

    // Get random message
    const message = isLuckyStar
      ? LUCKY_STAR_MESSAGES[Math.floor(Math.random() * LUCKY_STAR_MESSAGES.length)]
      : REWARD_MESSAGES[Math.floor(Math.random() * REWARD_MESSAGES.length)];

    // Add points using PostgreSQL function for atomicity
    const result = await this.addPoints(
      userId,
      organizationId,
      actionType,
      points,
      message,
      isLuckyStar
    );

    // Check for streak bonus (3 rewards in a row - tracked client-side for simplicity)
    const isStreakBonus = false; // Handled client-side

    return {
      rewarded: true,
      points,
      message: `${message} +${points}`,
      isLuckyStar,
      isStreakBonus,
      isNewDay: result.isNewDay,
      totalPoints: result.totalPoints,
      todayPoints: result.todayPoints,
      streak: result.streak,
    };
  }

  /**
   * Add points to user (called by maybeReward or directly for guaranteed rewards)
   */
  async addPoints(
    userId: string,
    organizationId: string,
    actionType: string,
    points: number,
    message?: string,
    isLuckyStar: boolean = false
  ): Promise<{ totalPoints: number; todayPoints: number; streak: number; isNewDay: boolean }> {
    // Use raw SQL to call our PostgreSQL function
    const result = await prisma.$queryRaw<
      Array<{ total_points: number; today_points: number; streak: number; is_new_day: boolean }>
    >`
      SELECT * FROM add_reward_points(
        ${userId}::uuid,
        ${organizationId}::uuid,
        ${actionType},
        ${points}::integer,
        ${message || null},
        ${isLuckyStar}
      )
    `;

    const row = result[0];
    return {
      totalPoints: row?.total_points || 0,
      todayPoints: row?.today_points || 0,
      streak: row?.streak || 0,
      isNewDay: row?.is_new_day || false,
    };
  }

  /**
   * Get leaderboard for an organization
   */
  async getLeaderboard(
    organizationId: string,
    period: LeaderboardPeriod = 'today',
    limit: number = 10
  ): Promise<LeaderboardEntry[]> {
    // Use the appropriate view based on period
    const viewName =
      period === 'today'
        ? 'leaderboard_today'
        : period === 'week'
        ? 'leaderboard_week'
        : period === 'month'
        ? 'leaderboard_month'
        : 'leaderboard_all_time';

    try {
      const results = await prisma.$queryRawUnsafe<LeaderboardEntry[]>(
        `
        SELECT
          user_id as "userId",
          first_name as "firstName",
          last_name as "lastName",
          avatar_url as "avatarUrl",
          points,
          messages_sent as "messagesSent",
          conversations_closed as "conversationsClosed",
          streak,
          rank::integer as rank
        FROM ${viewName}
        WHERE organization_id = $1::uuid
        ORDER BY rank ASC
        LIMIT $2
        `,
        organizationId,
        limit
      );

      return results;
    } catch (error) {
      console.error('Leaderboard query error:', error);
      // Fallback: query directly from agent_game_stats if view doesn't exist
      return this.getLeaderboardFallback(organizationId, period, limit);
    }
  }

  /**
   * Fallback leaderboard query if views don't exist
   */
  private async getLeaderboardFallback(
    organizationId: string,
    period: LeaderboardPeriod,
    limit: number
  ): Promise<LeaderboardEntry[]> {
    const pointsColumn =
      period === 'today'
        ? 'today_points'
        : period === 'week'
        ? 'week_points'
        : period === 'month'
        ? 'month_points'
        : 'total_points';

    const results = await prisma.$queryRawUnsafe<LeaderboardEntry[]>(
      `
      SELECT
        u.id as "userId",
        u.first_name as "firstName",
        u.last_name as "lastName",
        u.avatar_url as "avatarUrl",
        COALESCE(ags.${pointsColumn}, 0) as points,
        COALESCE(ags.messages_sent, 0) as "messagesSent",
        COALESCE(ags.conversations_closed, 0) as "conversationsClosed",
        COALESCE(ags.current_streak, 0) as streak,
        ROW_NUMBER() OVER (ORDER BY COALESCE(ags.${pointsColumn}, 0) DESC)::integer as rank
      FROM users u
      LEFT JOIN agent_game_stats ags ON ags.user_id = u.id
      WHERE u.organization_id = $1::uuid
        AND u.status = 'ACTIVE'
        AND u.role IN ('AGENT', 'SUPERVISOR', 'ADMIN', 'OWNER')
      ORDER BY points DESC
      LIMIT $2
      `,
      organizationId,
      limit
    );

    return results;
  }

  /**
   * Get user's game stats
   */
  async getUserStats(userId: string): Promise<UserGameStats | null> {
    const stats = await prisma.agentGameStats.findUnique({
      where: { userId },
    });

    if (!stats) {
      return null;
    }

    return {
      totalPoints: stats.totalPoints,
      todayPoints: stats.todayPoints,
      weekPoints: stats.weekPoints,
      monthPoints: stats.monthPoints,
      currentStreak: stats.currentStreak,
      longestStreak: stats.longestStreak,
      messagesSent: stats.messagesSent,
      conversationsClosed: stats.conversationsClosed,
      conversationsViewed: stats.conversationsViewed,
      luckyStarsWon: stats.luckyStarsWon,
    };
  }

  /**
   * Get user's recent reward events
   */
  async getRecentRewards(userId: string, limit: number = 20) {
    const events = await prisma.rewardEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        actionType: true,
        points: true,
        message: true,
        isLuckyStar: true,
        isStreakBonus: true,
        createdAt: true,
      },
    });

    return events;
  }

  /**
   * Get user's rank in leaderboard
   */
  async getUserRank(
    userId: string,
    organizationId: string,
    period: LeaderboardPeriod = 'today'
  ): Promise<number | null> {
    const viewName =
      period === 'today'
        ? 'leaderboard_today'
        : period === 'week'
        ? 'leaderboard_week'
        : period === 'month'
        ? 'leaderboard_month'
        : 'leaderboard_all_time';

    try {
      const result = await prisma.$queryRawUnsafe<Array<{ rank: number }>>(
        `
        SELECT rank::integer as rank
        FROM ${viewName}
        WHERE organization_id = $1::uuid AND user_id = $2::uuid
        `,
        organizationId,
        userId
      );

      return result[0]?.rank || null;
    } catch (error) {
      console.error('getUserRank error:', error);
      // Fallback query
      return this.getUserRankFallback(userId, organizationId, period);
    }
  }

  /**
   * Fallback for getUserRank if views don't exist
   */
  private async getUserRankFallback(
    userId: string,
    organizationId: string,
    period: LeaderboardPeriod
  ): Promise<number | null> {
    const pointsColumn =
      period === 'today'
        ? 'today_points'
        : period === 'week'
        ? 'week_points'
        : period === 'month'
        ? 'month_points'
        : 'total_points';

    const result = await prisma.$queryRawUnsafe<Array<{ rank: number }>>(
      `
      SELECT rank::integer FROM (
        SELECT
          u.id,
          ROW_NUMBER() OVER (ORDER BY COALESCE(ags.${pointsColumn}, 0) DESC) as rank
        FROM users u
        LEFT JOIN agent_game_stats ags ON ags.user_id = u.id
        WHERE u.organization_id = $1::uuid
          AND u.status = 'ACTIVE'
          AND u.role IN ('AGENT', 'SUPERVISOR', 'ADMIN', 'OWNER')
      ) ranked
      WHERE id = $2::uuid
      `,
      organizationId,
      userId
    );

    return result[0]?.rank || null;
  }

  /**
   * Give welcome bonus for first action of day
   */
  async giveWelcomeBonus(userId: string, organizationId: string): Promise<RewardResult> {
    const points = REWARD_CONFIG.welcomeBonus.points;
    const message = 'Welcome back champ!';

    const result = await this.addPoints(userId, organizationId, 'welcome', points, message);

    return {
      rewarded: true,
      points,
      message: `${message} +${points}`,
      isLuckyStar: false,
      isStreakBonus: false,
      isNewDay: true,
      totalPoints: result.totalPoints,
      todayPoints: result.todayPoints,
      streak: result.streak,
    };
  }

  /**
   * Give streak bonus for consecutive rewards
   */
  async giveStreakBonus(userId: string, organizationId: string, streakCount: number): Promise<RewardResult> {
    const points = REWARD_CONFIG.streakBonus.points;
    const message = `🔥 ${streakCount} in a row! On Fire!`;

    const result = await this.addPoints(userId, organizationId, 'streak_bonus', points, message, false);

    return {
      rewarded: true,
      points,
      message: `${message} +${points}`,
      isLuckyStar: false,
      isStreakBonus: true,
      isNewDay: false,
      totalPoints: result.totalPoints,
      todayPoints: result.todayPoints,
      streak: result.streak,
    };
  }
}

export const gamificationService = new GamificationService();
