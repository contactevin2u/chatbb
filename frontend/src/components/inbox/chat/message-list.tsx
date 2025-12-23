'use client';

import { memo, useRef, useCallback } from 'react';
import { isSameDay } from 'date-fns';
import {
  MoreVertical,
  Reply,
  Smile,
  Download,
  Play,
  Mic,
  Trash2,
  Edit,
  Wand2,
  Image as ImageIcon,
  FileText,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils/cn';
import { formatWhatsAppText } from '@/lib/utils/whatsapp-formatting';
import {
  MessageStatusIcon,
  getContactInitials,
  isGroupContact,
  formatDateHeader,
  getDocumentIcon,
  getMessageText,
  getRawMediaType,
  isMessageRenderable,
  downloadFile,
} from '@/lib/utils/message-helpers';
import type { Conversation, Message, MessageReaction } from '@/lib/api/conversations';

export interface MessageListProps {
  messages: Message[];
  selectedConversation: Conversation;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit: (message: { id: string; text: string }) => void;
  onDelete: (message: { id: string; forEveryone: boolean }) => void;
  onParseOrder: (text: string) => void;
  onMediaPreview: (media: { url: string; type: 'image' | 'video'; filename?: string }) => void;
  typingUsers: Map<string, string>;
  showEmojiPicker: string | null;
  setShowEmojiPicker: (id: string | null) => void;
  activeMessageMenu: string | null;
  setActiveMessageMenu: (id: string | null) => void;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function MessageListComponent({
  messages,
  selectedConversation,
  isLoading,
  isLoadingMore,
  hasMore,
  onLoadMore,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onParseOrder,
  onMediaPreview,
  typingUsers,
  showEmojiPicker,
  setShowEmojiPicker,
  activeMessageMenu,
  setActiveMessageMenu,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Load more when scrolled near top (within 100px)
    if (target.scrollTop < 100 && hasMore && !isLoadingMore && messages.length > 0) {
      onLoadMore();
    }
  }, [hasMore, isLoadingMore, messages.length, onLoadMore]);

  const filteredMessages = messages.filter(isMessageRenderable);

  if (isLoading) {
    return (
      <div className="flex-1 relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          <img src="/logo.png" alt="" className="w-24 sm:w-32 h-auto opacity-[0.35]" />
        </div>
        <ScrollArea className="h-full p-2 sm:p-4 relative z-10">
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="h-8 w-8 rounded-full bg-muted" />
                <div className="space-y-2">
                  <div className="h-4 w-48 bg-muted rounded" />
                  <div className="h-3 w-24 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="flex-1 relative overflow-hidden">
      {/* Logo Watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
        <img src="/logo.png" alt="" className="w-24 sm:w-32 h-auto opacity-[0.35]" />
      </div>

      <ScrollArea
        className="h-full p-2 sm:p-4 relative z-10"
        ref={messagesContainerRef}
        onScrollCapture={handleScroll}
      >
        <div className="space-y-2 w-full overflow-x-hidden">
          {/* Loading indicator for older messages */}
          {isLoadingMore && (
            <div className="flex justify-center py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span>Loading older messages...</span>
              </div>
            </div>
          )}

          {/* Beginning of conversation indicator */}
          {!hasMore && filteredMessages.length > 0 && (
            <div className="flex justify-center py-4">
              <span className="text-xs text-muted-foreground">Beginning of conversation</span>
            </div>
          )}

          {filteredMessages.map((message, index) => {
            const messageDate = new Date(message.createdAt);
            const prevMessage = index > 0 ? filteredMessages[index - 1] : null;
            const showDateSeparator = !prevMessage || !isSameDay(messageDate, new Date(prevMessage.createdAt));

            return (
              <div key={message.id} className="w-full">
                {showDateSeparator && (
                  <div className="flex items-center justify-center my-4">
                    <div className="flex items-center gap-3 w-full max-w-xs">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-xs text-muted-foreground font-medium px-2 whitespace-nowrap">
                        {formatDateHeader(messageDate)}
                      </span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                  </div>
                )}

                <div
                  id={`message-${message.id}`}
                  className={cn(
                    'flex w-full gap-1.5 sm:gap-2 items-end transition-all duration-300',
                    message.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {/* Avatar for inbound messages */}
                  {message.direction === 'INBOUND' && (
                    <Avatar className="h-6 w-6 sm:h-7 sm:w-7 flex-shrink-0">
                      {isGroupContact(selectedConversation.contact) && message.metadata?.groupSender?.avatarUrl ? (
                        <AvatarImage src={message.metadata.groupSender.avatarUrl} className="object-cover" />
                      ) : selectedConversation.contact.avatarUrl ? (
                        <AvatarImage src={selectedConversation.contact.avatarUrl} className="object-cover" />
                      ) : null}
                      <AvatarFallback className="text-[10px] sm:text-xs">
                        {isGroupContact(selectedConversation.contact) && message.metadata?.groupSender
                          ? (message.metadata.groupSender.displayName || message.metadata.groupSender.pushName || message.metadata.groupSender.identifier || '').slice(0, 2).toUpperCase()
                          : getContactInitials(selectedConversation.contact)}
                      </AvatarFallback>
                    </Avatar>
                  )}

                  <div
                    className="group relative max-w-[85%] sm:max-w-[75%] md:max-w-[70%]"
                    onClick={() => {
                      if (window.matchMedia('(max-width: 768px)').matches) {
                        setActiveMessageMenu(activeMessageMenu === message.id ? null : message.id);
                      }
                    }}
                  >
                    {/* Message actions */}
                    <div className={cn(
                      'absolute top-0 transition-opacity flex gap-1 z-10',
                      message.direction === 'OUTBOUND' ? 'left-0 -translate-x-full pr-2' : 'right-0 translate-x-full pl-2',
                      activeMessageMenu === message.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    )}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 bg-background shadow-sm"
                        onClick={(e) => { e.stopPropagation(); onReply(message); }}
                        title="Reply"
                      >
                        <Reply className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 bg-background shadow-sm"
                        onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(showEmojiPicker === message.id ? null : message.id); }}
                        title="React"
                      >
                        <Smile className="h-4 w-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 bg-background shadow-sm"
                            title="More actions"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align={message.direction === 'OUTBOUND' ? 'end' : 'start'}>
                          {message.type === 'TEXT' && message.content.text && (
                            <DropdownMenuItem onClick={() => onParseOrder(message.content.text || '')}>
                              <Wand2 className="h-4 w-4 mr-2" />
                              Parse Order
                            </DropdownMenuItem>
                          )}
                          {message.direction === 'OUTBOUND' && message.type === 'TEXT' && message.externalId && (
                            <DropdownMenuItem onClick={() => onEdit({ id: message.id, text: message.content.text || '' })}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit message
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => onDelete({ id: message.id, forEveryone: false })}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete for me
                          </DropdownMenuItem>
                          {message.direction === 'OUTBOUND' && message.externalId && (
                            <DropdownMenuItem
                              onClick={() => onDelete({ id: message.id, forEveryone: true })}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete for everyone
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Quick reaction picker */}
                    {showEmojiPicker === message.id && (
                      <div className={cn(
                        'absolute bottom-full mb-1 bg-background border rounded-lg shadow-lg p-1 flex gap-1 z-20',
                        message.direction === 'OUTBOUND' ? 'right-0' : 'left-0'
                      )}>
                        {QUICK_REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            className="text-lg hover:bg-muted rounded p-1 transition-colors"
                            onClick={() => message.externalId && onReact(message.id, emoji)}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Message bubble */}
                    <div
                      className={cn(
                        'rounded-lg px-3 py-2 select-text',
                        message.direction === 'OUTBOUND'
                          ? 'bg-primary text-primary-foreground message-bubble-outbound'
                          : 'bg-muted message-bubble-inbound'
                      )}
                    >
                      {/* Sender name */}
                      {message.direction === 'OUTBOUND' && message.sentByUser && (
                        <p className="text-[11px] font-medium text-primary-foreground/80 mb-1">
                          {message.sentByUser.firstName} {message.sentByUser.lastName}
                        </p>
                      )}
                      {message.direction === 'INBOUND' && (
                        <p className="text-[11px] font-medium text-foreground/70 mb-1 truncate max-w-[200px]">
                          {isGroupContact(selectedConversation.contact) && message.metadata?.groupSender
                            ? message.metadata.groupSender.displayName || message.metadata.groupSender.pushName || `+${message.metadata.groupSender.identifier}`
                            : selectedConversation.contact.displayName || selectedConversation.contact.identifier}
                        </p>
                      )}

                      {/* Quoted message */}
                      {message.content.quotedMessage && (
                        <div className={cn(
                          'mb-2 pl-2 border-l-2 text-xs',
                          message.direction === 'OUTBOUND'
                            ? 'border-primary-foreground/50 text-primary-foreground/70'
                            : 'border-muted-foreground/50 text-muted-foreground'
                        )}>
                          <p className="font-medium truncate max-w-[150px]">
                            {message.content.quotedMessage.participant?.split('@')[0] || 'Unknown'}
                          </p>
                          <p className="truncate">{message.content.quotedMessage.text || 'Message'}</p>
                        </div>
                      )}

                      {/* Message content by type */}
                      <MessageContent
                        message={message}
                        onMediaPreview={onMediaPreview}
                      />

                      {/* Time and status */}
                      <div className={cn(
                        'flex items-center gap-1 mt-1',
                        message.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'
                      )}>
                        <span className={cn(
                          'text-[10px]',
                          message.direction === 'OUTBOUND' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                        )}>
                          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {message.direction === 'OUTBOUND' && <MessageStatusIcon status={message.status} />}
                      </div>

                      {/* Reactions */}
                      {message.metadata?.reactions && message.metadata.reactions.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {Object.entries(
                            message.metadata.reactions.reduce((acc: Record<string, number>, r: MessageReaction) => {
                              acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                              return acc;
                            }, {})
                          ).map(([emoji, count]) => (
                            <span
                              key={emoji}
                              className="inline-flex items-center gap-0.5 text-xs bg-background/80 rounded-full px-1.5 py-0.5 border"
                            >
                              {emoji} {count as number > 1 && <span className="text-muted-foreground">{count as number}</span>}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>

        {/* Typing indicator */}
        {typingUsers.size > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-4">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span>{Array.from(typingUsers.values()).join(', ')} typing...</span>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// Sub-component for message content rendering
interface MessageContentProps {
  message: Message;
  onMediaPreview: (media: { url: string; type: 'image' | 'video'; filename?: string }) => void;
}

function MessageContent({ message, onMediaPreview }: MessageContentProps) {
  const { type, content, direction, id } = message;

  if (type === 'TEXT') {
    const text = content.text || getMessageText(content);
    return text ? (
      <p className="text-sm whitespace-pre-wrap break-words">{formatWhatsAppText(text)}</p>
    ) : null;
  }

  if (type === 'IMAGE') {
    return (
      <div className="space-y-2">
        {content.mediaUrl ? (
          <div className="relative group/media">
            <img
              src={content.mediaUrl}
              alt="Image"
              className="max-w-[280px] max-h-[280px] rounded object-cover cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => onMediaPreview({ url: content.mediaUrl, type: 'image' })}
            />
            <Button
              variant="secondary"
              size="icon"
              className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover/media:opacity-100 transition-opacity"
              onClick={(e) => { e.stopPropagation(); downloadFile(content.mediaUrl, `image-${id}.jpg`); }}
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="h-32 w-32 bg-black/10 rounded flex items-center justify-center">
            <ImageIcon className="h-8 w-8 opacity-50" />
          </div>
        )}
        {(content.caption || content.text) && (
          <p className="text-sm whitespace-pre-wrap break-words">{formatWhatsAppText(content.caption || content.text || '')}</p>
        )}
      </div>
    );
  }

  if (type === 'VIDEO') {
    return (
      <div className="space-y-2">
        {content.mediaUrl ? (
          <div className="relative group/media">
            <div
              className="relative cursor-pointer"
              onClick={() => onMediaPreview({ url: content.mediaUrl, type: 'video' })}
            >
              <video src={content.mediaUrl} preload="metadata" playsInline className="max-w-[280px] max-h-[280px] rounded" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded hover:bg-black/30 transition-colors">
                <Play className="h-12 w-12 text-white" />
              </div>
            </div>
            <Button
              variant="secondary"
              size="icon"
              className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover/media:opacity-100 transition-opacity"
              onClick={(e) => { e.stopPropagation(); downloadFile(content.mediaUrl, `video-${id}.mp4`); }}
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="h-32 w-32 bg-black/10 rounded flex items-center justify-center">
            <span className="text-2xl">🎬</span>
          </div>
        )}
        {(content.caption || content.text) && (
          <p className="text-sm whitespace-pre-wrap break-words">{formatWhatsAppText(content.caption || content.text || '')}</p>
        )}
      </div>
    );
  }

  if (type === 'AUDIO') {
    return (
      <div className="flex items-center gap-2 min-w-[180px]">
        {content.mediaUrl ? (
          <>
            <div className={cn(
              'flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center',
              direction === 'OUTBOUND' ? 'bg-primary-foreground/20' : 'bg-primary/20'
            )}>
              <Mic className={cn('h-4 w-4', direction === 'OUTBOUND' ? 'text-primary-foreground' : 'text-primary')} />
            </div>
            <div className="flex-1 min-w-0">
              <audio src={content.mediaUrl} controls className="w-full h-8" style={{ maxWidth: '180px' }} />
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <Mic className="h-4 w-4" />
            <span>Voice message</span>
          </div>
        )}
      </div>
    );
  }

  if (type === 'DOCUMENT') {
    return (
      <div className="space-y-2">
        <div className={cn(
          'flex items-center gap-2 p-2 rounded min-w-[180px]',
          direction === 'OUTBOUND' ? 'bg-primary-foreground/10' : 'bg-background/50'
        )}>
          {getDocumentIcon(content.fileName, content.mimeType)}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{content.fileName || 'Document'}</p>
            <p className={cn('text-xs', direction === 'OUTBOUND' ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
              {content.fileName?.split('.').pop()?.toUpperCase() || 'FILE'}
            </p>
          </div>
          {content.mediaUrl && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={() => downloadFile(content.mediaUrl, content.fileName || `document-${id}`)}
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
        </div>
        {content.caption && <p className="text-sm">{content.caption}</p>}
      </div>
    );
  }

  if (type === 'STICKER') {
    return (
      <div>
        {content.mediaUrl ? (
          <img src={content.mediaUrl} alt="Sticker" className="w-24 h-24 object-contain" />
        ) : (
          <span className="text-4xl">🎭</span>
        )}
      </div>
    );
  }

  // Fallback for unknown types
  const extractedText = getMessageText(content);
  const rawMediaType = getRawMediaType(content);

  return (
    <div className="space-y-1">
      {rawMediaType && !content.mediaUrl && (
        <div className="flex items-center gap-2 text-sm opacity-70">
          {rawMediaType === 'image' && <ImageIcon className="h-4 w-4" />}
          {rawMediaType === 'video' && <Play className="h-4 w-4" />}
          {rawMediaType === 'audio' && <Mic className="h-4 w-4" />}
          {rawMediaType === 'document' && <FileText className="h-4 w-4" />}
          {rawMediaType === 'location' && <span>📍</span>}
          {rawMediaType === 'contact' && <span>👤</span>}
          {rawMediaType === 'album' && <span>🖼️</span>}
          <span className="capitalize">{rawMediaType}</span>
        </div>
      )}
      {extractedText ? (
        <p className="text-sm whitespace-pre-wrap break-words">{formatWhatsAppText(extractedText)}</p>
      ) : (
        <p className="text-sm opacity-50 italic">[{type || 'Unknown'} message]</p>
      )}
    </div>
  );
}

export const MessageList = memo(MessageListComponent);
