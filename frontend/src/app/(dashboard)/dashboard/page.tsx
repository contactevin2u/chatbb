'use client';

import { useEffect, useState } from 'react';
import {
  MessageSquare,
  Users,
  TrendingUp,
  Clock,
  ArrowUp,
  ArrowDown,
  Loader2,
  MessageCircle,
  UserPlus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  analyticsApi,
  OverviewStats,
  ChannelStats,
  AgentStats,
  AnalyticsPeriod,
} from '@/lib/api/analytics';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
}

function StatCard({ title, value, change, changeLabel, icon: Icon, loading }: StatCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 sm:px-6 pt-4 sm:pt-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-gradient-to-br from-hotpink-500 to-purple-500 flex items-center justify-center shadow-[0_4px_12px_rgba(255,26,133,0.3)] flex-shrink-0">
          <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
        </div>
      </CardHeader>
      <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
        {loading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin text-hotpink-500" />
            <span className="text-muted-foreground text-sm">Loading...</span>
          </div>
        ) : (
          <>
            <div className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-hotpink-600 to-purple-600 bg-clip-text text-transparent">
              {value}
            </div>
            {change !== undefined && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                {change >= 0 ? (
                  <ArrowUp className="h-3 w-3 text-emerald-500" />
                ) : (
                  <ArrowDown className="h-3 w-3 text-rose-500" />
                )}
                <span className={change >= 0 ? 'text-emerald-500 font-medium' : 'text-rose-500 font-medium'}>
                  {Math.abs(change)}%
                </span>
                {changeLabel && <span className="truncate">{changeLabel}</span>}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function formatResponseTime(ms: number | null): string {
  if (!ms) return '-';
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)} min`;
  return `${(ms / 3600000).toFixed(1)} hr`;
}

const channelColors: Record<string, string> = {
  WHATSAPP: 'from-emerald-400 to-teal-500',
  INSTAGRAM: 'from-hotpink-400 to-rose-500',
  TIKTOK: 'from-purple-400 to-violet-500',
  TELEGRAM: 'from-blue-400 to-cyan-500',
  EMAIL: 'from-amber-400 to-orange-500',
};

export default function DashboardPage() {
  const [period, setPeriod] = useState<AnalyticsPeriod>('week');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [channels, setChannels] = useState<ChannelStats[]>([]);
  const [agents, setAgents] = useState<AgentStats[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalytics() {
      setLoading(true);
      setError(null);
      try {
        const [overviewData, channelsData, agentsData] = await Promise.all([
          analyticsApi.getOverview(period),
          analyticsApi.getChannelStats(period),
          analyticsApi.getAgentStats(period),
        ]);
        setOverview(overviewData);
        setChannels(channelsData);
        setAgents(agentsData);
      } catch (err: any) {
        console.error('Failed to fetch analytics:', err);
        setError(err.message || 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, [period]);

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-hotpink-500 to-purple-500 bg-clip-text text-transparent">
            Dashboard
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground truncate">
            Welcome back! Here&apos;s an overview of your inbox.
          </p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as AnalyticsPeriod)}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="yesterday">Yesterday</SelectItem>
            <SelectItem value="week">Last 7 days</SelectItem>
            <SelectItem value="month">Last 30 days</SelectItem>
            <SelectItem value="quarter">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-3 sm:p-4 text-sm sm:text-base text-rose-600 dark:text-rose-400">
          {error}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Conversations"
          value={overview?.totalConversations.toLocaleString() || '0'}
          icon={MessageSquare}
          loading={loading}
        />
        <StatCard
          title="Active Contacts"
          value={overview?.activeContacts.toLocaleString() || '0'}
          icon={Users}
          loading={loading}
        />
        <StatCard
          title="Response Rate"
          value={`${overview?.responseRate || 0}%`}
          icon={TrendingUp}
          loading={loading}
        />
        <StatCard
          title="Avg. Response"
          value={formatResponseTime(overview?.avgResponseTimeMs || null)}
          icon={Clock}
          loading={loading}
        />
      </div>

      {/* Message & Contact Stats */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Messages In"
          value={overview?.messagesIn.toLocaleString() || '0'}
          icon={MessageCircle}
          loading={loading}
        />
        <StatCard
          title="Messages Out"
          value={overview?.messagesOut.toLocaleString() || '0'}
          icon={MessageSquare}
          loading={loading}
        />
        <StatCard
          title="Convos Opened"
          value={overview?.conversationsOpened.toLocaleString() || '0'}
          icon={MessageSquare}
          loading={loading}
        />
        <StatCard
          title="New Contacts"
          value={overview?.newContacts.toLocaleString() || '0'}
          icon={UserPlus}
          loading={loading}
        />
      </div>

      {/* Team Activity & Channel Stats */}
      <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-2 sm:pb-4">
            <CardTitle className="text-base sm:text-lg">Team Activity</CardTitle>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
            {loading ? (
              <div className="flex items-center justify-center py-6 sm:py-8">
                <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin text-hotpink-500" />
              </div>
            ) : agents.length === 0 ? (
              <p className="text-center text-muted-foreground py-6 sm:py-8 text-sm sm:text-base">No team members found</p>
            ) : (
              <div className="space-y-2 sm:space-y-4">
                {agents.map((agent) => (
                  <div
                    key={agent.userId}
                    className="flex items-center gap-3 sm:gap-4 p-2 rounded-xl hover:bg-hotpink-50 dark:hover:bg-purple-900/30 transition-all duration-200"
                  >
                    <div className="relative flex-shrink-0">
                      <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-gradient-to-br from-lavender-200 to-hotpink-200 dark:from-purple-800 dark:to-hotpink-900 flex items-center justify-center">
                        <span className="text-xs sm:text-sm font-medium text-hotpink-700 dark:text-hotpink-200">
                          {agent.firstName?.[0] || ''}{agent.lastName?.[0] || ''}
                        </span>
                      </div>
                      <span
                        className={`absolute bottom-0 right-0 h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full border-2 border-background ${
                          agent.isAvailable
                            ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(52,211,153,0.3)]'
                            : 'bg-gray-400'
                        }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm sm:text-base truncate">{agent.firstName} {agent.lastName}</p>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        <span className="hidden xs:inline">{agent.messagesOut} sent · {agent.conversationsClosed} closed</span>
                        <span className="xs:hidden">{agent.messagesOut} / {agent.conversationsClosed}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-2 sm:pb-4">
            <CardTitle className="text-base sm:text-lg">Channel Performance</CardTitle>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
            {loading ? (
              <div className="flex items-center justify-center py-6 sm:py-8">
                <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin text-hotpink-500" />
              </div>
            ) : channels.length === 0 ? (
              <p className="text-center text-muted-foreground py-6 sm:py-8 text-sm sm:text-base">No channels found</p>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {channels.map((channel) => {
                  const totalMessages = channel.messagesIn + channel.messagesOut;
                  return (
                    <div key={channel.channelId} className="space-y-1.5 sm:space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm sm:text-base truncate">{channel.channelName}</span>
                        <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                          {totalMessages.toLocaleString()} <span className="hidden sm:inline">messages</span><span className="sm:hidden">msg</span>
                        </span>
                      </div>
                      <div className="h-2 sm:h-2.5 rounded-full bg-hotpink-100 dark:bg-purple-900/50 overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-r ${
                            channelColors[channel.channelType] || 'from-gray-400 to-gray-500'
                          } rounded-full shadow-[0_0_8px_rgba(255,26,133,0.4)] transition-all duration-500`}
                          style={{ width: `${Math.max(channel.percentage, 5)}%` }}
                        />
                      </div>
                      <div className="flex flex-wrap text-xs text-muted-foreground gap-x-3 sm:gap-x-4 gap-y-0.5">
                        <span>In: {channel.messagesIn.toLocaleString()}</span>
                        <span>Out: {channel.messagesOut.toLocaleString()}</span>
                        <span>{channel.percentage}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
