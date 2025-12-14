'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, FileText, Image, Video, Music } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { searchQuickReplies, QuickReply, trackQuickReplyUsage } from '@/lib/api/quick-replies';

interface SlashCommandProps {
  isOpen: boolean;
  searchTerm: string;
  position: { top: number; left: number };
  onSelect: (quickReply: QuickReply) => void;
  onClose: () => void;
}

export function SlashCommand({
  isOpen,
  searchTerm,
  position,
  onSelect,
  onClose,
}: SlashCommandProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Search quick replies based on the term after `/`
  const { data: quickReplies, isLoading } = useQuery({
    queryKey: ['quickRepliesSearch', searchTerm],
    queryFn: () => searchQuickReplies(searchTerm, 8),
    enabled: isOpen && searchTerm.length > 0,
    staleTime: 5000,
  });

  // Reset selection when search results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [quickReplies]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen || !quickReplies?.length) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % quickReplies.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + quickReplies.length) % quickReplies.length);
          break;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          const selected = quickReplies[selectedIndex];
          if (selected) {
            handleSelect(selected);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [isOpen, quickReplies, selectedIndex, onClose]
  );

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown, true);
      return () => window.removeEventListener('keydown', handleKeyDown, true);
    }
  }, [isOpen, handleKeyDown]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  const handleSelect = async (quickReply: QuickReply) => {
    onSelect(quickReply);
    // Track usage asynchronously
    trackQuickReplyUsage(quickReply.id).catch(() => {});
  };

  const getMediaIcon = (quickReply: QuickReply) => {
    if (!quickReply.content.media) {
      return <MessageSquare className="h-4 w-4 text-muted-foreground" />;
    }
    switch (quickReply.content.media.type) {
      case 'image':
        return <Image className="h-4 w-4 text-blue-500" />;
      case 'video':
        return <Video className="h-4 w-4 text-purple-500" />;
      case 'audio':
        return <Music className="h-4 w-4 text-green-500" />;
      case 'document':
        return <FileText className="h-4 w-4 text-orange-500" />;
      default:
        return <MessageSquare className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className="absolute z-50 w-80 max-h-64 overflow-y-auto rounded-lg border bg-popover shadow-lg"
      style={{
        bottom: `calc(100% + 8px)`,
        left: 0,
      }}
    >
      {isLoading ? (
        <div className="p-3 text-sm text-muted-foreground text-center">Loading...</div>
      ) : !quickReplies?.length ? (
        <div className="p-3 text-sm text-muted-foreground text-center">
          {searchTerm ? `No quick replies matching "/${searchTerm}"` : 'Type to search quick replies'}
        </div>
      ) : (
        <div className="py-1">
          <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            Quick Replies
          </div>
          {quickReplies.map((quickReply, index) => (
            <button
              key={quickReply.id}
              className={cn(
                'w-full flex items-start gap-3 px-3 py-2 text-left hover:bg-accent transition-colors',
                index === selectedIndex && 'bg-accent'
              )}
              onClick={() => handleSelect(quickReply)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="flex-shrink-0 mt-0.5">{getMediaIcon(quickReply)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{quickReply.name}</span>
                  <span className="text-xs text-muted-foreground">/{quickReply.shortcut}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {quickReply.content.text}
                </p>
              </div>
              {quickReply.category && (
                <span className="flex-shrink-0 text-[10px] bg-muted px-1.5 py-0.5 rounded">
                  {quickReply.category}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      <div className="px-3 py-2 border-t bg-muted/50 text-[10px] text-muted-foreground">
        <span className="font-medium">Tab</span> or <span className="font-medium">Enter</span> to
        select &middot; <span className="font-medium">Esc</span> to dismiss
      </div>
    </div>
  );
}
