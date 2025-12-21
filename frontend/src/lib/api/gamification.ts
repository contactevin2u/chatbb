/**
 * Gamification API Client
 *
 * API calls for random rewards, leaderboard, and game stats
 */

import { apiClient } from './client';

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
  todayRank: number | null;
}

export interface RewardEvent {
  id: string;
  actionType: string;
  points: number;
  message: string | null;
  isLuckyStar: boolean;
  isStreakBonus: boolean;
  createdAt: string;
}

/**
 * Try to get a random reward for an action
 * Returns null in data if no reward was given
 */
export async function tryReward(actionType: RewardActionType): Promise<RewardResult | null> {
  const response = await apiClient.post<{ success: boolean; data: RewardResult | null }>(
    '/gamification/reward',
    { actionType }
  );
  return response.data.data;
}

/**
 * Get leaderboard for the organization
 */
export async function getLeaderboard(
  period: LeaderboardPeriod = 'today',
  limit: number = 10
): Promise<LeaderboardEntry[]> {
  const response = await apiClient.get<{ success: boolean; data: LeaderboardEntry[] }>(
    `/gamification/leaderboard?period=${period}&limit=${limit}`
  );
  return response.data.data;
}

/**
 * Get current user's game stats
 */
export async function getGameStats(): Promise<UserGameStats> {
  const response = await apiClient.get<{ success: boolean; data: UserGameStats }>(
    '/gamification/stats'
  );
  return response.data.data;
}

/**
 * Get current user's rank
 */
export async function getUserRank(
  period: LeaderboardPeriod = 'today'
): Promise<{ rank: number | null; period: LeaderboardPeriod }> {
  const response = await apiClient.get<{
    success: boolean;
    data: { rank: number | null; period: LeaderboardPeriod };
  }>(`/gamification/rank?period=${period}`);
  return response.data.data;
}

/**
 * Get recent reward events for current user
 */
export async function getRewardHistory(limit: number = 20): Promise<RewardEvent[]> {
  const response = await apiClient.get<{ success: boolean; data: RewardEvent[] }>(
    `/gamification/history?limit=${limit}`
  );
  return response.data.data;
}

export const gamificationApi = {
  tryReward,
  getLeaderboard,
  getGameStats,
  getUserRank,
  getRewardHistory,
};
