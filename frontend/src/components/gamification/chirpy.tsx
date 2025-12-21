'use client';

import { cn } from '@/lib/utils/cn';

export type ChirpyMood = 'idle' | 'happy' | 'fire' | 'champion';

interface ChirpyProps {
  mood?: ChirpyMood;
  size?: number;
  className?: string;
}

/**
 * Chirpy - The ChatBaby mascot
 * A cute baby chick that celebrates with you!
 */
export function Chirpy({ mood = 'idle', size = 48, className }: ChirpyProps) {
  return (
    <div
      className={cn(
        'relative inline-flex items-center justify-center',
        mood === 'idle' && 'animate-bounce-subtle',
        mood === 'happy' && 'animate-bounce-happy',
        mood === 'fire' && 'animate-wiggle',
        mood === 'champion' && 'animate-pulse-glow',
        className
      )}
      style={{ width: size, height: size }}
    >
      {/* Fire effect behind chirpy */}
      {mood === 'fire' && (
        <div className="absolute inset-0 -z-10">
          <svg viewBox="0 0 48 48" className="w-full h-full animate-flicker">
            <defs>
              <linearGradient id="fire-gradient" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#f97316" />
                <stop offset="50%" stopColor="#eab308" />
                <stop offset="100%" stopColor="#fef08a" />
              </linearGradient>
            </defs>
            <path
              d="M24 4c-4 8-12 12-12 20 0 8 6 14 12 14s12-6 12-14c0-8-8-12-12-20z"
              fill="url(#fire-gradient)"
              opacity="0.8"
            />
          </svg>
        </div>
      )}

      {/* Crown for champion */}
      {mood === 'champion' && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
          <svg width="20" height="14" viewBox="0 0 20 14" fill="none">
            <path
              d="M1 12L3 4L6 8L10 1L14 8L17 4L19 12H1Z"
              fill="#fbbf24"
              stroke="#f59e0b"
              strokeWidth="1"
            />
            <circle cx="3" cy="3" r="1.5" fill="#fbbf24" />
            <circle cx="10" cy="1" r="1.5" fill="#fbbf24" />
            <circle cx="17" cy="3" r="1.5" fill="#fbbf24" />
          </svg>
        </div>
      )}

      {/* Main Chirpy SVG */}
      <svg
        viewBox="0 0 48 48"
        fill="none"
        className="w-full h-full"
        style={{ filter: mood === 'champion' ? 'drop-shadow(0 0 8px #fbbf24)' : undefined }}
      >
        {/* Body */}
        <ellipse cx="24" cy="28" rx="14" ry="12" fill="#fcd34d" />
        <ellipse cx="24" cy="28" rx="14" ry="12" fill="url(#body-gradient)" />

        {/* Belly */}
        <ellipse cx="24" cy="31" rx="9" ry="7" fill="#fef3c7" />

        {/* Head */}
        <circle cx="24" cy="16" r="11" fill="#fcd34d" />
        <circle cx="24" cy="16" r="11" fill="url(#head-gradient)" />

        {/* Cheeks (blush) */}
        <ellipse cx="17" cy="18" rx="2.5" ry="1.5" fill="#fca5a5" opacity="0.6" />
        <ellipse cx="31" cy="18" rx="2.5" ry="1.5" fill="#fca5a5" opacity="0.6" />

        {/* Eyes */}
        {mood === 'fire' ? (
          // Sunglasses for fire mode
          <>
            <rect x="15" y="12" width="8" height="5" rx="1" fill="#1f2937" />
            <rect x="25" y="12" width="8" height="5" rx="1" fill="#1f2937" />
            <path d="M23 14.5h2" stroke="#1f2937" strokeWidth="1" />
            <path d="M15 13L13 10" stroke="#1f2937" strokeWidth="1" />
            <path d="M33 13L35 10" stroke="#1f2937" strokeWidth="1" />
          </>
        ) : mood === 'happy' ? (
          // Happy closed eyes (^_^)
          <>
            <path d="M17 14c1.5-2 3.5-2 5 0" stroke="#1f2937" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M26 14c1.5-2 3.5-2 5 0" stroke="#1f2937" strokeWidth="1.5" strokeLinecap="round" />
          </>
        ) : (
          // Normal eyes
          <>
            <circle cx="19" cy="14" r="3" fill="white" />
            <circle cx="29" cy="14" r="3" fill="white" />
            <circle cx="20" cy="14" r="1.5" fill="#1f2937" />
            <circle cx="30" cy="14" r="1.5" fill="#1f2937" />
            <circle cx="20.5" cy="13.5" r="0.5" fill="white" />
            <circle cx="30.5" cy="13.5" r="0.5" fill="white" />
          </>
        )}

        {/* Beak */}
        <path
          d={mood === 'happy' || mood === 'champion' ? 'M21 20L24 24L27 20' : 'M22 19L24 22L26 19'}
          fill="#f97316"
          stroke="#ea580c"
          strokeWidth="0.5"
        />

        {/* Wings */}
        <ellipse
          cx="11"
          cy="28"
          rx="4"
          ry="6"
          fill="#fbbf24"
          className={mood === 'happy' ? 'animate-wave-left' : ''}
        />
        <ellipse
          cx="37"
          cy="28"
          rx="4"
          ry="6"
          fill="#fbbf24"
          className={mood === 'happy' ? 'animate-wave-right' : ''}
        />

        {/* Feet */}
        <path d="M18 38L16 42M18 38L18 42M18 38L20 42" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M30 38L28 42M30 38L30 42M30 38L32 42" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" />

        {/* Gradients */}
        <defs>
          <linearGradient id="body-gradient" x1="24" y1="16" x2="24" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fde047" />
            <stop offset="1" stopColor="#facc15" />
          </linearGradient>
          <linearGradient id="head-gradient" x1="24" y1="5" x2="24" y2="27" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fef08a" />
            <stop offset="1" stopColor="#fcd34d" />
          </linearGradient>
        </defs>
      </svg>

      {/* Sparkles for happy mood */}
      {mood === 'happy' && (
        <>
          <span className="absolute -top-1 -right-1 text-yellow-400 animate-ping">✨</span>
          <span className="absolute -top-2 left-0 text-yellow-300 animate-pulse delay-100">⭐</span>
        </>
      )}
    </div>
  );
}

// Add custom animations to tailwind.config.js or use inline styles
// These are defined in globals.css:
/*
@keyframes bounce-subtle {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}

@keyframes bounce-happy {
  0%, 100% { transform: translateY(0) rotate(-3deg); }
  25% { transform: translateY(-8px) rotate(3deg); }
  50% { transform: translateY(-4px) rotate(-3deg); }
  75% { transform: translateY(-6px) rotate(3deg); }
}

@keyframes wiggle {
  0%, 100% { transform: rotate(-3deg); }
  50% { transform: rotate(3deg); }
}

@keyframes flicker {
  0%, 100% { opacity: 0.8; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.1); }
}

@keyframes wave-left {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(-20deg); }
}

@keyframes wave-right {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(20deg); }
}

@keyframes pulse-glow {
  0%, 100% { filter: drop-shadow(0 0 8px #fbbf24); }
  50% { filter: drop-shadow(0 0 16px #fbbf24); }
}
*/
