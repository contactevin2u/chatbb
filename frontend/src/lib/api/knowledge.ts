/**
 * Knowledge Bank API functions
 */

import { apiClient } from './client';

export type KnowledgeType = 'FAQ' | 'PRODUCT' | 'POLICY' | 'GENERAL';

export interface KnowledgeItem {
  id: string;
  organizationId: string;
  type: KnowledgeType;
  title: string;
  content: string;
  keywords: string[];
  category: string | null;
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateKnowledgeInput {
  type: KnowledgeType;
  title: string;
  content: string;
  keywords?: string[];
  category?: string;
  priority?: number;
}

export interface UpdateKnowledgeInput {
  type?: KnowledgeType;
  title?: string;
  content?: string;
  keywords?: string[];
  category?: string;
  priority?: number;
  isActive?: boolean;
}

export interface KnowledgeStats {
  total: number;
  active: number;
  byType: Record<string, number>;
}

/**
 * List all knowledge items
 */
export async function listKnowledge(options?: {
  type?: KnowledgeType;
  category?: string;
  search?: string;
  activeOnly?: boolean;
}): Promise<KnowledgeItem[]> {
  const params = new URLSearchParams();
  if (options?.type) params.append('type', options.type);
  if (options?.category) params.append('category', options.category);
  if (options?.search) params.append('search', options.search);
  if (options?.activeOnly) params.append('activeOnly', 'true');

  const response = await apiClient.get<{ success: boolean; data: KnowledgeItem[] }>(
    `/knowledge?${params.toString()}`
  );
  return response.data.data;
}

/**
 * Get a single knowledge item
 */
export async function getKnowledge(id: string): Promise<KnowledgeItem> {
  const response = await apiClient.get<{ success: boolean; data: KnowledgeItem }>(
    `/knowledge/${id}`
  );
  return response.data.data;
}

/**
 * Create a new knowledge item
 */
export async function createKnowledge(input: CreateKnowledgeInput): Promise<KnowledgeItem> {
  const response = await apiClient.post<{ success: boolean; data: KnowledgeItem }>(
    '/knowledge',
    input
  );
  return response.data.data;
}

/**
 * Update a knowledge item
 */
export async function updateKnowledge(
  id: string,
  input: UpdateKnowledgeInput
): Promise<KnowledgeItem> {
  const response = await apiClient.patch<{ success: boolean; data: KnowledgeItem }>(
    `/knowledge/${id}`,
    input
  );
  return response.data.data;
}

/**
 * Delete a knowledge item
 */
export async function deleteKnowledge(id: string): Promise<void> {
  await apiClient.delete(`/knowledge/${id}`);
}

/**
 * Get categories
 */
export async function getCategories(): Promise<string[]> {
  const response = await apiClient.get<{ success: boolean; data: string[] }>(
    '/knowledge/categories'
  );
  return response.data.data;
}

/**
 * Get statistics
 */
export async function getKnowledgeStats(): Promise<KnowledgeStats> {
  const response = await apiClient.get<{ success: boolean; data: KnowledgeStats }>(
    '/knowledge/stats'
  );
  return response.data.data;
}

/**
 * Search knowledge (for testing)
 */
export async function searchKnowledge(
  query: string,
  limit?: number
): Promise<KnowledgeItem[]> {
  const response = await apiClient.post<{ success: boolean; data: KnowledgeItem[] }>(
    '/knowledge/search',
    { query, limit }
  );
  return response.data.data;
}
