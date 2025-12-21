'use client';

import { useQuery } from '@tanstack/react-query';
import { Trophy, Crown, Medal, Flame } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { gamificationApi, LeaderboardEntry, LeaderboardPeriod } from '@/lib/api/gamification';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils/cn';
import { useState } from 'react';

interface LeaderboardCardProps {
  className?: string;
}

const PERIOD_LABELS: Record<LeaderboardPeriod, string> = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
  all: 'All Time',
};

/**
 * Leaderboard card showing top agents
 */
export function LeaderboardCard({ className }: LeaderboardCardProps) {
  const { user } = useAuthStore();
  const [period, setPeriod] = useState<LeaderboardPeriod>('today');

  const { data: leaderboard, isLoading } = useQuery({
    queryKey: ['leaderboard', period],
    queryFn: () => gamificationApi.getLeaderboard(period, 5),
    refetchInterval: 30000, // Refresh every 30s
    staleTime: 10000,
  });

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="w-5 h-5 text-amber-500" />;
      case 2:
        return <Medal className="w-5 h-5 text-gray-400" />;
      case 3:
        return <Medal className="w-5 h-5 text-amber-700" />;
      default:
        return <span className="w-5 h-5 text-center text-sm font-bold text-gray-400">#{rank}</span>;
    }
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trophy className="w-5 h-5 text-amber-500" />
            <span>Leaderboard</span>
          </CardTitle>
          {/* Period tabs */}
          <div className="flex gap-1 text-xs">
            {(['today', 'week'] as LeaderboardPeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  'px-2 py-1 rounded-full transition-colors',
                  period === p
                    ? 'bg-pink-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                )}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700" />
                <div className="flex-1 h-4 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="w-12 h-4 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
            ))}
          </div>
        ) : leaderboard && leaderboard.length > 0 ? (
          <div className="space-y-2">
            {leaderboard.map((entry) => (
              <LeaderboardRow
                key={entry.userId}
                entry={entry}
                isCurrentUser={entry.userId === user?.id}
                rankIcon={getRankIcon(entry.rank)}
                getInitials={getInitials}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Trophy className="w-12 h-12 mx-auto mb-2 opacity-20" />
            <p className="text-sm">No activity yet</p>
            <p className="text-xs">Start chatting to earn points!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface LeaderboardRowProps {
  entry: LeaderboardEntry;
  isCurrentUser: boolean;
  rankIcon: React.ReactNode;
  getInitials: (firstName: string, lastName: string) => string;
}

function LeaderboardRow({ entry, isCurrentUser, rankIcon, getInitials }: LeaderboardRowProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 p-2 rounded-lg transition-colors',
        isCurrentUser && 'bg-pink-50 dark:bg-pink-900/20 ring-1 ring-pink-200 dark:ring-pink-800',
        entry.rank === 1 && !isCurrentUser && 'bg-amber-50 dark:bg-amber-900/10',
        !isCurrentUser && entry.rank > 1 && 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
      )}
    >
      {/* Rank */}
      <div className="flex-shrink-0 w-6 flex justify-center">
        {rankIcon}
      </div>

      {/* Avatar */}
      <Avatar className="w-8 h-8 flex-shrink-0">
        <AvatarImage src={entry.avatarUrl || undefined} />
        <AvatarFallback className={cn(
          'text-xs font-semibold',
          entry.rank === 1 ? 'bg-amber-100 text-amber-700' : 'bg-pink-100 text-pink-700'
        )}>
          {getInitials(entry.firstName, entry.lastName)}
        </AvatarFallback>
      </Avatar>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          'font-medium truncate text-sm',
          isCurrentUser && 'text-pink-700 dark:text-pink-300'
        )}>
          {entry.firstName} {entry.lastName}
          {isCurrentUser && <span className="ml-1 text-xs opacity-60">(You)</span>}
        </p>
        {entry.streak > 0 && (
          <div className="flex items-center gap-1 text-xs text-orange-500">
            <Flame className="w-3 h-3" />
            <span>{entry.streak}d streak</span>
          </div>
        )}
      </div>

      {/* Points */}
      <div className={cn(
        'flex-shrink-0 px-2 py-1 rounded-full text-xs font-bold',
        entry.rank === 1
          ? 'bg-gradient-to-r from-amber-400 to-yellow-400 text-amber-900'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
      )}>
        {entry.points.toLocaleString()} pts
      </div>
    </div>
  );
}
