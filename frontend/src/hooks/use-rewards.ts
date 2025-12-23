/**
 * useRewards Hook
 *
 * Hook for triggering random rewards on user actions.
 * Handles API calls, store updates, and toast notifications.
 */

import { useCallback, useRef } from 'react';
import { gamificationApi, RewardActionType } from '@/lib/api/gamification';
import { useGamificationStore } from '@/stores/gamification-store';
import { showRewardToast, showStreakToast, showWelcomeToast } from '@/components/gamification/reward-toast';

const STREAK_BONUS_THRESHOLD = 3; // 3 rewards in a row = streak bonus

export function useRewards() {
  const {
    handleReward,
    checkWelcomeBonus,
    markWelcomeSeen,
    rewardStreak,
    syncFromServer,
  } = useGamificationStore();

  // Track if we've checked welcome today
  const welcomeCheckedRef = useRef(false);

  /**
   * Try to get a random reward for an action
   * Call this after successful message send, conversation view, or close
   */
  const maybeReward = useCallback(async (actionType: RewardActionType) => {
    try {
      // Check for welcome bonus (first action of day)
      if (!welcomeCheckedRef.current && checkWelcomeBonus()) {
        welcomeCheckedRef.current = true;
        markWelcomeSeen();
        // Claim welcome bonus from backend
        try {
          const welcomeResult = await gamificationApi.claimWelcomeBonus();
          if (welcomeResult) {
            handleReward(welcomeResult);
            showWelcomeToast(welcomeResult.streak);
          }
        } catch (err) {
          console.warn('Welcome bonus claim failed:', err);
        }
      }

      // Try to get a random reward
      const result = await gamificationApi.tryReward(actionType);

      if (result) {
        // We got a reward!
        handleReward(result);

        // Show toast (popup is handled by CelebrationPopup component watching store)
        if (result.isLuckyStar) {
          // Lucky star shows as popup via store
        } else {
          showRewardToast({
            message: result.message,
            points: result.points,
            isLuckyStar: result.isLuckyStar,
          });
        }

        // Check for streak bonus (3 rewards in a row)
        const newStreak = rewardStreak + 1;
        if (newStreak >= STREAK_BONUS_THRESHOLD && newStreak % STREAK_BONUS_THRESHOLD === 0) {
          // Claim streak bonus from backend
          try {
            const streakResult = await gamificationApi.claimStreakBonus(newStreak);
            if (streakResult) {
              handleReward(streakResult);
              showStreakToast(newStreak, streakResult.points);
            }
          } catch (err) {
            console.warn('Streak bonus claim failed:', err);
          }
        }

        return result;
      }

      return null;
    } catch (error) {
      // Silently fail - gamification shouldn't break main functionality
      console.warn('Reward check failed:', error);
      return null;
    }
  }, [handleReward, checkWelcomeBonus, markWelcomeSeen, rewardStreak]);

  /**
   * Sync stats from server (call on app load)
   */
  const syncStats = useCallback(async () => {
    try {
      const stats = await gamificationApi.getGameStats();
      syncFromServer({
        totalPoints: stats.totalPoints,
        todayPoints: stats.todayPoints,
        currentStreak: stats.currentStreak,
      });
    } catch (error) {
      console.warn('Failed to sync game stats:', error);
    }
  }, [syncFromServer]);

  return {
    maybeReward,
    syncStats,
  };
}
