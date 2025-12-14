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
    <div className="h-16 border-b border-pink-200/50 dark:border-purple-800/50 flex items-center justify-between px-4 bg-gradient-to-r from-white via-pink-50/30 to-lavender-50/30 dark:from-purple-950 dark:via-purple-900/30 dark:to-pink-950/30">
      <div className="flex items-center gap-3">
        {/* Toggle conversation list */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleConversationList}
          className="flex-shrink-0 hover:bg-pink-100 dark:hover:bg-purple-900/50 text-pink-600 dark:text-pink-400"
          title={conversationListCollapsed ? 'Show conversations' : 'Hide conversations'}
        >
          {conversationListCollapsed ? (
            <PanelLeft className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </Button>
        <div className="relative">
          <Avatar className="ring-2 ring-pink-200/50 dark:ring-purple-700/50">
            <AvatarImage src={conversation.contact.avatarUrl || undefined} />
            <AvatarFallback className={isGroup ? 'bg-gradient-to-br from-emerald-400 to-teal-400 text-white' : 'bg-gradient-to-br from-pink-400 to-purple-400 text-white'}>
              {isGroup ? (
                <Users className="h-5 w-5" />
              ) : (
                getContactInitials(conversation.contact)
              )}
            </AvatarFallback>
          </Avatar>
          {isGroup && (
            <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-gradient-to-br from-emerald-400 to-teal-400 text-white flex items-center justify-center shadow-sm">
              <Users className="h-2.5 w-2.5" />
            </span>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-pink-900 dark:text-pink-100">{getContactName(conversation.contact)}</p>
            {isGroup && (
              <span className="text-xs bg-gradient-to-r from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">Group</span>
            )}
          </div>
          <p className="text-sm text-pink-500 dark:text-pink-400">
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
          className="hover:bg-pink-100 dark:hover:bg-purple-900/50 text-pink-600 dark:text-pink-400 hover:text-pink-700 dark:hover:text-pink-300"
        >
          <User className="h-5 w-5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="hover:bg-pink-100 dark:hover:bg-purple-900/50 text-pink-600 dark:text-pink-400">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="dropdown-cute">
            {conversation.isPinned ? (
              <DropdownMenuItem onClick={() => onUnpin(conversation.id)} className="hover:bg-pink-100 dark:hover:bg-purple-900/50 text-pink-700 dark:text-pink-300 cursor-pointer rounded-lg">
                <PinOff className="h-4 w-4 mr-2" />
                Unpin conversation
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => onPin(conversation.id)} className="hover:bg-pink-100 dark:hover:bg-purple-900/50 text-pink-700 dark:text-pink-300 cursor-pointer rounded-lg">
                <Pin className="h-4 w-4 mr-2" />
                Pin conversation
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="bg-pink-200/50 dark:bg-purple-800/50" />
            {conversation.status === 'CLOSED' ? (
              <DropdownMenuItem onClick={() => onReopen(conversation.id)} className="hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 cursor-pointer rounded-lg">
                Reopen conversation
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => onClose(conversation.id)} className="hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-600 dark:text-amber-400 cursor-pointer rounded-lg">
                Close conversation
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="bg-pink-200/50 dark:bg-purple-800/50" />
            <DropdownMenuItem className="hover:bg-pink-100 dark:hover:bg-purple-900/50 text-pink-700 dark:text-pink-300 cursor-pointer rounded-lg">Assign to...</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
});
