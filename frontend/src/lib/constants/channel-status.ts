/**
 * Channel Status Configuration
 * Shared status display config for WhatsApp channels
 */

import { Wifi, WifiOff, AlertCircle, RefreshCw, LucideIcon } from 'lucide-react';

export type ChannelStatusType = 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'ERROR' | 'BANNED';

export interface StatusConfig {
  label: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
}

export const channelStatusConfig: Record<ChannelStatusType, StatusConfig> = {
  CONNECTED: {
    label: 'Connected',
    icon: Wifi,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  DISCONNECTED: {
    label: 'Disconnected',
    icon: WifiOff,
    color: 'text-gray-500',
    bgColor: 'bg-gray-500/10',
  },
  CONNECTING: {
    label: 'Connecting',
    icon: RefreshCw,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
  },
  ERROR: {
    label: 'Error',
    icon: AlertCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  BANNED: {
    label: 'Banned',
    icon: AlertCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
};

export function getChannelStatus(status: string | undefined): StatusConfig {
  return channelStatusConfig[status as ChannelStatusType] || channelStatusConfig.DISCONNECTED;
}
