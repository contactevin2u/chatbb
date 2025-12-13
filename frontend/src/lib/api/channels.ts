/**
 * Channels API
 *
 * API functions for channel management
 */

import { apiClient } from './client';

export interface Channel {
  id: string;
  organizationId: string;
  type: 'WHATSAPP' | 'TIKTOK' | 'INSTAGRAM' | 'TELEGRAM' | 'EMAIL';
  name: string;
  identifier: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'ERROR' | 'BANNED';
  config: Record<string, unknown>;
  lastConnectedAt: string | null;
  createdAt: string;
  updatedAt: string;
  liveStatus?: string;
}

export interface ChannelStatus {
  channelId: string;
  status: string;
  identifier: string;
  lastConnectedAt: string | null;
  hasAuthState: boolean;
  qrCode?: string;
}

export interface CreateChannelInput {
  name: string;
}

export interface SendMessageInput {
  to: string;
  text?: string;
  media?: {
    type: 'image' | 'video' | 'audio' | 'document';
    url?: string;
    mimetype?: string;
    filename?: string;
    caption?: string;
  };
}

// WhatsApp Channels

export async function listWhatsAppChannels(): Promise<Channel[]> {
  const response = await apiClient.get<{ success: boolean; data: Channel[] }>('/channels/whatsapp');
  return response.data.data;
}

export async function createWhatsAppChannel(input: CreateChannelInput): Promise<Channel> {
  const response = await apiClient.post<{ success: boolean; data: Channel }>('/channels/whatsapp', input);
  return response.data.data;
}

export async function getWhatsAppChannelStatus(channelId: string): Promise<ChannelStatus> {
  const response = await apiClient.get<{ success: boolean; data: ChannelStatus }>(
    `/channels/whatsapp/${channelId}`
  );
  return response.data.data;
}

export async function connectWhatsAppChannel(channelId: string): Promise<{
  channelId: string;
  status: string;
  qrCode?: string;
}> {
  const response = await apiClient.post<{
    success: boolean;
    data: { channelId: string; status: string; qrCode?: string };
  }>(`/channels/whatsapp/${channelId}/connect`);
  return response.data.data;
}

export async function requestPairingCode(channelId: string, phoneNumber: string): Promise<{
  channelId: string;
  pairingCode: string;
}> {
  const response = await apiClient.post<{
    success: boolean;
    data: { channelId: string; pairingCode: string };
  }>(`/channels/whatsapp/${channelId}/pairing-code`, { phoneNumber });
  return response.data.data;
}

export async function disconnectWhatsAppChannel(channelId: string): Promise<{
  channelId: string;
  status: string;
}> {
  const response = await apiClient.post<{
    success: boolean;
    data: { channelId: string; status: string };
  }>(`/channels/whatsapp/${channelId}/disconnect`);
  return response.data.data;
}

export async function deleteWhatsAppChannel(channelId: string): Promise<void> {
  await apiClient.delete(`/channels/whatsapp/${channelId}`);
}

export async function sendWhatsAppMessage(channelId: string, input: SendMessageInput): Promise<{
  messageId: string;
  externalId: string;
  status: string;
}> {
  const response = await apiClient.post<{
    success: boolean;
    data: { messageId: string; externalId: string; status: string };
  }>(`/channels/whatsapp/${channelId}/messages`, input);
  return response.data.data;
}

// Generic Channels

export async function listChannels(): Promise<Channel[]> {
  const response = await apiClient.get<{ success: boolean; data: Channel[] }>('/channels');
  return response.data.data;
}
