/**
 * Message Sequence API functions
 */

import { apiClient } from './client';

export type SequenceStepType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'DELAY';
export type SequenceStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

export interface SequenceStepContent {
  text?: string;
  mediaUrl?: string;
  mediaFilename?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  delayMinutes?: number;
  delaySeconds?: number;
}

export interface SequenceStep {
  id: string;
  sequenceId: string;
  order: number;
  type: SequenceStepType;
  content: SequenceStepContent;
  createdAt: string;
  updatedAt: string;
}

export interface MessageSequence {
  id: string;
  organizationId: string;
  name: string;
  shortcut: string | null;
  description: string | null;
  status: SequenceStatus;
  triggerType: string;
  triggerConfig: any;
  usageCount: number;
  steps: SequenceStep[];
  _count?: {
    executions: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface SequenceExecution {
  id: string;
  sequenceId: string;
  conversationId: string;
  currentStep: number;
  status: 'scheduled' | 'running' | 'completed' | 'stopped' | 'failed';
  scheduledAt: string | null;  // When sequence is scheduled to START (null = immediate)
  startedAt: string;
  completedAt: string | null;
  nextStepAt: string | null;
  errorMessage: string | null;
  sequence: {
    id: string;
    name: string;
  };
}

export interface CreateSequenceInput {
  name: string;
  shortcut?: string;
  description?: string;
  triggerType?: string;
  triggerConfig?: any;
  steps?: {
    order: number;
    type: SequenceStepType;
    content: SequenceStepContent;
  }[];
}

export interface UpdateSequenceInput {
  name?: string;
  shortcut?: string | null;
  description?: string;
  status?: SequenceStatus;
  triggerType?: string;
  triggerConfig?: any;
}

/**
 * List all sequences
 */
export async function listSequences(status?: SequenceStatus): Promise<MessageSequence[]> {
  const params = new URLSearchParams();
  if (status) {
    params.append('status', status);
  }

  const response = await apiClient.get<{ success: boolean; data: MessageSequence[] }>(
    `/sequences${params.toString() ? `?${params.toString()}` : ''}`
  );
  return response.data.data;
}

/**
 * Search sequences by shortcut prefix (for slash-command autocomplete)
 */
export async function searchSequences(prefix: string, limit = 5): Promise<MessageSequence[]> {
  const params = new URLSearchParams();
  params.append('prefix', prefix);
  params.append('limit', limit.toString());

  const response = await apiClient.get<{ success: boolean; data: MessageSequence[] }>(
    `/sequences/search?${params.toString()}`
  );
  return response.data.data;
}

/**
 * Get sequence by ID
 */
export async function getSequence(id: string): Promise<MessageSequence> {
  const response = await apiClient.get<{ success: boolean; data: MessageSequence }>(
    `/sequences/${id}`
  );
  return response.data.data;
}

/**
 * Create a new sequence
 */
export async function createSequence(input: CreateSequenceInput): Promise<MessageSequence> {
  const response = await apiClient.post<{ success: boolean; data: MessageSequence }>(
    '/sequences',
    input
  );
  return response.data.data;
}

/**
 * Update a sequence
 */
export async function updateSequence(
  id: string,
  input: UpdateSequenceInput
): Promise<MessageSequence> {
  const response = await apiClient.patch<{ success: boolean; data: MessageSequence }>(
    `/sequences/${id}`,
    input
  );
  return response.data.data;
}

/**
 * Delete a sequence
 */
export async function deleteSequence(id: string): Promise<void> {
  await apiClient.delete(`/sequences/${id}`);
}

/**
 * Add step to sequence
 */
export async function addSequenceStep(
  sequenceId: string,
  step: { order: number; type: SequenceStepType; content: SequenceStepContent }
): Promise<SequenceStep> {
  const response = await apiClient.post<{ success: boolean; data: SequenceStep }>(
    `/sequences/${sequenceId}/steps`,
    step
  );
  return response.data.data;
}

/**
 * Update a step
 */
export async function updateSequenceStep(
  stepId: string,
  input: Partial<{ order: number; type: SequenceStepType; content: SequenceStepContent }>
): Promise<SequenceStep> {
  const response = await apiClient.patch<{ success: boolean; data: SequenceStep }>(
    `/sequences/steps/${stepId}`,
    input
  );
  return response.data.data;
}

/**
 * Delete a step
 */
export async function deleteSequenceStep(stepId: string): Promise<void> {
  await apiClient.delete(`/sequences/steps/${stepId}`);
}

/**
 * Reorder steps
 */
export async function reorderSequenceSteps(
  sequenceId: string,
  stepIds: string[]
): Promise<MessageSequence> {
  const response = await apiClient.put<{ success: boolean; data: MessageSequence }>(
    `/sequences/${sequenceId}/reorder`,
    { stepIds }
  );
  return response.data.data;
}

/**
 * Start sequence execution
 *
 * @param sequenceId - The sequence to execute
 * @param conversationId - The conversation to execute the sequence on
 * @param scheduledAt - Optional ISO date string for when to START the sequence
 *                      If provided and in future, sequence will be scheduled (not executed immediately)
 *                      The sequence will start at the scheduled time, then run through all steps
 *                      (including any DELAY steps which work normally once execution starts)
 */
export async function startSequenceExecution(
  sequenceId: string,
  conversationId: string,
  scheduledAt?: Date
): Promise<SequenceExecution> {
  const response = await apiClient.post<{ success: boolean; data: SequenceExecution }>(
    `/sequences/${sequenceId}/execute`,
    {
      conversationId,
      scheduledAt: scheduledAt?.toISOString(),
    }
  );
  return response.data.data;
}

/**
 * Stop sequence execution
 */
export async function stopSequenceExecution(executionId: string): Promise<void> {
  await apiClient.post(`/sequences/executions/${executionId}/stop`);
}

/**
 * Get sequence executions for a conversation
 */
export async function getConversationSequences(
  conversationId: string
): Promise<SequenceExecution[]> {
  const response = await apiClient.get<{ success: boolean; data: SequenceExecution[] }>(
    `/conversations/${conversationId}/sequences`
  );
  return response.data.data;
}
