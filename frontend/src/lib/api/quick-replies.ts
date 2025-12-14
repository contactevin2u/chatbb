/**
 * Quick Reply API functions
 */

import { apiClient } from './client';

export interface QuickReplyContent {
  text: string;
  media?: {
    type: 'image' | 'video' | 'audio' | 'document';
    url: string;
    filename?: string;
    mimetype?: string;
  };
}

export interface QuickReply {
  id: string;
  organizationId: string;
  name: string;
  shortcut: string;
  content: QuickReplyContent;
  category: string | null;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateQuickReplyInput {
  name: string;
  shortcut: string;
  content: QuickReplyContent;
  category?: string;
}

export interface UpdateQuickReplyInput {
  name?: string;
  shortcut?: string;
  content?: QuickReplyContent;
  category?: string | null;
}

/**
 * List all quick replies
 */
export async function listQuickReplies(search?: string): Promise<QuickReply[]> {
  const params = new URLSearchParams();
  if (search) {
    params.append('search', search);
  }

  const response = await apiClient.get<{ success: boolean; data: QuickReply[] }>(
    `/quick-replies${params.toString() ? `?${params.toString()}` : ''}`
  );
  return response.data.data;
}

/**
 * Search quick replies by shortcut prefix (for autocomplete)
 */
export async function searchQuickReplies(prefix: string, limit = 5): Promise<QuickReply[]> {
  const params = new URLSearchParams();
  params.append('prefix', prefix);
  params.append('limit', limit.toString());

  const response = await apiClient.get<{ success: boolean; data: QuickReply[] }>(
    `/quick-replies/search?${params.toString()}`
  );
  return response.data.data;
}

/**
 * Get quick reply by ID
 */
export async function getQuickReply(id: string): Promise<QuickReply> {
  const response = await apiClient.get<{ success: boolean; data: QuickReply }>(
    `/quick-replies/${id}`
  );
  return response.data.data;
}

/**
 * Get quick reply by shortcut
 */
export async function getQuickReplyByShortcut(shortcut: string): Promise<QuickReply | null> {
  try {
    const response = await apiClient.get<{ success: boolean; data: QuickReply }>(
      `/quick-replies/shortcut/${shortcut}`
    );
    return response.data.data;
  } catch (error: any) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Create a new quick reply
 */
export async function createQuickReply(input: CreateQuickReplyInput): Promise<QuickReply> {
  const response = await apiClient.post<{ success: boolean; data: QuickReply }>(
    '/quick-replies',
    input
  );
  return response.data.data;
}

/**
 * Update a quick reply
 */
export async function updateQuickReply(
  id: string,
  input: UpdateQuickReplyInput
): Promise<QuickReply> {
  const response = await apiClient.patch<{ success: boolean; data: QuickReply }>(
    `/quick-replies/${id}`,
    input
  );
  return response.data.data;
}

/**
 * Delete a quick reply
 */
export async function deleteQuickReply(id: string): Promise<void> {
  await apiClient.delete(`/quick-replies/${id}`);
}

/**
 * Track usage of a quick reply
 */
export async function trackQuickReplyUsage(id: string): Promise<void> {
  await apiClient.post(`/quick-replies/${id}/use`);
}

/**
 * Get all categories
 */
export async function getQuickReplyCategories(): Promise<string[]> {
  const response = await apiClient.get<{ success: boolean; data: string[] }>(
    '/quick-replies/categories'
  );
  return response.data.data;
}
