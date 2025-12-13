/**
 * Conversations API
 *
 * API functions for conversation and message management
 */

import { apiClient } from './client';

export type ConversationStatus = 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED';
export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type MessageDirection = 'INBOUND' | 'OUTBOUND';
export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'STICKER' | 'LOCATION' | 'CONTACT' | 'TEMPLATE' | 'INTERACTIVE' | 'REACTION' | 'SYSTEM';
export type MessageStatus = 'PENDING' | 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

export interface Contact {
  id: string;
  identifier: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
}

export interface Channel {
  id: string;
  name: string;
  type: string;
  identifier: string;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  channelId: string;
  externalId?: string;
  direction: MessageDirection;
  type: MessageType;
  content: any;
  status: MessageStatus;
  sentByUser?: User;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  failedReason?: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  organizationId: string;
  channelId: string;
  contactId: string;
  assignedUserId?: string;
  status: ConversationStatus;
  priority: Priority;
  lastMessageAt?: string;
  unreadCount: number;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
  contact: Contact;
  channel: Channel;
  assignedUser?: User;
  lastMessage?: Message;
}

export interface ConversationStats {
  open: number;
  pending: number;
  resolved: number;
  closed: number;
  unassigned: number;
  total: number;
}

export interface ListConversationsParams {
  status?: ConversationStatus | ConversationStatus[];
  assignedUserId?: string | null;
  channelId?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'lastMessageAt' | 'createdAt' | 'unreadCount';
  sortOrder?: 'asc' | 'desc';
}

export interface ListConversationsResponse {
  conversations: Conversation[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListMessagesResponse {
  messages: Message[];
  hasMore: boolean;
  oldestId?: string;
  newestId?: string;
}

// Conversations

export async function listConversations(params: ListConversationsParams = {}): Promise<ListConversationsResponse> {
  const searchParams = new URLSearchParams();

  if (params.status) {
    searchParams.set('status', Array.isArray(params.status) ? params.status.join(',') : params.status);
  }
  if (params.assignedUserId !== undefined) {
    searchParams.set('assignedUserId', params.assignedUserId === null ? 'null' : params.assignedUserId);
  }
  if (params.channelId) searchParams.set('channelId', params.channelId);
  if (params.search) searchParams.set('search', params.search);
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.offset) searchParams.set('offset', params.offset.toString());
  if (params.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);

  const response = await apiClient.get<{ success: boolean; data: ListConversationsResponse }>(
    `/conversations?${searchParams.toString()}`
  );
  return response.data.data;
}

export async function getConversation(conversationId: string): Promise<Conversation> {
  const response = await apiClient.get<{ success: boolean; data: Conversation }>(
    `/conversations/${conversationId}`
  );
  return response.data.data;
}

export async function updateConversation(
  conversationId: string,
  data: { status?: ConversationStatus; priority?: Priority; assignedUserId?: string | null }
): Promise<Conversation> {
  const response = await apiClient.patch<{ success: boolean; data: Conversation }>(
    `/conversations/${conversationId}`,
    data
  );
  return response.data.data;
}

export async function assignConversation(conversationId: string, userId: string | null): Promise<Conversation> {
  const response = await apiClient.post<{ success: boolean; data: Conversation }>(
    `/conversations/${conversationId}/assign`,
    { userId }
  );
  return response.data.data;
}

export async function closeConversation(conversationId: string): Promise<Conversation> {
  const response = await apiClient.post<{ success: boolean; data: Conversation }>(
    `/conversations/${conversationId}/close`
  );
  return response.data.data;
}

export async function reopenConversation(conversationId: string): Promise<Conversation> {
  const response = await apiClient.post<{ success: boolean; data: Conversation }>(
    `/conversations/${conversationId}/reopen`
  );
  return response.data.data;
}

export async function markConversationAsRead(conversationId: string): Promise<void> {
  await apiClient.post(`/conversations/${conversationId}/read`);
}

export async function getConversationStats(): Promise<ConversationStats> {
  const response = await apiClient.get<{ success: boolean; data: ConversationStats }>(
    '/conversations/stats'
  );
  return response.data.data;
}

// Messages

export async function getMessages(
  conversationId: string,
  params: { limit?: number; before?: string; after?: string } = {}
): Promise<ListMessagesResponse> {
  const searchParams = new URLSearchParams();
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.before) searchParams.set('before', params.before);
  if (params.after) searchParams.set('after', params.after);

  const response = await apiClient.get<{ success: boolean; data: ListMessagesResponse }>(
    `/conversations/${conversationId}/messages?${searchParams.toString()}`
  );
  return response.data.data;
}

export async function sendMessage(data: {
  conversationId: string;
  text?: string;
  media?: {
    type: 'image' | 'video' | 'audio' | 'document';
    url?: string;
    mimetype?: string;
    filename?: string;
    caption?: string;
  };
}): Promise<Message> {
  const response = await apiClient.post<{ success: boolean; data: Message }>('/messages', data);
  return response.data.data;
}

export async function deleteMessage(messageId: string): Promise<void> {
  await apiClient.delete(`/messages/${messageId}`);
}

// Media upload

export interface UploadedMedia {
  url: string;
  publicId: string;
  type: 'image' | 'video' | 'audio' | 'document';
  mimetype: string;
  filename: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
}

export async function uploadMedia(file: File): Promise<UploadedMedia> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiClient.post<{ success: boolean; data: UploadedMedia }>(
    '/media/upload',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return response.data.data;
}

// Agent collision prevention

export interface SetActiveAgentResponse {
  warning?: string;
  activeAgent?: {
    id: string;
    name: string;
  };
}

export async function setActiveAgent(conversationId: string): Promise<SetActiveAgentResponse> {
  const response = await apiClient.post<{ success: boolean; data: SetActiveAgentResponse }>(
    `/conversations/${conversationId}/active`
  );
  return response.data.data;
}

export async function clearActiveAgent(conversationId: string): Promise<void> {
  await apiClient.delete(`/conversations/${conversationId}/active`);
}
