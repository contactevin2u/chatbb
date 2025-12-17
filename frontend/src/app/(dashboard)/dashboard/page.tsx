'use client';

import {
  MessageSquare,
  Users,
  TrendingUp,
  Clock,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
}

function StatCard({ title, value, change, changeLabel, icon: Icon }: StatCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-hotpink-500 to-purple-500 flex items-center justify-center shadow-[0_4px_12px_rgba(255,26,133,0.3)]">
          <Icon className="h-4 w-4 text-white" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold bg-gradient-to-r from-hotpink-600 to-purple-600 bg-clip-text text-transparent">{value}</div>
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
            {changeLabel && <span>{changeLabel}</span>}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-hotpink-500 to-purple-500 bg-clip-text text-transparent">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back! Here&apos;s an overview of your inbox.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Conversations"
          value="1,234"
          change={12}
          changeLabel="from last week"
          icon={MessageSquare}
        />
        <StatCard
          title="Active Contacts"
          value="856"
          change={8}
          changeLabel="from last week"
          icon={Users}
        />
        <StatCard
          title="Response Rate"
          value="94%"
          change={3}
          changeLabel="from last week"
          icon={TrendingUp}
        />
        <StatCard
          title="Avg. Response Time"
          value="2.4 min"
          change={-15}
          changeLabel="from last week"
          icon={Clock}
        />
      </div>

      {/* Recent Conversations */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Conversations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 p-3 rounded-xl hover:bg-hotpink-50 dark:hover:bg-purple-900/30 cursor-pointer transition-all duration-200"
                >
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-hotpink-400 to-purple-500 flex items-center justify-center text-white shadow-[0_2px_8px_rgba(255,26,133,0.3)]">
                    <span className="text-sm font-medium">JD</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">John Doe</p>
                    <p className="text-sm text-muted-foreground truncate">
                      Thanks for your help with the order...
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">2m ago</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Team Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: 'Sarah Chen', status: 'online', conversations: 12 },
                { name: 'Mike Johnson', status: 'online', conversations: 8 },
                { name: 'Emily Davis', status: 'away', conversations: 5 },
                { name: 'Alex Kim', status: 'offline', conversations: 0 },
              ].map((agent) => (
                <div key={agent.name} className="flex items-center gap-4 p-2 rounded-xl hover:bg-hotpink-50 dark:hover:bg-purple-900/30 transition-all duration-200">
                  <div className="relative">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-lavender-200 to-hotpink-200 dark:from-purple-800 dark:to-hotpink-900 flex items-center justify-center">
                      <span className="text-sm font-medium text-hotpink-700 dark:text-hotpink-200">
                        {agent.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')}
                      </span>
                    </div>
                    <span
                      className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background ${
                        agent.status === 'online'
                          ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(52,211,153,0.3)]'
                          : agent.status === 'away'
                          ? 'bg-amber-500 shadow-[0_0_0_3px_rgba(251,191,36,0.3)]'
                          : 'bg-gray-400'
                      }`}
                    />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{agent.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {agent.conversations} active conversations
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Channel Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Channel Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { name: 'WhatsApp', messages: 1234, percentage: 65, color: 'from-emerald-400 to-teal-500' },
              { name: 'Instagram', messages: 456, percentage: 24, color: 'from-hotpink-400 to-rose-500' },
              { name: 'TikTok', messages: 210, percentage: 11, color: 'from-purple-400 to-violet-500' },
            ].map((channel) => (
              <div key={channel.name} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{channel.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {channel.messages.toLocaleString()} messages
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-hotpink-100 dark:bg-purple-900/50 overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${channel.color} rounded-full shadow-[0_0_8px_rgba(255,26,133,0.4)] transition-all duration-500`}
                    style={{ width: `${channel.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
