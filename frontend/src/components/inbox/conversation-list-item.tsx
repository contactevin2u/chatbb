'use client';

import { memo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Users, Pin, Check, CheckCheck, Clock } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';

export interface ConversationContact {
  id: string;
  identifier: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  isGroup: boolean;
}

export interface ConversationLastMessage {
  content: any;
  type: string;
  direction: 'INBOUND' | 'OUTBOUND';
  status: string;
  createdAt: string;
}

export interface ConversationData {
  id: string;
  status: string;
  priority: string;
  unreadCount: number;
  lastMessageAt: string | null;
  isPinned: boolean;
  contact: ConversationContact;
  channel: {
    name: string;
  };
  lastMessage?: ConversationLastMessage | null;
}

interface ConversationListItemProps {
  conversation: ConversationData;
  isSelected: boolean;
  onClick: (id: string) => void;
}

function getContactName(contact: ConversationContact): string {
  if (contact.displayName) return contact.displayName;
  if (contact.firstName) {
    return contact.lastName
      ? `${contact.firstName} ${contact.lastName}`
      : contact.firstName;
  }
  return contact.identifier;
}

function getContactInitials(contact: ConversationContact): string {
  const name = getContactName(contact);
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getLastMessagePreview(lastMessage: ConversationLastMessage | null | undefined): string {
  if (!lastMessage) return 'No messages yet';

  const prefix = lastMessage.direction === 'OUTBOUND' ? 'You: ' : '';

  switch (lastMessage.type) {
    case 'TEXT':
      return prefix + (lastMessage.content?.text || '');
    case 'IMAGE':
      return prefix + '📷 Image';
    case 'VIDEO':
      return prefix + '🎥 Video';
    case 'AUDIO':
      return prefix + '🎵 Audio';
    case 'DOCUMENT':
      return prefix + '📄 Document';
    case 'STICKER':
      return prefix + '🏷️ Sticker';
    case 'LOCATION':
      return prefix + '📍 Location';
    case 'CONTACT':
      return prefix + '👤 Contact';
    default:
      return prefix + 'Message';
  }
}

function getStatusIcon(status: string, direction: string) {
  if (direction !== 'OUTBOUND') return null;

  switch (status) {
    case 'PENDING':
      return <Clock className="h-3 w-3 text-muted-foreground" />;
    case 'SENT':
      return <Check className="h-3 w-3 text-muted-foreground" />;
    case 'DELIVERED':
      return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    case 'READ':
      return <CheckCheck className="h-3 w-3 text-blue-500" />;
    default:
      return null;
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'OPEN':
      return 'bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.3)]';
    case 'PENDING':
      return 'bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.3)]';
    case 'RESOLVED':
      return 'bg-sky-400 shadow-[0_0_0_3px_rgba(56,189,248,0.3)]';
    case 'CLOSED':
      return 'bg-pink-300 shadow-[0_0_0_3px_rgba(244,114,182,0.2)]';
    default:
      return 'bg-pink-300';
  }
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'URGENT':
      return 'text-destructive';
    case 'HIGH':
      return 'text-orange-500';
    default:
      return '';
  }
}

export const ConversationListItem = memo(function ConversationListItem({
  conversation,
  isSelected,
  onClick,
}: ConversationListItemProps) {
  const isGroup = conversation.contact.isGroup;

  return (
    <button
      className={cn(
        'w-full flex items-start gap-3 p-3 hover:bg-hotpink-50 dark:hover:bg-purple-900/40 transition-all duration-200 text-left rounded-xl mx-1 my-0.5',
        isSelected && 'bg-gradient-to-r from-hotpink-100/80 to-lavender-100/80 dark:from-purple-900/60 dark:to-hotpink-900/40 shadow-[0_2px_10px_rgba(255,26,133,0.1)] border-l-3 border-l-hotpink-500',
        conversation.isPinned && !isSelected && 'border-l-3 border-l-hotpink-400'
      )}
      onClick={() => onClick(conversation.id)}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <Avatar className="ring-2 ring-hotpink-200/40 dark:ring-purple-600/50 transition-all duration-200 hover:ring-hotpink-300">
          <AvatarImage src={conversation.contact.avatarUrl || undefined} />
          <AvatarFallback className={isGroup ? 'bg-gradient-to-br from-emerald-400 to-teal-400 text-white' : 'bg-gradient-to-br from-hotpink-400 to-purple-500 text-white'}>
            {isGroup ? <Users className="h-4 w-4" /> : getContactInitials(conversation.contact)}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-purple-900',
            getStatusColor(conversation.status)
          )}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={cn(
                'font-medium truncate',
                conversation.unreadCount > 0 && 'font-semibold',
                getPriorityColor(conversation.priority)
              )}
            >
              {getContactName(conversation.contact)}
            </span>
            {isGroup && (
              <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                Group
              </Badge>
            )}
            {conversation.isPinned && (
              <Pin className="h-3 w-3 text-primary flex-shrink-0" />
            )}
          </div>
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {conversation.lastMessageAt
              ? formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: false })
              : ''}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <div className="flex items-center gap-1 min-w-0">
            {conversation.lastMessage &&
              getStatusIcon(conversation.lastMessage.status, conversation.lastMessage.direction)}
            <p className="text-sm text-muted-foreground truncate">
              {getLastMessagePreview(conversation.lastMessage)}
            </p>
          </div>
          {conversation.unreadCount > 0 && (
            <Badge className="h-5 min-w-[20px] flex items-center justify-center text-[10px] font-medium">
              {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{conversation.channel.name}</p>
      </div>
    </button>
  );
});
