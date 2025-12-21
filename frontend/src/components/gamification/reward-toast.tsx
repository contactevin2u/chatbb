'use client';

import { toast } from 'sonner';
import { Chirpy } from './chirpy';

interface RewardToastProps {
  message: string;
  points: number;
  isLuckyStar?: boolean;
}

/**
 * Show a fun reward toast with Chirpy
 */
export function showRewardToast({ message, points, isLuckyStar }: RewardToastProps) {
  toast.custom(
    (t) => (
      <div
        className={`
          flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg
          bg-gradient-to-r from-amber-100 to-yellow-100
          dark:from-amber-900/80 dark:to-yellow-900/80
          border-2 border-amber-300 dark:border-amber-600
          transform transition-all duration-300
          ${isLuckyStar ? 'animate-bounce-in scale-110' : 'animate-slide-in'}
        `}
      >
        {/* Chirpy mascot */}
        <div className="flex-shrink-0">
          <Chirpy mood={isLuckyStar ? 'champion' : 'happy'} size={40} />
        </div>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-amber-900 dark:text-amber-100 truncate">
            {message}
          </p>
          {isLuckyStar && (
            <p className="text-xs text-amber-700 dark:text-amber-300 animate-pulse">
              Lucky Star Bonus!
            </p>
          )}
        </div>

        {/* Points badge */}
        <div
          className={`
            flex-shrink-0 px-3 py-1 rounded-full font-bold text-sm
            ${isLuckyStar
              ? 'bg-gradient-to-r from-amber-400 to-yellow-400 text-amber-900 animate-pulse'
              : 'bg-amber-400/80 text-amber-900'
            }
          `}
        >
          +{points}
        </div>

        {/* Confetti particles */}
        {isLuckyStar && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
            {[...Array(8)].map((_, i) => (
              <span
                key={i}
                className="absolute text-lg animate-confetti"
                style={{
                  left: `${10 + i * 12}%`,
                  animationDelay: `${i * 0.1}s`,
                }}
              >
                {['🎉', '⭐', '✨', '🌟', '💫', '🎊', '⚡', '🔥'][i]}
              </span>
            ))}
          </div>
        )}
      </div>
    ),
    {
      duration: isLuckyStar ? 5000 : 3000,
      position: 'top-center',
    }
  );
}

/**
 * Show a streak bonus toast
 */
export function showStreakToast(streakCount: number, bonusPoints: number) {
  toast.custom(
    () => (
      <div
        className="
          flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg
          bg-gradient-to-r from-orange-100 to-red-100
          dark:from-orange-900/80 dark:to-red-900/80
          border-2 border-orange-400 dark:border-orange-600
          animate-bounce-in
        "
      >
        <Chirpy mood="fire" size={44} />
        <div className="flex-1">
          <p className="font-bold text-orange-900 dark:text-orange-100">
            🔥 {streakCount}x STREAK!
          </p>
          <p className="text-xs text-orange-700 dark:text-orange-300">
            You&apos;re on fire! Keep going!
          </p>
        </div>
        <div className="px-3 py-1 rounded-full font-bold text-sm bg-gradient-to-r from-orange-400 to-red-400 text-white">
          +{bonusPoints}
        </div>
      </div>
    ),
    {
      duration: 4000,
      position: 'top-center',
    }
  );
}

/**
 * Show welcome back toast
 */
export function showWelcomeToast(streak: number) {
  toast.custom(
    () => (
      <div
        className="
          flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg
          bg-gradient-to-r from-pink-100 to-purple-100
          dark:from-pink-900/80 dark:to-purple-900/80
          border-2 border-pink-300 dark:border-pink-600
          animate-slide-in
        "
      >
        <Chirpy mood="happy" size={44} />
        <div className="flex-1">
          <p className="font-bold text-pink-900 dark:text-pink-100">
            Welcome back, champ! 👋
          </p>
          <p className="text-xs text-pink-700 dark:text-pink-300">
            {streak > 1 ? `${streak} day streak! Keep it up!` : "Let's crush it today!"}
          </p>
        </div>
        <div className="px-3 py-1 rounded-full font-bold text-sm bg-gradient-to-r from-pink-400 to-purple-400 text-white">
          +20
        </div>
      </div>
    ),
    {
      duration: 4000,
      position: 'top-center',
    }
  );
}
