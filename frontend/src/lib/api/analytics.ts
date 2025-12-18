/**
 * Analytics API Client
 *
 * API calls for dashboard analytics and reporting
 */

import { apiClient } from './client';

export type AnalyticsPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'quarter';

export interface OverviewStats {
  totalConversations: number;
  activeContacts: number;
  messagesIn: number;
  messagesOut: number;
  responseRate: number;
  avgResponseTimeMs: number | null;
  conversationsOpened: number;
  conversationsClosed: number;
  newContacts: number;
}

export interface DailyStats {
  date: string;
  messagesIn: number;
  messagesOut: number;
  conversationsOpened: number;
  conversationsClosed: number;
  newContacts: number;
}

export interface ChannelStats {
  channelId: string;
  channelName: string;
  channelType: string;
  messagesIn: number;
  messagesOut: number;
  conversationsOpened: number;
  conversationsClosed: number;
  percentage: number;
}

export interface AgentStats {
  userId: string;
  firstName: string;
  lastName: string;
  messagesOut: number;
  conversationsClosed: number;
  avgResponseTimeMs: number | null;
  isAvailable: boolean;
}

export interface MessageAnalytics {
  byDirection: Array<{ direction: string; count: number }>;
  byType: Array<{ type: string; count: number }>;
  daily: DailyStats[];
}

export interface ConversationAnalytics {
  byStatus: Array<{ status: string; count: number }>;
  byPriority: Array<{ priority: string; count: number }>;
  totalInPeriod: number;
  currentlyOpen: number;
  closedInPeriod: number;
}

/**
 * Get dashboard overview stats
 */
export async function getOverview(period: AnalyticsPeriod = 'week'): Promise<OverviewStats> {
  const response = await apiClient.get<{ success: boolean; data: OverviewStats }>(
    `/analytics/overview?period=${period}`
  );
  return response.data.data;
}

/**
 * Get daily stats for charts
 */
export async function getDailyStats(period: AnalyticsPeriod = 'week'): Promise<DailyStats[]> {
  const response = await apiClient.get<{ success: boolean; data: DailyStats[] }>(
    `/analytics/daily?period=${period}`
  );
  return response.data.data;
}

/**
 * Get channel performance stats
 */
export async function getChannelStats(period: AnalyticsPeriod = 'week'): Promise<ChannelStats[]> {
  const response = await apiClient.get<{ success: boolean; data: ChannelStats[] }>(
    `/analytics/channels?period=${period}`
  );
  return response.data.data;
}

/**
 * Get agent performance stats
 */
export async function getAgentStats(period: AnalyticsPeriod = 'week'): Promise<AgentStats[]> {
  const response = await apiClient.get<{ success: boolean; data: AgentStats[] }>(
    `/analytics/agents?period=${period}`
  );
  return response.data.data;
}

/**
 * Get message analytics with breakdown
 */
export async function getMessageAnalytics(period: AnalyticsPeriod = 'week'): Promise<MessageAnalytics> {
  const response = await apiClient.get<{ success: boolean; data: MessageAnalytics }>(
    `/analytics/messages?period=${period}`
  );
  return response.data.data;
}

/**
 * Get conversation analytics
 */
export async function getConversationAnalytics(period: AnalyticsPeriod = 'week'): Promise<ConversationAnalytics> {
  const response = await apiClient.get<{ success: boolean; data: ConversationAnalytics }>(
    `/analytics/conversations?period=${period}`
  );
  return response.data.data;
}

export const analyticsApi = {
  getOverview,
  getDailyStats,
  getChannelStats,
  getAgentStats,
  getMessageAnalytics,
  getConversationAnalytics,
};
