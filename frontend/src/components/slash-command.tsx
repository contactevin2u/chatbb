'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, FileText, Image, Video, Music, Zap } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { searchQuickReplies, QuickReply, trackQuickReplyUsage } from '@/lib/api/quick-replies';
import { searchSequences, MessageSequence } from '@/lib/api/sequences';

// Unified item type for the slash menu
export type SlashCommandItem =
  | { type: 'quickReply'; data: QuickReply }
  | { type: 'sequence'; data: MessageSequence };

interface SlashCommandProps {
  isOpen: boolean;
  searchTerm: string;
  position: { top: number; left: number };
  onSelect: (item: SlashCommandItem) => void;
  onClose: () => void;
  conversationId?: string;
}

export function SlashCommand({
  isOpen,
  searchTerm,
  position,
  onSelect,
  onClose,
  conversationId,
}: SlashCommandProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Search quick replies based on the term after `/`
  const { data: quickReplies, isLoading: isLoadingQuickReplies } = useQuery({
    queryKey: ['quickRepliesSearch', searchTerm],
    queryFn: () => searchQuickReplies(searchTerm, 5),
    enabled: isOpen && searchTerm.length > 0,
    staleTime: 5000,
  });

  // Search sequences based on the term after `/`
  const { data: sequences, isLoading: isLoadingSequences } = useQuery({
    queryKey: ['sequencesSearch', searchTerm],
    queryFn: () => searchSequences(searchTerm, 3),
    enabled: isOpen && searchTerm.length > 0,
    staleTime: 5000,
  });

  const isLoading = isLoadingQuickReplies || isLoadingSequences;

  // Combine quick replies and sequences into unified items
  const items: SlashCommandItem[] = [
    ...(quickReplies?.map((qr) => ({ type: 'quickReply' as const, data: qr })) || []),
    ...(sequences?.map((seq) => ({ type: 'sequence' as const, data: seq })) || []),
  ];

  // Reset selection when search results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [quickReplies, sequences]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen || !items.length) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % items.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
          break;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          const selected = items[selectedIndex];
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
    [isOpen, items, selectedIndex, onClose]
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

  const handleSelect = async (item: SlashCommandItem) => {
    onSelect(item);
    // Track usage asynchronously for quick replies
    if (item.type === 'quickReply') {
      trackQuickReplyUsage(item.data.id).catch(() => {});
    }
  };

  const getQuickReplyIcon = (quickReply: QuickReply) => {
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

  const getItemIcon = (item: SlashCommandItem) => {
    if (item.type === 'sequence') {
      return <Zap className="h-4 w-4 text-yellow-500" />;
    }
    return getQuickReplyIcon(item.data as QuickReply);
  };

  const getItemShortcut = (item: SlashCommandItem) => {
    if (item.type === 'sequence') {
      return item.data.shortcut || item.data.name.toLowerCase().replace(/\s+/g, '-');
    }
    return item.data.shortcut;
  };

  const getItemName = (item: SlashCommandItem) => {
    return item.data.name;
  };

  const getItemPreview = (item: SlashCommandItem) => {
    if (item.type === 'sequence') {
      const stepCount = item.data.steps?.length || 0;
      return `${stepCount} step${stepCount !== 1 ? 's' : ''} sequence`;
    }
    return (item.data as QuickReply).content.text;
  };

  const getItemCategory = (item: SlashCommandItem) => {
    if (item.type === 'sequence') {
      return 'Sequence';
    }
    return (item.data as QuickReply).category;
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
      ) : !items.length ? (
        <div className="p-3 text-sm text-muted-foreground text-center">
          {searchTerm ? `No results matching "/${searchTerm}"` : 'Type to search'}
        </div>
      ) : (
        <div className="py-1">
          <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            Quick Replies & Sequences
          </div>
          {items.map((item, index) => (
            <button
              key={`${item.type}-${item.data.id}`}
              className={cn(
                'w-full flex items-start gap-3 px-3 py-2 text-left hover:bg-accent transition-colors',
                index === selectedIndex && 'bg-accent'
              )}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="flex-shrink-0 mt-0.5">{getItemIcon(item)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{getItemName(item)}</span>
                  <span className="text-xs text-muted-foreground">/{getItemShortcut(item)}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {getItemPreview(item)}
                </p>
              </div>
              {getItemCategory(item) && (
                <span className={cn(
                  "flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded",
                  item.type === 'sequence' ? 'bg-yellow-100 text-yellow-800' : 'bg-muted'
                )}>
                  {getItemCategory(item)}
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
