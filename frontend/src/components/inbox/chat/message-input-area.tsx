'use client';

import { memo, useRef, useState, useCallback } from 'react';
import {
  Send,
  Paperclip,
  Smile,
  X,
  Mic,
  Square,
  Clock,
  Reply,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils/cn';
import { getDocumentIcon, formatDuration } from '@/lib/utils/message-helpers';
import { SlashCommand, SlashCommandItem } from '@/components/slash-command';
import type { Message } from '@/lib/api/conversations';

export interface SelectedMedia {
  file: File;
  preview: string;
  type: 'image' | 'video' | 'audio' | 'document';
}

export interface MessageInputAreaProps {
  conversationStatus: string;
  messageText: string;
  setMessageText: (text: string) => void;
  selectedMedia: SelectedMedia | null;
  onClearMedia: () => void;
  replyToMessage: Message | null;
  onClearReply: () => void;
  onSend: () => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;
  isRecording: boolean;
  recordingTime: number;
  isUploading: boolean;
  isSending: boolean;
  onSchedule: () => void;
  onReopen: () => void;
  slashCommandOpen: boolean;
  setSlashCommandOpen: (open: boolean) => void;
  slashSearchTerm: string;
  setSlashSearchTerm: (term: string) => void;
  onSlashCommandSelect: (item: SlashCommandItem) => void;
  onTyping: () => void;
}

function MessageInputAreaComponent({
  conversationStatus,
  messageText,
  setMessageText,
  selectedMedia,
  onClearMedia,
  replyToMessage,
  onClearReply,
  onSend,
  onFileSelect,
  onPaste,
  onStartRecording,
  onStopRecording,
  onCancelRecording,
  isRecording,
  recordingTime,
  isUploading,
  isSending,
  onSchedule,
  onReopen,
  slashCommandOpen,
  setSlashCommandOpen,
  slashSearchTerm,
  setSlashSearchTerm,
  onSlashCommandSelect,
  onTyping,
}: MessageInputAreaProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const isClosed = conversationStatus === 'CLOSED';

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessageText(value);
    onTyping();

    // Detect slash command
    if (value.startsWith('/')) {
      setSlashCommandOpen(true);
      setSlashSearchTerm(value.slice(1));
    } else {
      setSlashCommandOpen(false);
      setSlashSearchTerm('');
    }

    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [setMessageText, onTyping, setSlashCommandOpen, setSlashSearchTerm]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Let slash command popup handle Enter/Tab
    if (slashCommandOpen && (e.key === 'Enter' || e.key === 'Tab' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      return;
    }
    // Send on Enter, new line on Shift+Enter
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
      // Reset height after sending
      const textarea = e.target as HTMLTextAreaElement;
      textarea.style.height = 'auto';
    }
  }, [slashCommandOpen, onSend]);

  return (
    <div className="p-2 sm:p-4 border-t">
      {/* Reply Preview */}
      {replyToMessage && (
        <div className="mb-2 sm:mb-3 p-2 bg-muted rounded-lg border-l-4 border-primary">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-primary flex items-center gap-1">
                <Reply className="h-3 w-3" />
                Replying
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                {replyToMessage.content.text || replyToMessage.content.caption || `[${replyToMessage.type}]`}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={onClearReply}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Media Preview */}
      {selectedMedia && (
        <div className="mb-2 sm:mb-3 p-2 bg-muted rounded-lg">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              {selectedMedia.type === 'image' && (
                <img src={selectedMedia.preview} alt="Preview" className="max-h-24 sm:max-h-32 rounded object-contain" />
              )}
              {selectedMedia.type === 'video' && (
                <video src={selectedMedia.preview} className="max-h-24 sm:max-h-32 rounded" controls />
              )}
              {selectedMedia.type === 'audio' && (
                <div className="flex items-center gap-2 sm:gap-3 p-2 bg-background rounded">
                  <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Mic className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium">Voice note</p>
                    <audio src={selectedMedia.preview} controls className="w-full h-7 sm:h-8 mt-1" />
                  </div>
                </div>
              )}
              {selectedMedia.type === 'document' && (
                <div className="flex items-center gap-2 sm:gap-3 p-2 bg-background rounded">
                  <div className="flex-shrink-0">{getDocumentIcon(selectedMedia.file.name)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium truncate">{selectedMedia.file.name}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      {selectedMedia.file.name.split('.').pop()?.toUpperCase()} • {(selectedMedia.file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
              )}
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={onClearMedia}>
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
        <div className="flex items-center gap-3 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 flex-1">
            <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium text-red-600 dark:text-red-400">
              Recording... {formatDuration(recordingTime)}
            </span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={onCancelRecording} title="Cancel">
            <X className="h-5 w-5" />
          </Button>
          <Button variant="default" size="icon" className="h-8 w-8 bg-red-500 hover:bg-red-600" onClick={onStopRecording} title="Stop and send">
            <Square className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-end gap-1 sm:gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isClosed}
            className="h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0"
          >
            <Paperclip className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
          <div className="relative flex-1 min-w-0">
            <SlashCommand
              isOpen={slashCommandOpen}
              searchTerm={slashSearchTerm}
              position={{ top: 0, left: 0 }}
              onSelect={onSlashCommandSelect}
              onClose={() => { setSlashCommandOpen(false); setSlashSearchTerm(''); }}
            />
            <Textarea
              ref={messageInputRef}
              placeholder={selectedMedia ? "Add caption..." : "Type a message... (Shift+Enter for new line)"}
              value={messageText}
              onChange={handleInputChange}
              onPaste={onPaste}
              onKeyDown={handleKeyDown}
              disabled={isClosed}
              className="min-h-[36px] sm:min-h-[40px] max-h-[120px] py-2 text-sm resize-none overflow-y-auto"
              rows={1}
            />
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-10 sm:w-10 hidden sm:flex flex-shrink-0">
            <Smile className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
          {(messageText.trim() || selectedMedia) && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onSchedule}
              disabled={isClosed}
              title="Schedule message"
              className="h-9 w-9 sm:h-10 sm:w-10 hidden sm:flex flex-shrink-0"
            >
              <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          )}
          {!messageText.trim() && !selectedMedia ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onStartRecording}
              disabled={isClosed}
              title="Record voice note"
              className="h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0"
            >
              <Mic className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          ) : (
            <Button
              onClick={onSend}
              disabled={(!messageText.trim() && !selectedMedia) || isSending || isUploading || isClosed}
              className="h-9 w-9 sm:h-10 sm:w-auto sm:px-4 flex-shrink-0"
            >
              {isUploading ? (
                <div className="h-4 w-4 sm:h-5 sm:w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Send className="h-4 w-4 sm:h-5 sm:w-5" />
              )}
            </Button>
          )}
        </div>
      )}

      {isClosed && (
        <p className="text-xs text-muted-foreground mt-2 text-center">
          This conversation is closed.{' '}
          <button className="text-primary hover:underline" onClick={onReopen}>
            Reopen it
          </button>{' '}
          to send messages.
        </p>
      )}
    </div>
  );
}

export const MessageInputArea = memo(MessageInputAreaComponent);
