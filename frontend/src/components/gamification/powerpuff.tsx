'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils/cn';

// Import mascot images
import Blossom from './mascot/Blossom_flying_(Powerpuff_Girls_2016_reboot).svg.png';
import Bubbles from './mascot/Bubbles_flying_(Powerpuff_Girls_2016_reboot).svg.png';
import Buttercup from './mascot/Buttercup_flying_(Powerpuff_Girls_2016_reboot).svg.png';

export type PowerpuffGirl = 'blossom' | 'bubbles' | 'buttercup' | 'random';
export type PowerpuffMood = 'idle' | 'happy' | 'fire' | 'champion';

const GIRLS = {
  blossom: { src: Blossom, name: 'Blossom', color: 'pink' },
  bubbles: { src: Bubbles, name: 'Bubbles', color: 'blue' },
  buttercup: { src: Buttercup, name: 'Buttercup', color: 'green' },
};

interface PowerpuffProps {
  girl?: PowerpuffGirl;
  mood?: PowerpuffMood;
  size?: number;
  className?: string;
}

/**
 * Powerpuff Girls Mascot
 * Randomly picks Blossom, Bubbles, or Buttercup!
 */
export function Powerpuff({ girl = 'random', mood = 'idle', size = 64, className }: PowerpuffProps) {
  // Pick a random girl if not specified
  const selectedGirl = useMemo(() => {
    if (girl === 'random') {
      const girls: Array<'blossom' | 'bubbles' | 'buttercup'> = ['blossom', 'bubbles', 'buttercup'];
      return girls[Math.floor(Math.random() * girls.length)];
    }
    return girl;
  }, [girl]);

  const girlData = GIRLS[selectedGirl];

  return (
    <div
      className={cn(
        'relative inline-flex items-center justify-center',
        mood === 'idle' && 'animate-float',
        mood === 'happy' && 'animate-bounce-happy',
        mood === 'fire' && 'animate-wiggle',
        mood === 'champion' && 'animate-pulse-glow',
        className
      )}
      style={{ width: size, height: size }}
    >
      {/* Glow effect for special moods */}
      {(mood === 'fire' || mood === 'champion') && (
        <div
          className={cn(
            'absolute inset-0 rounded-full blur-xl opacity-50',
            mood === 'fire' && 'bg-gradient-to-r from-orange-400 to-red-500',
            mood === 'champion' && 'bg-gradient-to-r from-amber-300 to-yellow-400'
          )}
        />
      )}

      {/* Crown for champion */}
      {mood === 'champion' && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20 text-2xl animate-bounce">
          👑
        </div>
      )}

      {/* The mascot image */}
      <Image
        src={girlData.src}
        alt={girlData.name}
        width={size}
        height={size}
        className={cn(
          'relative z-10 object-contain drop-shadow-lg',
          mood === 'happy' && 'drop-shadow-[0_0_10px_rgba(255,182,193,0.8)]',
          mood === 'fire' && 'drop-shadow-[0_0_15px_rgba(255,100,0,0.8)]',
          mood === 'champion' && 'drop-shadow-[0_0_20px_rgba(255,215,0,0.9)]'
        )}
      />

      {/* Sparkles for happy mood */}
      {mood === 'happy' && (
        <>
          <span className="absolute -top-1 -right-1 text-lg animate-ping z-20">✨</span>
          <span className="absolute -top-2 left-0 text-sm animate-pulse delay-100 z-20">⭐</span>
          <span className="absolute bottom-0 -right-2 text-sm animate-pulse delay-200 z-20">💖</span>
        </>
      )}

      {/* Fire effects */}
      {mood === 'fire' && (
        <>
          <span className="absolute -bottom-1 left-1/4 text-lg animate-flicker z-20">🔥</span>
          <span className="absolute -bottom-1 right-1/4 text-lg animate-flicker delay-100 z-20">🔥</span>
        </>
      )}
    </div>
  );
}

/**
 * Get a random Powerpuff Girl name
 */
export function getRandomPowerpuff(): 'blossom' | 'bubbles' | 'buttercup' {
  const girls: Array<'blossom' | 'bubbles' | 'buttercup'> = ['blossom', 'bubbles', 'buttercup'];
  return girls[Math.floor(Math.random() * girls.length)];
}
