/**
 * Team API
 *
 * API functions for team management, agent availability, and queue operations
 */

import { apiClient } from './client';

// ==================== TYPES ====================

export type AgentAvailability = 'ONLINE' | 'AWAY' | 'BUSY' | 'OFFLINE';
export type AssignmentMode = 'MANUAL' | 'ROUND_ROBIN' | 'LOAD_BALANCED' | 'TEAM_BASED';

export interface Team {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  members: TeamMemberWithUser[];
  channels: TeamChannelWithChannel[];
  _count?: {
    members: number;
    channels: number;
  };
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  isLeader: boolean;
  createdAt: string;
}

export interface TeamMemberWithUser extends TeamMember {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatarUrl?: string;
    role: string;
  };
}

export interface TeamChannel {
  id: string;
  teamId: string;
  channelId: string;
  createdAt: string;
}

export interface TeamChannelWithChannel extends TeamChannel {
  channel: {
    id: string;
    name: string;
    type: string;
    identifier: string;
  };
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  avatarUrl?: string;
  availabilityStatus: AgentAvailability;
  lastActiveAt?: string;
  createdAt: string;
  teams?: { id: string; name: string; isLeader: boolean }[];
  openConversations?: number;
}

export interface AgentStats {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl?: string;
  role: string;
  availabilityStatus: AgentAvailability;
  lastActiveAt?: string;
  openConversations: number;
  totalAssigned: number;
}

export interface QueueStats {
  waiting: number;
  avgWaitTime: number;
  onlineAgents: number;
  totalAgents: number;
  handledToday: number;
}

export interface UnassignedConversation {
  id: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  contactName: string;
  contactIdentifier: string;
  channelName: string;
  channelType: string;
  waitingTime: number;
  unreadCount: number;
  createdAt: string;
  lastMessageAt?: string;
}

export interface ConversationAgent {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl?: string;
  role: string;
  availabilityStatus: AgentAvailability;
  isPrimary: boolean;
  assignedAt: string;
}

// ==================== TEAM API ====================

/**
 * List all teams in organization
 */
export async function listTeams(): Promise<Team[]> {
  const response = await apiClient.get<{ success: boolean; data: Team[] }>('/teams');
  return response.data.data;
}

/**
 * Create a new team
 */
export async function createTeam(data: { name: string; description?: string }): Promise<Team> {
  const response = await apiClient.post<{ success: boolean; data: Team }>('/teams', data);
  return response.data.data;
}

/**
 * Get a team by ID
 */
export async function getTeam(teamId: string): Promise<Team> {
  const response = await apiClient.get<{ success: boolean; data: Team }>(`/teams/${teamId}`);
  return response.data.data;
}

/**
 * Update a team
 */
export async function updateTeam(
  teamId: string,
  data: { name?: string; description?: string }
): Promise<Team> {
  const response = await apiClient.patch<{ success: boolean; data: Team }>(`/teams/${teamId}`, data);
  return response.data.data;
}

/**
 * Delete a team
 */
export async function deleteTeam(teamId: string): Promise<void> {
  await apiClient.delete(`/teams/${teamId}`);
}

// ==================== TEAM MEMBERS API ====================

/**
 * List team members
 */
export async function listTeamMembers(teamId: string): Promise<TeamMemberWithUser[]> {
  const response = await apiClient.get<{ success: boolean; data: TeamMemberWithUser[] }>(
    `/teams/${teamId}/members`
  );
  return response.data.data;
}

/**
 * Add member to team
 */
export async function addTeamMember(
  teamId: string,
  userId: string,
  isLeader?: boolean
): Promise<TeamMemberWithUser> {
  const response = await apiClient.post<{ success: boolean; data: TeamMemberWithUser }>(
    `/teams/${teamId}/members`,
    { userId, isLeader }
  );
  return response.data.data;
}

/**
 * Remove member from team
 */
export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  await apiClient.delete(`/teams/${teamId}/members/${userId}`);
}

/**
 * Set team leader
 */
export async function setTeamLeader(
  teamId: string,
  userId: string,
  isLeader: boolean
): Promise<TeamMemberWithUser> {
  const response = await apiClient.patch<{ success: boolean; data: TeamMemberWithUser }>(
    `/teams/${teamId}/members/${userId}/leader`,
    { isLeader }
  );
  return response.data.data;
}

// ==================== TEAM CHANNELS API ====================

/**
 * List channels assigned to a team
 */
export async function listTeamChannels(teamId: string): Promise<TeamChannelWithChannel['channel'][]> {
  const response = await apiClient.get<{ success: boolean; data: TeamChannelWithChannel['channel'][] }>(
    `/teams/${teamId}/channels`
  );
  return response.data.data;
}

/**
 * Assign channel to team
 */
export async function assignChannelToTeam(teamId: string, channelId: string): Promise<TeamChannel> {
  const response = await apiClient.post<{ success: boolean; data: TeamChannel }>(
    `/teams/${teamId}/channels`,
    { channelId }
  );
  return response.data.data;
}

/**
 * Unassign channel from team
 */
export async function unassignChannelFromTeam(teamId: string, channelId: string): Promise<void> {
  await apiClient.delete(`/teams/${teamId}/channels/${channelId}`);
}

// ==================== USER/AGENT API ====================

/**
 * List all users in organization
 */
export async function listUsers(): Promise<User[]> {
  const response = await apiClient.get<{ success: boolean; data: User[] }>('/users');
  return response.data.data;
}

/**
 * Create a new user
 */
export async function createUser(data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: 'ADMIN' | 'SUPERVISOR' | 'AGENT';
}): Promise<User> {
  const response = await apiClient.post<{ success: boolean; data: User }>('/users', data);
  return response.data.data;
}

/**
 * Update a user
 */
export async function updateUser(
  userId: string,
  data: {
    firstName?: string;
    lastName?: string;
    role?: 'ADMIN' | 'SUPERVISOR' | 'AGENT';
    status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  }
): Promise<User> {
  const response = await apiClient.patch<{ success: boolean; data: User }>(`/users/${userId}`, data);
  return response.data.data;
}

/**
 * Delete a user
 */
export async function deleteUser(userId: string): Promise<void> {
  await apiClient.delete(`/users/${userId}`);
}

/**
 * Get agent stats (workload)
 */
export async function getAgentStats(): Promise<AgentStats[]> {
  const response = await apiClient.get<{ success: boolean; data: AgentStats[] }>('/users/stats');
  return response.data.data;
}

/**
 * Get available agents
 */
export async function getAvailableAgents(
  channelId?: string,
  statuses?: AgentAvailability[]
): Promise<User[]> {
  const params = new URLSearchParams();
  if (channelId) params.set('channelId', channelId);
  if (statuses) params.set('statuses', statuses.join(','));

  const response = await apiClient.get<{ success: boolean; data: User[] }>(
    `/users/available?${params.toString()}`
  );
  return response.data.data;
}

/**
 * Set current user's availability
 */
export async function setAvailability(status: AgentAvailability): Promise<void> {
  await apiClient.put('/users/me/availability', { status });
}

/**
 * Send heartbeat (update last active)
 */
export async function heartbeat(): Promise<void> {
  await apiClient.post('/users/me/heartbeat');
}

// ==================== QUEUE API ====================

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<QueueStats> {
  const response = await apiClient.get<{ success: boolean; data: QueueStats }>('/queue/stats');
  return response.data.data;
}

/**
 * Get unassigned conversations queue
 */
export async function getQueue(channelId?: string, limit?: number): Promise<UnassignedConversation[]> {
  const params = new URLSearchParams();
  if (channelId) params.set('channelId', channelId);
  if (limit) params.set('limit', limit.toString());

  const response = await apiClient.get<{ success: boolean; data: UnassignedConversation[] }>(
    `/queue?${params.toString()}`
  );
  return response.data.data;
}

/**
 * Take a conversation from queue (self-assign)
 */
export async function takeConversation(conversationId: string): Promise<ConversationAgent> {
  const response = await apiClient.post<{ success: boolean; data: ConversationAgent }>(
    `/queue/take/${conversationId}`
  );
  return response.data.data;
}

/**
 * Assign an agent to a conversation
 */
export async function assignAgentToConversation(
  conversationId: string,
  userId: string,
  isPrimary?: boolean
): Promise<ConversationAgent> {
  const response = await apiClient.post<{ success: boolean; data: ConversationAgent }>('/queue/assign', {
    conversationId,
    userId,
    isPrimary,
  });
  return response.data.data;
}

/**
 * Unassign an agent from a conversation
 */
export async function unassignAgentFromConversation(
  conversationId: string,
  userId: string
): Promise<void> {
  await apiClient.delete(`/queue/assign/${conversationId}/${userId}`);
}

/**
 * Set primary agent for a conversation
 */
export async function setPrimaryAgent(conversationId: string, userId: string): Promise<ConversationAgent> {
  const response = await apiClient.put<{ success: boolean; data: ConversationAgent }>('/queue/primary', {
    conversationId,
    userId,
  });
  return response.data.data;
}

/**
 * Get agents assigned to a conversation
 */
export async function getConversationAgents(conversationId: string): Promise<ConversationAgent[]> {
  const response = await apiClient.get<{ success: boolean; data: ConversationAgent[] }>(
    `/queue/agents/${conversationId}`
  );
  return response.data.data;
}

/**
 * Auto-assign a conversation
 */
export async function autoAssignConversation(
  conversationId: string,
  mode?: AssignmentMode,
  channelId?: string
): Promise<ConversationAgent | null> {
  const response = await apiClient.post<{ success: boolean; data: ConversationAgent | null }>(
    `/queue/auto-assign/${conversationId}`,
    { mode, channelId }
  );
  return response.data.data;
}
