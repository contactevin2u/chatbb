/**
 * Scheduled Message API functions
 */

import { apiClient } from './client';

export interface ScheduledMessageContent {
  text?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  mediaUrl?: string;
  mediaFilename?: string;
}

export interface ScheduledMessage {
  id: string;
  organizationId: string;
  conversationId: string;
  createdById: string;
  content: ScheduledMessageContent;
  scheduledAt: string;
  sentAt: string | null;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface CreateScheduledMessageInput {
  conversationId: string;
  content: ScheduledMessageContent;
  scheduledAt: string;
}

/**
 * Create a scheduled message
 */
export async function createScheduledMessage(
  input: CreateScheduledMessageInput
): Promise<ScheduledMessage> {
  const response = await apiClient.post<{ success: boolean; data: ScheduledMessage }>(
    '/scheduled-messages',
    input
  );
  return response.data.data;
}

/**
 * List scheduled messages for a conversation
 */
export async function listScheduledMessages(
  conversationId: string
): Promise<ScheduledMessage[]> {
  const response = await apiClient.get<{ success: boolean; data: ScheduledMessage[] }>(
    `/conversations/${conversationId}/scheduled-messages`
  );
  return response.data.data;
}

/**
 * Get a scheduled message
 */
export async function getScheduledMessage(id: string): Promise<ScheduledMessage> {
  const response = await apiClient.get<{ success: boolean; data: ScheduledMessage }>(
    `/scheduled-messages/${id}`
  );
  return response.data.data;
}

/**
 * Cancel a scheduled message
 */
export async function cancelScheduledMessage(id: string): Promise<void> {
  await apiClient.delete(`/scheduled-messages/${id}`);
}

/**
 * Update scheduled message time
 */
export async function updateScheduledMessageTime(
  id: string,
  scheduledAt: string
): Promise<ScheduledMessage> {
  const response = await apiClient.patch<{ success: boolean; data: ScheduledMessage }>(
    `/scheduled-messages/${id}`,
    { scheduledAt }
  );
  return response.data.data;
}
