'use client';

import { memo, useState } from 'react';
import { format } from 'date-fns';
import {
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Reply,
  Heart,
  ThumbsUp,
  Download,
  Play,
  Pause,
  FileText,
  FileSpreadsheet,
  FileImage,
  File,
  Pencil,
  Trash2,
  MoreVertical,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils/cn';
import { formatWhatsAppText } from '@/lib/utils/whatsapp-formatting';

export interface MessageReaction {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface MessageContent {
  text?: string;
  caption?: string;
  url?: string;
  filename?: string;
  mimetype?: string;
  latitude?: number;
  longitude?: number;
  vcard?: string;
}

export interface QuotedMessage {
  id: string;
  content: MessageContent;
  type: string;
  direction: string;
}

export interface MessageData {
  id: string;
  externalId: string;
  type: string;
  direction: 'INBOUND' | 'OUTBOUND';
  status: string;
  content: MessageContent;
  quotedMessage?: QuotedMessage | null;
  reactions: MessageReaction[];
  sentByUser?: {
    firstName: string;
    lastName: string;
  } | null;
  createdAt: string;
}

interface MessageBubbleProps {
  message: MessageData;
  isGroup?: boolean;
  senderName?: string;
  onReply?: (message: MessageData) => void;
  onReaction?: (messageId: string, emoji: string) => void;
  onEdit?: (message: MessageData) => void;
  onDelete?: (message: MessageData) => void;
  playingAudioId?: string | null;
  onAudioPlay?: (id: string) => void;
  onAudioPause?: () => void;
  onDownload?: (url: string, filename: string) => void;
  currentUserId?: string;
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'PENDING':
      return <Clock className="h-3 w-3 text-muted-foreground" />;
    case 'SENT':
      return <Check className="h-3 w-3 text-muted-foreground" />;
    case 'DELIVERED':
      return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    case 'READ':
      return <CheckCheck className="h-3 w-3 text-blue-500" />;
    case 'FAILED':
      return <AlertCircle className="h-3 w-3 text-destructive" />;
    default:
      return null;
  }
}

function getFileIcon(mimetype?: string) {
  if (!mimetype) return <File className="h-8 w-8" />;

  if (mimetype.includes('pdf')) return <FileText className="h-8 w-8 text-red-500" />;
  if (mimetype.includes('spreadsheet') || mimetype.includes('excel'))
    return <FileSpreadsheet className="h-8 w-8 text-green-500" />;
  if (mimetype.includes('image')) return <FileImage className="h-8 w-8 text-blue-500" />;
  return <File className="h-8 w-8 text-muted-foreground" />;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isGroup,
  senderName,
  onReply,
  onReaction,
  onEdit,
  onDelete,
  playingAudioId,
  onAudioPlay,
  onAudioPause,
  onDownload,
  currentUserId,
}: MessageBubbleProps) {
  const isOutbound = message.direction === 'OUTBOUND';
  const [showActions, setShowActions] = useState(false);
  const canEdit = isOutbound && message.type === 'TEXT' && message.status !== 'FAILED';
  const canDelete = isOutbound && message.status !== 'FAILED';

  const renderContent = () => {
    const { type, content } = message;

    switch (type) {
      case 'TEXT':
        return (
          <p className="whitespace-pre-wrap break-words">{formatWhatsAppText(content.text || '')}</p>
        );

      case 'IMAGE':
        return (
          <div className="space-y-2">
            {content.url && (
              <img
                src={content.url}
                alt={content.filename || 'Image'}
                className="max-w-[300px] max-h-[300px] rounded-lg object-cover cursor-pointer"
              />
            )}
            {content.caption && (
              <p className="whitespace-pre-wrap break-words text-sm">{formatWhatsAppText(content.caption)}</p>
            )}
          </div>
        );

      case 'VIDEO':
        return (
          <div className="space-y-2">
            {content.url && (
              <video
                src={content.url}
                controls
                className="max-w-[300px] max-h-[300px] rounded-lg"
              />
            )}
            {content.caption && (
              <p className="whitespace-pre-wrap break-words text-sm">{formatWhatsAppText(content.caption)}</p>
            )}
          </div>
        );

      case 'AUDIO':
        return (
          <div className="flex items-center gap-3 min-w-[200px]">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={() => {
                if (playingAudioId === message.id) {
                  onAudioPause?.();
                } else {
                  onAudioPlay?.(message.id);
                }
              }}
            >
              {playingAudioId === message.id ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5" />
              )}
            </Button>
            <div className="flex-1 h-1 bg-muted rounded-full">
              <div className="h-full w-0 bg-primary rounded-full" />
            </div>
            {content.url && (
              <audio id={`audio-${message.id}`} src={content.url} className="hidden" />
            )}
          </div>
        );

      case 'DOCUMENT':
        return (
          <div
            className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors"
            onClick={() => content.url && onDownload?.(content.url, content.filename || 'document')}
          >
            {getFileIcon(content.mimetype)}
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate text-sm">{content.filename || 'Document'}</p>
              <p className="text-xs text-muted-foreground">
                {content.mimetype?.split('/')[1]?.toUpperCase() || 'FILE'}
              </p>
            </div>
            <Download className="h-4 w-4 text-muted-foreground" />
          </div>
        );

      case 'STICKER':
        return content.url ? (
          <img
            src={content.url}
            alt="Sticker"
            className="w-32 h-32 object-contain"
          />
        ) : (
          <p className="text-muted-foreground">🏷️ Sticker</p>
        );

      case 'LOCATION':
        return (
          <div className="space-y-2">
            <div className="w-[200px] h-[120px] bg-muted rounded-lg flex items-center justify-center">
              <span className="text-4xl">📍</span>
            </div>
            {content.latitude && content.longitude && (
              <a
                href={`https://maps.google.com/?q=${content.latitude},${content.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Open in Maps
              </a>
            )}
          </div>
        );

      default:
        return (
          <p className="text-muted-foreground italic">Unsupported message type</p>
        );
    }
  };

  return (
    <div
      className={cn(
        'flex gap-2 max-w-[85%] group',
        isOutbound ? 'ml-auto flex-row-reverse' : ''
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar for inbound messages */}
      {!isOutbound && isGroup && (
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarFallback className="text-xs">
            {senderName?.slice(0, 2).toUpperCase() || '??'}
          </AvatarFallback>
        </Avatar>
      )}

      <div className="flex flex-col gap-1">
        {/* Sender name for group inbound */}
        {!isOutbound && isGroup && senderName && (
          <span className="text-xs font-medium text-muted-foreground ml-1">
            {senderName}
          </span>
        )}

        {/* Quoted message */}
        {message.quotedMessage && (
          <div
            className={cn(
              'text-xs p-2 rounded border-l-2 mb-1 w-full min-w-[120px]',
              isOutbound
                ? 'bg-white/20 border-white/50'
                : 'bg-muted border-muted-foreground/50'
            )}
          >
            <p className="line-clamp-2 break-words">
              {message.quotedMessage.content.text ||
                message.quotedMessage.content.caption ||
                `[${message.quotedMessage.type}]`}
            </p>
          </div>
        )}

        {/* Message bubble */}
        <div
          className={cn(
            'rounded-2xl px-4 py-2 relative shadow-pink-sm transition-all duration-200',
            isOutbound
              ? 'bg-gradient-to-br from-pink-500 to-pink-600 text-white rounded-br-md hover:shadow-pink'
              : 'bg-gradient-to-br from-white to-pink-50 dark:from-purple-900 dark:to-purple-950 rounded-bl-md border border-pink-100 dark:border-purple-800'
          )}
        >
          {renderContent()}

          {/* Time and status */}
          <div
            className={cn(
              'flex items-center gap-1 mt-1',
              isOutbound ? 'justify-end' : 'justify-start'
            )}
          >
            <span className="text-[10px] opacity-70">
              {format(new Date(message.createdAt), 'HH:mm')}
            </span>
            {isOutbound && getStatusIcon(message.status)}
          </div>
        </div>

        {/* Reactions */}
        {message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                className={cn(
                  'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-all duration-200 hover:scale-110',
                  reaction.userIds.includes(currentUserId || '')
                    ? 'bg-pink-100 dark:bg-pink-900/30 border-pink-300 dark:border-pink-700'
                    : 'bg-white dark:bg-purple-900/50 border-pink-200 dark:border-purple-700'
                )}
                onClick={() => onReaction?.(message.externalId, reaction.emoji)}
              >
                <span>{reaction.emoji}</span>
                <span className="text-pink-600 dark:text-pink-400">{reaction.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      {showActions && (
        <div
          className={cn(
            'flex items-center gap-1 self-center opacity-0 group-hover:opacity-100 transition-all duration-200',
            isOutbound ? 'flex-row-reverse' : ''
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-pink-100 dark:hover:bg-purple-900/50 hover:text-pink-600 dark:hover:text-pink-400 rounded-full transition-all hover:scale-110"
            onClick={() => onReply?.(message)}
          >
            <Reply className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-pink-100 dark:hover:bg-purple-900/50 hover:text-rose-500 rounded-full transition-all hover:scale-110"
            onClick={() => onReaction?.(message.externalId, '❤️')}
          >
            <Heart className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-pink-100 dark:hover:bg-purple-900/50 hover:text-amber-500 rounded-full transition-all hover:scale-110"
            onClick={() => onReaction?.(message.externalId, '👍')}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
          </Button>
          {/* Edit/Delete dropdown for outbound messages */}
          {(canEdit || canDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-pink-100 dark:hover:bg-purple-900/50 rounded-full transition-all hover:scale-110"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={isOutbound ? 'end' : 'start'}>
                {canEdit && (
                  <DropdownMenuItem onClick={() => onEdit?.(message)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <DropdownMenuItem
                    onClick={() => onDelete?.(message)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete for everyone
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </div>
  );
});
