/**
 * Gamification Store
 *
 * Manages gamification state: points, celebrations, and streak tracking.
 * Uses Zustand with localStorage persistence.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { RewardResult } from '@/lib/api/gamification';

export type CelebrationType = 'toast' | 'popup';

export interface Celebration {
  type: CelebrationType;
  message: string;
  points: number;
  isLuckyStar: boolean;
}

interface GamificationState {
  // Points (synced from server on load)
  totalPoints: number;
  todayPoints: number;
  currentStreak: number;

  // Local tracking
  rewardStreak: number; // Consecutive rewards (for "on fire" bonus)
  lastRewardTime: number;
  hasSeenWelcomeToday: boolean;
  lastWelcomeDate: string | null;

  // Active celebration
  celebration: Celebration | null;

  // Actions
  handleReward: (result: RewardResult) => void;
  showCelebration: (celebration: Celebration) => void;
  dismissCelebration: () => void;
  syncFromServer: (stats: { totalPoints: number; todayPoints: number; currentStreak: number }) => void;
  checkWelcomeBonus: () => boolean; // Returns true if should show welcome
  markWelcomeSeen: () => void;
  incrementRewardStreak: () => number; // Returns new streak count
  resetRewardStreak: () => void;
}

const THROTTLE_MS = 2000; // Min 2 seconds between reward toasts (more frequent!)

export const useGamificationStore = create<GamificationState>()(
  persist(
    (set, get) => ({
      // Initial state
      totalPoints: 0,
      todayPoints: 0,
      currentStreak: 0,
      rewardStreak: 0,
      lastRewardTime: 0,
      hasSeenWelcomeToday: false,
      lastWelcomeDate: null,
      celebration: null,

      // Handle a reward result from the API
      handleReward: (result: RewardResult) => {
        const now = Date.now();
        const state = get();

        // Throttle toasts
        if (now - state.lastRewardTime < THROTTLE_MS) {
          // Still update points silently
          set({
            totalPoints: result.totalPoints,
            todayPoints: result.todayPoints,
            currentStreak: result.streak,
          });
          return;
        }

        // Determine celebration type
        let celebrationType: CelebrationType = 'toast';
        if (result.isLuckyStar || result.isNewDay) {
          celebrationType = 'popup';
        }

        // Update streak and check for bonus
        const newRewardStreak = state.rewardStreak + 1;

        set({
          totalPoints: result.totalPoints,
          todayPoints: result.todayPoints,
          currentStreak: result.streak,
          rewardStreak: newRewardStreak,
          lastRewardTime: now,
          celebration: {
            type: celebrationType,
            message: result.message,
            points: result.points,
            isLuckyStar: result.isLuckyStar,
          },
        });
      },

      // Show a celebration manually
      showCelebration: (celebration: Celebration) => {
        set({ celebration });
      },

      // Dismiss current celebration
      dismissCelebration: () => {
        set({ celebration: null });
      },

      // Sync points from server
      syncFromServer: (stats) => {
        set({
          totalPoints: stats.totalPoints,
          todayPoints: stats.todayPoints,
          currentStreak: stats.currentStreak,
        });
      },

      // Check if should show welcome bonus (first action of day)
      checkWelcomeBonus: () => {
        const state = get();
        const today = new Date().toDateString();

        if (state.lastWelcomeDate !== today) {
          return true;
        }
        return false;
      },

      // Mark welcome as seen for today
      markWelcomeSeen: () => {
        const today = new Date().toDateString();
        set({
          hasSeenWelcomeToday: true,
          lastWelcomeDate: today,
        });
      },

      // Increment reward streak (for "on fire" tracking)
      incrementRewardStreak: () => {
        const newStreak = get().rewardStreak + 1;
        set({ rewardStreak: newStreak });
        return newStreak;
      },

      // Reset reward streak (after missing a chance)
      resetRewardStreak: () => {
        set({ rewardStreak: 0 });
      },
    }),
    {
      name: 'chatbaby-gamification',
      partialize: (state) => ({
        totalPoints: state.totalPoints,
        todayPoints: state.todayPoints,
        currentStreak: state.currentStreak,
        rewardStreak: state.rewardStreak,
        lastRewardTime: state.lastRewardTime,
        hasSeenWelcomeToday: state.hasSeenWelcomeToday,
        lastWelcomeDate: state.lastWelcomeDate,
      }),
    }
  )
);
