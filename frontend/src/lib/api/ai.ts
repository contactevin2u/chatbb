/**
 * AI Configuration API functions
 */

import { apiClient } from './client';

export interface AIConfig {
  id: string;
  organizationId: string;
  openaiApiKey: string | null; // Masked, e.g., "sk-...xxxx"
  model: string;
  isEnabled: boolean;
  replyToAll: boolean;
  responseDelayMs: number;
  businessHoursOnly: boolean;
  businessStart: string | null;
  businessEnd: string | null;
  offHoursMessage: string | null;
  handoffKeywords: string[];
  handoffMessage: string | null;
  systemPrompt: string | null;
  companyName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateAIConfigInput {
  openaiApiKey?: string;
  model?: string;
  isEnabled?: boolean;
  replyToAll?: boolean;
  responseDelayMs?: number;
  businessHoursOnly?: boolean;
  businessStart?: string;
  businessEnd?: string;
  offHoursMessage?: string;
  handoffKeywords?: string[];
  handoffMessage?: string;
  systemPrompt?: string;
  companyName?: string;
}

export interface AIStatus {
  configured: boolean;
  enabled: boolean;
  withinBusinessHours: boolean;
  model?: string;
  replyToAll?: boolean;
}

export interface AITestResult {
  response: string | null;
  sources: string[];
  knowledgeFound: number;
}

/**
 * Get AI configuration
 */
export async function getAIConfig(): Promise<AIConfig | null> {
  const response = await apiClient.get<{ success: boolean; data: AIConfig | null }>(
    '/ai/config'
  );
  return response.data.data;
}

/**
 * Update AI configuration
 */
export async function updateAIConfig(input: UpdateAIConfigInput): Promise<AIConfig> {
  const response = await apiClient.patch<{ success: boolean; data: AIConfig }>(
    '/ai/config',
    input
  );
  return response.data.data;
}

/**
 * Test AI response
 */
export async function testAIResponse(message: string): Promise<AITestResult> {
  const response = await apiClient.post<{ success: boolean; data: AITestResult }>(
    '/ai/test',
    { message }
  );
  return response.data.data;
}

/**
 * Get AI status
 */
export async function getAIStatus(): Promise<AIStatus> {
  const response = await apiClient.get<{ success: boolean; data: AIStatus }>(
    '/ai/status'
  );
  return response.data.data;
}
