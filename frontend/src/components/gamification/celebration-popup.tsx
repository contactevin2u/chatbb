'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Powerpuff } from './powerpuff';
import { useGamificationStore } from '@/stores/gamification-store';

/**
 * Full-screen celebration popup for big wins!
 * Shows for: Lucky Star, milestones, welcome back
 */
export function CelebrationPopup() {
  const { celebration, dismissCelebration } = useGamificationStore();
  const [confettiPieces, setConfettiPieces] = useState<Array<{ id: number; emoji: string; x: number; delay: number }>>([]);

  // Generate confetti on open
  useEffect(() => {
    if (celebration?.type === 'popup') {
      const emojis = ['🎉', '⭐', '✨', '🌟', '💫', '🎊', '🔥', '💥', '🏆', '👑'];
      const pieces = Array.from({ length: 20 }, (_, i) => ({
        id: i,
        emoji: emojis[Math.floor(Math.random() * emojis.length)],
        x: Math.random() * 100,
        delay: Math.random() * 0.5,
      }));
      setConfettiPieces(pieces);
    }
  }, [celebration]);

  if (!celebration || celebration.type !== 'popup') {
    return null;
  }

  return (
    <Dialog open={true} onOpenChange={() => dismissCelebration()}>
      <DialogContent className="sm:max-w-md overflow-hidden">
        {/* Confetti rain */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {confettiPieces.map((piece) => (
            <span
              key={piece.id}
              className="absolute text-2xl animate-confetti-fall"
              style={{
                left: `${piece.x}%`,
                top: '-20px',
                animationDelay: `${piece.delay}s`,
              }}
            >
              {piece.emoji}
            </span>
          ))}
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center py-6">
          {/* Mascot - Blossom for champion moments! */}
          <div className="mb-4 animate-bounce-happy">
            <Powerpuff
              girl="blossom"
              mood={celebration.isLuckyStar ? 'champion' : 'happy'}
              size={120}
            />
          </div>

          {/* Message */}
          <h2 className="text-2xl font-bold text-pink-900 dark:text-pink-100 mb-2">
            {celebration.isLuckyStar ? '🌟 LUCKY STAR! 🌟' : '🎉 Amazing!'}
          </h2>
          <p className="text-lg text-pink-700 dark:text-pink-300 mb-4">
            {celebration.message}
          </p>

          {/* Points earned */}
          <div
            className={`
              inline-flex items-center gap-2 px-6 py-3 rounded-full mb-6
              ${celebration.isLuckyStar
                ? 'bg-gradient-to-r from-amber-400 to-yellow-400 animate-pulse'
                : 'bg-gradient-to-r from-pink-400 to-purple-400'
              }
              text-white font-bold text-xl shadow-lg
            `}
          >
            <span>+{celebration.points}</span>
            <span className="text-sm font-normal">points</span>
          </div>

          {/* Dismiss button */}
          <Button
            onClick={() => dismissCelebration()}
            className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white font-bold px-8 py-2 rounded-full"
          >
            Awesome! 🚀
          </Button>
        </div>

        {/* Glow effect */}
        <div
          className={`
            absolute inset-0 -z-10 opacity-30
            ${celebration.isLuckyStar
              ? 'bg-gradient-radial from-amber-300 to-transparent'
              : 'bg-gradient-radial from-pink-300 to-transparent'
            }
          `}
        />
      </DialogContent>
    </Dialog>
  );
}
