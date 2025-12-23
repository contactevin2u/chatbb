'use client';

import { memo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  Users,
  MessageSquare,
  Check,
  Pin,
  PinOff,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils/cn';
import {
  getContactName,
  getContactInitials,
  isGroupContact,
  getMessagePreview,
} from '@/lib/utils/message-helpers';
import { TagDropdown } from '@/components/tag-dropdown';
import type { Conversation } from '@/lib/api/conversations';

export interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  isLoading: boolean;
  onSelect: (id: string) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onClose: (id: string) => void;
}

function ConversationListComponent({
  conversations,
  selectedId,
  isLoading,
  onSelect,
  onPin,
  onUnpin,
  onClose,
}: ConversationListProps) {
  if (isLoading) {
    return (
      <ScrollArea className="flex-1 w-full overflow-hidden">
        <div className="p-4 space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="h-10 w-10 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 bg-muted rounded" />
                <div className="h-3 w-36 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    );
  }

  if (conversations.length === 0) {
    return (
      <ScrollArea className="flex-1 w-full overflow-hidden">
        <div className="p-8 text-center text-muted-foreground">
          <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No conversations found</p>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="flex-1 w-full max-w-full overflow-hidden">
      <div className="divide-y w-full max-w-full overflow-hidden">
        {conversations.map((conversation) => (
          <div
            key={conversation.id}
            className={cn(
              'group/conv relative p-3 sm:p-4 cursor-pointer hover:bg-muted/50 transition-colors active:bg-muted overflow-hidden w-full box-border',
              selectedId === conversation.id && 'bg-muted'
            )}
            onClick={() => onSelect(conversation.id)}
          >
            {/* Quick actions */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden md:flex gap-1 opacity-0 group-hover/conv:opacity-100 transition-opacity z-10">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 bg-background/80 hover:bg-background shadow-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  if (conversation.isPinned) {
                    onUnpin(conversation.id);
                  } else {
                    onPin(conversation.id);
                  }
                }}
                title={conversation.isPinned ? 'Unpin' : 'Pin'}
              >
                {conversation.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              </Button>
              {conversation.status !== 'CLOSED' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 bg-background/80 hover:bg-background shadow-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(conversation.id);
                  }}
                  title="Close conversation"
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            <div className="flex items-start gap-2.5 sm:gap-3 group min-w-0 w-full">
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <Avatar className="h-10 w-10 sm:h-10 sm:w-10">
                  <AvatarImage
                    src={conversation.contact.avatarUrl || undefined}
                    className="object-cover"
                  />
                  <AvatarFallback className="text-sm">
                    {isGroupContact(conversation.contact) ? (
                      <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                    ) : (
                      getContactInitials(conversation.contact)
                    )}
                  </AvatarFallback>
                </Avatar>
                {conversation.unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-green-500 text-white text-[10px] sm:text-xs flex items-center justify-center font-bold shadow-sm">
                    {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
                  </span>
                )}
                {isGroupContact(conversation.contact) && (
                  <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full bg-green-500 text-white flex items-center justify-center">
                    <Users className="h-2 w-2 sm:h-2.5 sm:w-2.5" />
                  </span>
                )}
              </div>

              {/* Tag dropdown */}
              <div className="hidden sm:block">
                <TagDropdown
                  conversationId={conversation.id}
                  currentTags={conversation.tags || []}
                />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 overflow-hidden">
                <div className="flex items-center gap-2 w-full">
                  <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 flex-1">
                    {conversation.isPinned && (
                      <Pin className="h-3 w-3 text-primary flex-shrink-0" />
                    )}
                    <p className="font-medium truncate text-sm sm:text-base">
                      {getContactName(conversation.contact)}
                    </p>
                  </div>
                  <span className="text-[10px] sm:text-xs text-muted-foreground flex-shrink-0 whitespace-nowrap ml-auto">
                    {conversation.lastMessageAt
                      ? formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: false })
                      : ''}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground truncate mt-0.5">
                  {getMessagePreview(conversation.lastMessage)}
                </p>
                <div className="flex items-center gap-1.5 sm:gap-2 mt-1 flex-wrap">
                  <span className="text-[10px] sm:text-xs text-muted-foreground">
                    {conversation.channel.name}
                  </span>
                  {conversation.tags && conversation.tags.length > 0 && (
                    <>
                      {conversation.tags.slice(0, 1).map((tagRelation) => tagRelation.tag && (
                        <span
                          key={tagRelation.tag.id}
                          className="px-1 sm:px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-medium"
                          style={{
                            backgroundColor: `${tagRelation.tag.color || '#6b7280'}20`,
                            color: tagRelation.tag.color || '#6b7280',
                          }}
                        >
                          {tagRelation.tag.name}
                        </span>
                      ))}
                      {conversation.tags.length > 1 && (
                        <span className="text-[9px] sm:text-[10px] text-muted-foreground">
                          +{conversation.tags.length - 1}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

export const ConversationList = memo(ConversationListComponent);
