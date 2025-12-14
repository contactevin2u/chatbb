'use client';

import { memo, useRef, useCallback, useState } from 'react';
import {
  Send,
  Paperclip,
  Smile,
  X,
  Reply,
  Mic,
  Square,
  FileText,
  FileSpreadsheet,
  FileImage,
  File,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SlashCommand, SlashCommandItem } from '@/components/slash-command';
import { ScheduleMessageDialog } from '@/components/schedule-message-dialog';
import { QuickReply } from '@/lib/api/quick-replies';
import { startSequenceExecution } from '@/lib/api/sequences';
import { cn } from '@/lib/utils/cn';

export interface ReplyToMessage {
  id: string;
  externalId: string;
  type: string;
  content: {
    text?: string;
    caption?: string;
  };
}

export interface SelectedMedia {
  file: File;
  preview: string;
  type: 'image' | 'video' | 'audio' | 'document';
}

interface MessageInputProps {
  conversationId: string;
  conversationStatus: string;
  messageText: string;
  selectedMedia: SelectedMedia | null;
  replyToMessage: ReplyToMessage | null;
  isUploading: boolean;
  isSending: boolean;
  isRecording: boolean;
  recordingTime: number;
  onMessageChange: (value: string) => void;
  onSend: () => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearMedia: () => void;
  onClearReply: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;
  onReopen: (id: string) => void;
  inputRef?: React.RefObject<HTMLInputElement>;
}

function getDocumentIcon(filename?: string, mimeType?: string) {
  const ext = filename?.split('.').pop()?.toLowerCase();
  const mime = mimeType?.toLowerCase();

  if (ext === 'pdf' || mime?.includes('pdf')) {
    return <FileText className="h-8 w-8 text-red-500" />;
  }
  if (['xls', 'xlsx', 'csv'].includes(ext || '') || mime?.includes('spreadsheet') || mime?.includes('csv')) {
    return <FileSpreadsheet className="h-8 w-8 text-green-600" />;
  }
  if (['doc', 'docx'].includes(ext || '') || mime?.includes('word')) {
    return <FileText className="h-8 w-8 text-blue-600" />;
  }
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '') || mime?.startsWith('image/')) {
    return <FileImage className="h-8 w-8 text-purple-500" />;
  }
  return <File className="h-8 w-8 text-gray-500" />;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const MessageInput = memo(function MessageInput({
  conversationId,
  conversationStatus,
  messageText,
  selectedMedia,
  replyToMessage,
  isUploading,
  isSending,
  isRecording,
  recordingTime,
  onMessageChange,
  onSend,
  onFileSelect,
  onClearMedia,
  onClearReply,
  onStartRecording,
  onStopRecording,
  onCancelRecording,
  onReopen,
  inputRef,
}: MessageInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localInputRef = useRef<HTMLInputElement>(null);
  const actualInputRef = inputRef ?? localInputRef;

  const [slashCommandOpen, setSlashCommandOpen] = useState(false);
  const [slashSearchTerm, setSlashSearchTerm] = useState('');
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);

  const isClosed = conversationStatus === 'CLOSED';
  const hasContent = messageText.trim() || selectedMedia;

  // Build message content for scheduling
  const getScheduleMessageContent = useCallback(() => {
    return {
      text: messageText.trim() || undefined,
      mediaUrl: selectedMedia?.preview,
      mediaType: selectedMedia?.type,
    };
  }, [messageText, selectedMedia]);

  const handleSlashCommandSelect = useCallback(async (item: SlashCommandItem) => {
    const slashStart = messageText.lastIndexOf('/');

    if (item.type === 'quickReply') {
      // Quick reply: insert text
      const quickReply = item.data as QuickReply;
      const newText = messageText.substring(0, slashStart) + quickReply.content.text;
      onMessageChange(newText);
    } else {
      // Sequence: start execution
      const sequence = item.data;
      try {
        await startSequenceExecution(sequence.id, conversationId);
        toast.success(`Started sequence: ${sequence.name}`);
        // Clear the slash command text
        const newText = messageText.substring(0, slashStart);
        onMessageChange(newText);
      } catch (error: any) {
        toast.error(error.message || 'Failed to start sequence');
      }
    }

    setSlashCommandOpen(false);
    setSlashSearchTerm('');
    actualInputRef.current?.focus();
  }, [messageText, onMessageChange, actualInputRef, conversationId]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    onMessageChange(value);

    // Check for slash command
    const lastSlashIndex = value.lastIndexOf('/');
    if (lastSlashIndex !== -1) {
      const charBeforeSlash = value[lastSlashIndex - 1];
      if (lastSlashIndex === 0 || charBeforeSlash === ' ' || charBeforeSlash === '\n') {
        const searchTerm = value.substring(lastSlashIndex + 1);
        if (!searchTerm.includes(' ')) {
          setSlashSearchTerm(searchTerm);
          setSlashCommandOpen(true);
          return;
        }
      }
    }

    if (slashCommandOpen) {
      setSlashCommandOpen(false);
      setSlashSearchTerm('');
    }
  }, [onMessageChange, slashCommandOpen]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (slashCommandOpen && (e.key === 'Enter' || e.key === 'Tab' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }, [slashCommandOpen, onSend]);

  return (
    <div className="p-4 border-t border-pink-200/50 dark:border-purple-800/50 bg-gradient-to-r from-white via-pink-50/30 to-lavender-50/30 dark:from-purple-950 dark:via-purple-900/30 dark:to-pink-950/30">
      {/* Reply Preview */}
      {replyToMessage && (
        <div className="mb-3 p-2 bg-pink-100/50 dark:bg-purple-900/30 rounded-xl border-l-4 border-pink-500">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-primary flex items-center gap-1">
                <Reply className="h-3 w-3" />
                Replying to
              </p>
              <p className="text-sm text-muted-foreground truncate">
                {replyToMessage.content.text ||
                 replyToMessage.content.caption ||
                 `[${replyToMessage.type}]`}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0"
              onClick={onClearReply}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Media Preview */}
      {selectedMedia && (
        <div className="mb-3 p-2 bg-pink-100/50 dark:bg-purple-900/30 rounded-xl">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              {selectedMedia.type === 'image' && (
                <img
                  src={selectedMedia.preview}
                  alt="Preview"
                  className="max-h-32 rounded object-contain"
                />
              )}
              {selectedMedia.type === 'video' && (
                <video
                  src={selectedMedia.preview}
                  className="max-h-32 rounded"
                  controls
                />
              )}
              {selectedMedia.type === 'audio' && (
                <div className="flex items-center gap-3 p-2 bg-background rounded">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Mic className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Voice note</p>
                    <audio src={selectedMedia.preview} controls className="w-full h-8 mt-1" />
                  </div>
                </div>
              )}
              {selectedMedia.type === 'document' && (
                <div className="flex items-center gap-3 p-2 bg-background rounded">
                  {getDocumentIcon(selectedMedia.file.name)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{selectedMedia.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedMedia.file.name.split('.').pop()?.toUpperCase()} • {(selectedMedia.file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onClearMedia}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
        onChange={onFileSelect}
      />

      {/* Recording UI */}
      {isRecording ? (
        <div className="flex items-center gap-3 p-2 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-200 dark:border-rose-800 shadow-sm">
          <div className="flex items-center gap-2 flex-1">
            <div className="h-3 w-3 bg-rose-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium text-rose-600 dark:text-rose-400">
              Recording... {formatDuration(recordingTime)}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-rose-400 hover:text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/30 rounded-full"
            onClick={onCancelRecording}
            title="Cancel"
          >
            <X className="h-5 w-5" />
          </Button>
          <Button
            variant="default"
            size="icon"
            className="h-8 w-8 bg-gradient-to-r from-rose-500 to-red-500 hover:from-rose-600 hover:to-red-600 rounded-full shadow-lg"
            onClick={onStopRecording}
            title="Stop and send"
          >
            <Square className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isClosed}
            className="hover:bg-pink-100 dark:hover:bg-purple-900/50 text-pink-600 dark:text-pink-400 rounded-full transition-all hover:scale-110"
          >
            <Paperclip className="h-5 w-5" />
          </Button>
          <div className="relative flex-1">
            {/* Slash Command Popup */}
            <SlashCommand
              isOpen={slashCommandOpen}
              searchTerm={slashSearchTerm}
              position={{ top: 0, left: 0 }}
              onSelect={handleSlashCommandSelect}
              onClose={() => {
                setSlashCommandOpen(false);
                setSlashSearchTerm('');
              }}
            />
            <Input
              ref={actualInputRef}
              placeholder={selectedMedia ? "Add a caption..." : "Type a message... (/ for quick replies)"}
              value={messageText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={isClosed}
            />
          </div>
          <Button variant="ghost" size="icon" className="hover:bg-pink-100 dark:hover:bg-purple-900/50 text-pink-600 dark:text-pink-400 rounded-full transition-all hover:scale-110">
            <Smile className="h-5 w-5" />
          </Button>
          {/* Schedule button - only show when there's content */}
          {hasContent && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setScheduleDialogOpen(true)}
              disabled={isClosed}
              title="Schedule message"
              className="hover:bg-pink-100 dark:hover:bg-purple-900/50 text-pink-600 dark:text-pink-400 rounded-full transition-all hover:scale-110"
            >
              <Clock className="h-5 w-5" />
            </Button>
          )}
          {/* Show mic button when no text, send button when there's text or media */}
          {!hasContent ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onStartRecording}
              disabled={isClosed}
              title="Record voice note"
              className="hover:bg-pink-100 dark:hover:bg-purple-900/50 text-pink-600 dark:text-pink-400 rounded-full transition-all hover:scale-110"
            >
              <Mic className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              onClick={onSend}
              disabled={!hasContent || isSending || isUploading || isClosed}
              className="rounded-full shadow-pink-md hover:shadow-pink-lg transition-all hover:scale-105"
            >
              {isUploading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          )}
        </div>
      )}

      {/* Schedule Message Dialog */}
      <ScheduleMessageDialog
        open={scheduleDialogOpen}
        onOpenChange={setScheduleDialogOpen}
        conversationId={conversationId}
        messageContent={getScheduleMessageContent()}
        onScheduled={() => {
          onMessageChange('');
          onClearMedia();
        }}
      />
      {isClosed && (
        <p className="text-xs text-pink-500 dark:text-pink-400 mt-2 text-center">
          This conversation is closed.{' '}
          <button
            className="text-pink-600 dark:text-pink-300 hover:underline font-medium"
            onClick={() => onReopen(conversationId)}
          >
            Reopen it
          </button>{' '}
          to send messages.
        </p>
      )}
    </div>
  );
});
