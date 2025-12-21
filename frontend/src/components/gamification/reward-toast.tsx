'use client';

import { toast } from 'sonner';
import { Powerpuff } from './powerpuff';

interface RewardToastProps {
  message: string;
  points: number;
  isLuckyStar?: boolean;
}

/**
 * Show a fun reward toast with Powerpuff Girls!
 */
export function showRewardToast({ message, points, isLuckyStar }: RewardToastProps) {
  toast.custom(
    (t) => (
      <div
        className={`
          relative flex items-center gap-6 px-10 py-8 rounded-3xl min-w-[480px]
          bg-gradient-to-br from-pink-200 via-purple-100 to-indigo-200
          dark:from-pink-900/90 dark:via-purple-900/80 dark:to-indigo-900/90
          border-2 border-pink-400/50 dark:border-pink-500/50
          shadow-[0_20px_60px_-15px_rgba(236,72,153,0.4)]
          dark:shadow-[0_20px_60px_-15px_rgba(236,72,153,0.3)]
          transform transition-all duration-300 overflow-hidden
          ${isLuckyStar ? 'animate-bounce-in scale-105' : 'animate-slide-in'}
        `}
      >
        {/* Shimmer effect overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer pointer-events-none" />

        {/* Sparkle decorations */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
          <span className="absolute top-2 right-8 text-xl animate-sparkle">✨</span>
          <span className="absolute bottom-3 right-20 text-lg animate-sparkle-delay">💖</span>
          <span className="absolute top-4 right-32 text-sm animate-sparkle-delay-2">⭐</span>
        </div>

        {/* Powerpuff mascot - random girl each time! */}
        <div className="flex-shrink-0 relative z-10 drop-shadow-lg">
          <Powerpuff girl="random" mood={isLuckyStar ? 'champion' : 'happy'} size={130} />
        </div>

        {/* Message */}
        <div className="flex-1 min-w-0 relative z-10">
          <p className="font-extrabold text-2xl bg-gradient-to-r from-pink-600 to-purple-600 dark:from-pink-300 dark:to-purple-300 bg-clip-text text-transparent drop-shadow-sm">
            {message}
          </p>
          {isLuckyStar && (
            <p className="text-base text-amber-600 dark:text-amber-300 animate-pulse font-semibold">
              ⭐ Lucky Star Bonus! ⭐
            </p>
          )}
        </div>

        {/* Points badge */}
        <div
          className={`
            relative z-10 flex-shrink-0 px-6 py-3 rounded-full font-black text-2xl
            shadow-lg transform hover:scale-105 transition-transform
            ${isLuckyStar
              ? 'bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 text-amber-900 animate-pulse shadow-amber-400/50'
              : 'bg-gradient-to-r from-pink-400 via-purple-400 to-pink-400 text-white shadow-pink-400/40'
            }
          `}
        >
          +{points}
        </div>

        {/* Confetti particles for lucky star */}
        {isLuckyStar && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
            {[...Array(12)].map((_, i) => (
              <span
                key={i}
                className="absolute text-xl animate-confetti"
                style={{
                  left: `${5 + i * 8}%`,
                  animationDelay: `${i * 0.08}s`,
                }}
              >
                {['🎉', '⭐', '✨', '🌟', '💫', '🎊', '⚡', '🔥', '💎', '🏆', '👑', '🌈'][i]}
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
          relative flex items-center gap-6 px-10 py-8 rounded-3xl min-w-[480px]
          bg-gradient-to-br from-orange-200 via-red-100 to-yellow-200
          dark:from-orange-900/90 dark:via-red-900/80 dark:to-yellow-900/90
          border-2 border-orange-400/50 dark:border-orange-500/50
          shadow-[0_20px_60px_-15px_rgba(249,115,22,0.5)]
          dark:shadow-[0_20px_60px_-15px_rgba(249,115,22,0.3)]
          animate-bounce-in overflow-hidden
        "
      >
        {/* Shimmer effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer pointer-events-none" />

        {/* Fire decorations */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
          <span className="absolute top-1 right-6 text-2xl animate-flicker">🔥</span>
          <span className="absolute bottom-2 right-16 text-xl animate-flicker" style={{ animationDelay: '0.1s' }}>🔥</span>
          <span className="absolute top-3 right-28 text-lg animate-flicker" style={{ animationDelay: '0.2s' }}>⚡</span>
        </div>

        <div className="flex-shrink-0 relative z-10 drop-shadow-lg">
          <Powerpuff girl="buttercup" mood="fire" size={130} />
        </div>
        <div className="flex-1 relative z-10">
          <p className="font-black text-2xl bg-gradient-to-r from-orange-600 to-red-600 dark:from-orange-300 dark:to-red-300 bg-clip-text text-transparent">
            🔥 {streakCount}x STREAK! 🔥
          </p>
          <p className="text-base text-orange-700 dark:text-orange-300 font-semibold">
            You&apos;re on fire! Keep crushing it!
          </p>
        </div>
        <div className="relative z-10 px-6 py-3 rounded-full font-black text-2xl bg-gradient-to-r from-orange-500 via-red-500 to-orange-500 text-white shadow-lg shadow-orange-500/40 animate-pulse">
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
          relative flex items-center gap-6 px-10 py-8 rounded-3xl min-w-[480px]
          bg-gradient-to-br from-cyan-200 via-blue-100 to-purple-200
          dark:from-cyan-900/90 dark:via-blue-900/80 dark:to-purple-900/90
          border-2 border-cyan-400/50 dark:border-cyan-500/50
          shadow-[0_20px_60px_-15px_rgba(34,211,238,0.4)]
          dark:shadow-[0_20px_60px_-15px_rgba(34,211,238,0.3)]
          animate-slide-in overflow-hidden
        "
      >
        {/* Shimmer effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer pointer-events-none" />

        {/* Welcome decorations */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
          <span className="absolute top-2 right-8 text-xl animate-sparkle">🌈</span>
          <span className="absolute bottom-3 right-20 text-lg animate-sparkle-delay">💙</span>
          <span className="absolute top-4 right-32 text-2xl animate-wave">👋</span>
        </div>

        <div className="flex-shrink-0 relative z-10 drop-shadow-lg">
          <Powerpuff girl="bubbles" mood="happy" size={130} />
        </div>
        <div className="flex-1 relative z-10">
          <p className="font-black text-2xl bg-gradient-to-r from-cyan-600 to-purple-600 dark:from-cyan-300 dark:to-purple-300 bg-clip-text text-transparent">
            Welcome back, superstar! 🌟
          </p>
          <p className="text-base text-blue-700 dark:text-blue-300 font-semibold">
            {streak > 1 ? `🔥 ${streak} day streak! You're amazing!` : "✨ Let's make today awesome!"}
          </p>
        </div>
        <div className="relative z-10 px-6 py-3 rounded-full font-black text-2xl bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 text-white shadow-lg shadow-blue-500/40">
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
