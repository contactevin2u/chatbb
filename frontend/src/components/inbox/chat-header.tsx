'use client';

import { memo } from 'react';
import { Users, User, MoreVertical, Pin, PinOff, PanelLeftClose, PanelLeft } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils/cn';

export interface ChatHeaderContact {
  id: string;
  identifier: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
}

export interface ChatHeaderConversation {
  id: string;
  status: string;
  isPinned: boolean;
  contact: ChatHeaderContact;
}

interface ChatHeaderProps {
  conversation: ChatHeaderConversation;
  conversationListCollapsed: boolean;
  showContactPanel: boolean;
  onToggleConversationList: () => void;
  onToggleContactPanel: () => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onClose: (id: string) => void;
  onReopen: (id: string) => void;
}

function isGroupContact(identifier: string): boolean {
  return identifier.includes('-');
}

function getContactName(contact: ChatHeaderContact): string {
  if (contact.displayName) return contact.displayName;
  if (contact.firstName || contact.lastName) {
    return `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
  }
  return contact.identifier;
}

function getContactInitials(contact: ChatHeaderContact): string {
  const name = getContactName(contact);
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export const ChatHeader = memo(function ChatHeader({
  conversation,
  conversationListCollapsed,
  showContactPanel,
  onToggleConversationList,
  onToggleContactPanel,
  onPin,
  onUnpin,
  onClose,
  onReopen,
}: ChatHeaderProps) {
  const isGroup = isGroupContact(conversation.contact.identifier);

  return (
    <div className="h-16 border-b flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        {/* Toggle conversation list */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleConversationList}
          className="flex-shrink-0"
          title={conversationListCollapsed ? 'Show conversations' : 'Hide conversations'}
        >
          {conversationListCollapsed ? (
            <PanelLeft className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </Button>
        <div className="relative">
          <Avatar>
            <AvatarImage src={conversation.contact.avatarUrl || undefined} />
            <AvatarFallback>
              {isGroup ? (
                <Users className="h-5 w-5" />
              ) : (
                getContactInitials(conversation.contact)
              )}
            </AvatarFallback>
          </Avatar>
          {isGroup && (
            <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-green-500 text-white flex items-center justify-center">
              <Users className="h-2.5 w-2.5" />
            </span>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">{getContactName(conversation.contact)}</p>
            {isGroup && (
              <span className="text-xs bg-green-500/10 text-green-600 px-1.5 py-0.5 rounded">Group</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {isGroup
              ? `Group ID: ${conversation.contact.identifier}`
              : `+${conversation.contact.identifier}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleContactPanel}
        >
          <User className="h-5 w-5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {conversation.isPinned ? (
              <DropdownMenuItem onClick={() => onUnpin(conversation.id)}>
                <PinOff className="h-4 w-4 mr-2" />
                Unpin conversation
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => onPin(conversation.id)}>
                <Pin className="h-4 w-4 mr-2" />
                Pin conversation
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {conversation.status === 'CLOSED' ? (
              <DropdownMenuItem onClick={() => onReopen(conversation.id)}>
                Reopen conversation
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => onClose(conversation.id)}>
                Close conversation
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem>Assign to...</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
});
