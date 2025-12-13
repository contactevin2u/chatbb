/**
 * Contacts API
 *
 * API functions for contact management
 */

import { apiClient } from './client';

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Contact {
  id: string;
  identifier: string;
  channelType: 'WHATSAPP' | 'INSTAGRAM' | 'TIKTOK';
  displayName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatarUrl?: string;
  metadata?: Record<string, any>;
  tags: Tag[];
  conversationCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListContactsParams {
  search?: string;
  channelType?: 'WHATSAPP' | 'INSTAGRAM' | 'TIKTOK';
  tagIds?: string[];
  limit?: number;
  offset?: number;
  sortBy?: 'displayName' | 'identifier' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface ListContactsResponse {
  contacts: Contact[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateContactInput {
  identifier: string;
  channelType: 'WHATSAPP' | 'INSTAGRAM' | 'TIKTOK';
  displayName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

export interface UpdateContactInput {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

// List contacts
export async function listContacts(params: ListContactsParams = {}): Promise<ListContactsResponse> {
  const searchParams = new URLSearchParams();

  if (params.search) searchParams.set('search', params.search);
  if (params.channelType) searchParams.set('channelType', params.channelType);
  if (params.tagIds?.length) searchParams.set('tagIds', params.tagIds.join(','));
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.offset) searchParams.set('offset', params.offset.toString());
  if (params.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);

  const response = await apiClient.get<{ success: boolean; data: ListContactsResponse }>(
    `/contacts?${searchParams.toString()}`
  );
  return response.data.data;
}

// Get single contact
export async function getContact(contactId: string): Promise<Contact> {
  const response = await apiClient.get<{ success: boolean; data: Contact }>(
    `/contacts/${contactId}`
  );
  return response.data.data;
}

// Create contact
export async function createContact(input: CreateContactInput): Promise<Contact> {
  const response = await apiClient.post<{ success: boolean; data: Contact }>(
    '/contacts',
    input
  );
  return response.data.data;
}

// Update contact
export async function updateContact(contactId: string, input: UpdateContactInput): Promise<Contact> {
  const response = await apiClient.patch<{ success: boolean; data: Contact }>(
    `/contacts/${contactId}`,
    input
  );
  return response.data.data;
}

// Delete contact
export async function deleteContact(contactId: string): Promise<void> {
  await apiClient.delete(`/contacts/${contactId}`);
}

// Add tag to contact
export async function addTagToContact(contactId: string, tagId: string): Promise<Contact> {
  const response = await apiClient.post<{ success: boolean; data: Contact }>(
    `/contacts/${contactId}/tags`,
    { tagId }
  );
  return response.data.data;
}

// Remove tag from contact
export async function removeTagFromContact(contactId: string, tagId: string): Promise<Contact> {
  const response = await apiClient.delete<{ success: boolean; data: Contact }>(
    `/contacts/${contactId}/tags/${tagId}`
  );
  return response.data.data;
}

// Get display name helper
export function getContactDisplayName(contact: Contact | { identifier: string; displayName?: string; firstName?: string; lastName?: string }): string {
  if (contact.displayName) return contact.displayName;
  if (contact.firstName || contact.lastName) {
    return `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
  }
  return contact.identifier;
}
