'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Clock, AlertTriangle, AlertCircle, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getUnrepliedConversations, UnrepliedResponse } from '@/lib/api/conversations';
import { cn } from '@/lib/utils/cn';

export function NotificationBell() {
  const router = useRouter();
  const [data, setData] = useState<UnrepliedResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUnreplied = async () => {
    try {
      const result = await getUnrepliedConversations();
      setData(result);
    } catch (error) {
      console.error('Failed to fetch unreplied conversations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUnreplied();
    // Refresh every 2 minutes
    const interval = setInterval(fetchUnreplied, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleConversationClick = (conversationId: string) => {
    router.push(`/inbox?conversation=${conversationId}`);
  };

  const formatWaitTime = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours}h`;
    }
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  const getUrgencyColor = (minutes: number): string => {
    if (minutes > 24 * 60) return 'text-destructive'; // > 24 hours
    if (minutes > 60) return 'text-orange-500'; // 1-24 hours
    return 'text-muted-foreground'; // < 1 hour
  };

  const getUrgencyIcon = (minutes: number) => {
    if (minutes > 24 * 60) return <AlertCircle className="h-3 w-3 text-destructive" />;
    if (minutes > 60) return <AlertTriangle className="h-3 w-3 text-orange-500" />;
    return <Clock className="h-3 w-3 text-muted-foreground" />;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {data && data.total > 0 && (
            <span
              className={cn(
                'absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-medium rounded-full',
                data.urgent > 0
                  ? 'bg-destructive text-destructive-foreground'
                  : data.warning > 0
                  ? 'bg-orange-500 text-white'
                  : 'bg-primary text-primary-foreground'
              )}
            >
              {data.total > 99 ? '99+' : data.total}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80" align="end" forceMount>
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Unreplied Messages</span>
          <span className="text-xs font-normal text-muted-foreground">Last 72 hours</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Loading...</div>
        ) : !data || data.total === 0 ? (
          <div className="py-6 text-center">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">All caught up!</p>
            <p className="text-xs text-muted-foreground/70">No unreplied messages</p>
          </div>
        ) : (
          <>
            {/* Summary stats */}
            <div className="px-2 py-2 grid grid-cols-3 gap-2 text-center border-b">
              <div className="space-y-0.5">
                <p className="text-lg font-semibold text-destructive">{data.urgent}</p>
                <p className="text-[10px] text-muted-foreground">Urgent (&gt;24h)</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-lg font-semibold text-orange-500">{data.warning}</p>
                <p className="text-[10px] text-muted-foreground">Warning (1-24h)</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-lg font-semibold text-muted-foreground">{data.recent}</p>
                <p className="text-[10px] text-muted-foreground">Recent (&lt;1h)</p>
              </div>
            </div>

            {/* Conversation list */}
            <div className="max-h-64 overflow-y-auto">
              {data.conversations.map((conv) => (
                <DropdownMenuItem
                  key={conv.id}
                  className="flex items-center gap-2 py-2 cursor-pointer"
                  onClick={() => handleConversationClick(conv.id)}
                >
                  <div className="flex-shrink-0">{getUrgencyIcon(conv.waitMinutes)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{conv.contactName}</p>
                    <p className="text-xs text-muted-foreground truncate">{conv.channelName}</p>
                  </div>
                  <span className={cn('text-xs font-medium', getUrgencyColor(conv.waitMinutes))}>
                    {formatWaitTime(conv.waitMinutes)}
                  </span>
                </DropdownMenuItem>
              ))}
            </div>

            {data.total > 10 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="justify-center text-primary cursor-pointer"
                  onClick={() => router.push('/inbox?status=OPEN')}
                >
                  View all {data.total} conversations
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
