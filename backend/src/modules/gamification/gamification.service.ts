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

// Reward configuration
const REWARD_CONFIG = {
  message: { chance: 0.15, minPoints: 5, maxPoints: 25 },
  view: { chance: 0.10, minPoints: 3, maxPoints: 15 },
  close: { chance: 0.30, minPoints: 10, maxPoints: 50 },
  luckyStar: { chance: 0.02, points: 100 },
  streakBonus: { points: 50 },
  welcomeBonus: { points: 20 },
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
        ${points},
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
        : 'leaderboard_all_time';

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
        : 'leaderboard_all_time';

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
}

export const gamificationService = new GamificationService();
