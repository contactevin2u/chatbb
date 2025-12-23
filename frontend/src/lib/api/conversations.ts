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
  isGroup: boolean;
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

export interface MessageReaction {
  emoji: string;
  senderId: string;
  timestamp: number;
}

export interface GroupSender {
  jid: string;
  identifier: string;
  pushName?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export interface QuotedMessage {
  stanzaId: string;
  participant: string;
  text: string;
}

export interface Message {
  id: string;
  conversationId: string;
  channelId: string;
  externalId?: string;
  direction: MessageDirection;
  type: MessageType;
  content: any & {
    quotedMessage?: QuotedMessage;
  };
  status: MessageStatus;
  sentByUser?: User;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  failedReason?: string;
  metadata?: {
    reactions?: MessageReaction[];
    groupSender?: GroupSender;
    [key: string]: any;
  };
  createdAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface ConversationNote {
  id: string;
  conversationId: string;
  userId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string;
  };
}

export interface GroupParticipant {
  id: string;
  identifier: string;
  admin?: 'admin' | 'superadmin' | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export interface GroupParticipantsResponse {
  isGroup: boolean;
  subject?: string;
  participants: GroupParticipant[];
  participantCount: number;
}

export interface ConversationTagRelation {
  tag: Tag;
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
  isPinned?: boolean;
  pinnedAt?: string;
  createdAt: string;
  updatedAt: string;
  contact: Contact;
  channel: Channel;
  assignedUser?: User;
  lastMessage?: Message;
  tags?: ConversationTagRelation[];
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
  tagIds?: string[];
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
  if (params.tagIds && params.tagIds.length > 0) {
    searchParams.set('tagIds', params.tagIds.join(','));
  }
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

// Unreplied conversations (90 days)

export interface UnrepliedConversation {
  id: string;
  contactName: string;
  channelName: string;
  lastMessageAt: string;
  waitMinutes: number;
}

export interface UnrepliedResponse {
  total: number;
  urgent: number;
  warning: number;
  recent: number;
  conversations: UnrepliedConversation[];
}

export async function getUnrepliedConversations(): Promise<UnrepliedResponse> {
  const response = await apiClient.get<{ success: boolean; data: UnrepliedResponse }>(
    '/conversations/unreplied'
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

export interface FetchHistoryResponse {
  fetching: boolean;
  reason?: 'no_messages' | 'no_anchor_key';
}

/**
 * Fetch older message history from WhatsApp
 * Triggers an on-demand sync for messages older than what's in the database
 * Messages will arrive via WebSocket when ready
 */
export async function fetchHistory(conversationId: string): Promise<FetchHistoryResponse> {
  const response = await apiClient.post<{ success: boolean; data: FetchHistoryResponse }>(
    `/conversations/${conversationId}/fetch-history`
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
  quotedMessageId?: string;
}): Promise<Message> {
  const response = await apiClient.post<{ success: boolean; data: Message }>('/messages', data);
  return response.data.data;
}

export async function deleteMessage(messageId: string): Promise<void> {
  await apiClient.delete(`/messages/${messageId}`);
}

export interface ReactToMessageResponse {
  messageId: string;
  emoji: string;
  reactions: MessageReaction[];
}

export async function reactToMessage(messageId: string, emoji: string): Promise<ReactToMessageResponse> {
  const response = await apiClient.post<{ success: boolean; data: ReactToMessageResponse }>(
    `/messages/${messageId}/react`,
    { emoji }
  );
  return response.data.data;
}

// Message forwarding

export interface ForwardMessageResponse {
  messageId: string;
  externalId: string;
  status: string;
  targetConversationId: string;
}

export async function forwardMessage(messageId: string, targetConversationId: string): Promise<ForwardMessageResponse> {
  const response = await apiClient.post<{ success: boolean; data: ForwardMessageResponse }>(
    `/messages/${messageId}/forward`,
    { targetConversationId }
  );
  return response.data.data;
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

// Pin/Unpin conversations

export async function pinConversation(conversationId: string): Promise<Conversation> {
  const response = await apiClient.put<{ success: boolean; data: Conversation }>(
    `/conversations/${conversationId}/pin`
  );
  return response.data.data;
}

export async function unpinConversation(conversationId: string): Promise<Conversation> {
  const response = await apiClient.delete<{ success: boolean; data: Conversation }>(
    `/conversations/${conversationId}/pin`
  );
  return response.data.data;
}

// Conversation Tags

export async function getConversationTags(conversationId: string): Promise<Tag[]> {
  const response = await apiClient.get<{ success: boolean; data: Tag[] }>(
    `/conversations/${conversationId}/tags`
  );
  return response.data.data;
}

export async function addConversationTag(conversationId: string, tagId: string): Promise<void> {
  await apiClient.post(`/conversations/${conversationId}/tags`, { tagId });
}

export async function removeConversationTag(conversationId: string, tagId: string): Promise<void> {
  await apiClient.delete(`/conversations/${conversationId}/tags/${tagId}`);
}

// Conversation Notes

export async function getConversationNotes(conversationId: string): Promise<ConversationNote[]> {
  const response = await apiClient.get<{ success: boolean; data: ConversationNote[] }>(
    `/conversations/${conversationId}/notes`
  );
  return response.data.data;
}

export async function addConversationNote(conversationId: string, content: string): Promise<ConversationNote> {
  const response = await apiClient.post<{ success: boolean; data: ConversationNote }>(
    `/conversations/${conversationId}/notes`,
    { content }
  );
  return response.data.data;
}

export async function updateConversationNote(noteId: string, content: string): Promise<ConversationNote> {
  const response = await apiClient.patch<{ success: boolean; data: ConversationNote }>(
    `/conversations/notes/${noteId}`,
    { content }
  );
  return response.data.data;
}

export async function deleteConversationNote(noteId: string): Promise<void> {
  await apiClient.delete(`/conversations/notes/${noteId}`);
}

// Group participants

export async function getGroupParticipants(conversationId: string): Promise<GroupParticipantsResponse> {
  const response = await apiClient.get<{ success: boolean; data: GroupParticipantsResponse }>(
    `/conversations/${conversationId}/participants`
  );
  return response.data.data;
}

// Tags management

export async function listTags(): Promise<(Tag & { contactCount: number; conversationCount: number })[]> {
  const response = await apiClient.get<{ success: boolean; data: (Tag & { contactCount: number; conversationCount: number })[] }>(
    '/tags'
  );
  return response.data.data;
}

export async function createTag(data: { name: string; color?: string }): Promise<Tag> {
  const response = await apiClient.post<{ success: boolean; data: Tag }>('/tags', data);
  return response.data.data;
}

export async function updateTag(tagId: string, data: { name?: string; color?: string }): Promise<Tag> {
  const response = await apiClient.patch<{ success: boolean; data: Tag }>(`/tags/${tagId}`, data);
  return response.data.data;
}

export async function deleteTag(tagId: string): Promise<void> {
  await apiClient.delete(`/tags/${tagId}`);
}

// Poll, Edit, Delete message

export interface SendPollInput {
  conversationId: string;
  name: string;
  options: string[];
  selectableCount?: number;
}

export async function sendPoll(data: SendPollInput): Promise<Message> {
  const response = await apiClient.post<{ success: boolean; data: Message }>('/messages/poll', data);
  return response.data.data;
}

export async function editMessage(messageId: string, text: string): Promise<Message> {
  const response = await apiClient.patch<{ success: boolean; data: Message }>(
    `/messages/${messageId}/edit`,
    { text }
  );
  return response.data.data;
}

export async function deleteMessageForEveryone(messageId: string): Promise<void> {
  await apiClient.delete(`/messages/${messageId}/everyone`);
}
