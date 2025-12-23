'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  listConversations,
  getMessages,
  sendMessage,
  reactToMessage,
  editMessage,
  deleteMessage,
  deleteMessageForEveryone,
  closeConversation,
  reopenConversation,
  pinConversation,
  unpinConversation,
  uploadMedia,
  type Conversation,
  type Message,
} from '@/lib/api/conversations';
import { useWebSocket } from '@/providers/websocket-provider';
import { useAuthStore } from '@/stores/auth-store';

export interface InboxContextValue {
  // Selection
  selectedConversationId: string | null;
  setSelectedConversationId: (id: string | null) => void;
  selectedConversation: Conversation | null;

  // Conversations
  conversations: Conversation[];
  isLoadingConversations: boolean;

  // Messages
  messages: Message[];
  allMessages: Message[];
  isLoadingMessages: boolean;
  hasMoreMessages: boolean;
  isLoadingMoreMessages: boolean;
  loadMoreMessages: () => Promise<void>;

  // Filters
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedTagIds: string[];
  setSelectedTagIds: (ids: string[]) => void;

  // UI State
  incognitoMode: boolean;
  setIncognitoMode: (mode: boolean) => void;
  typingUsers: Map<string, string>;

  // Actions
  handleSelectConversation: (id: string) => void;
  sendMessageAction: (content: { text?: string; mediaUrl?: string; mediaType?: string; quotedMessageId?: string }) => void;
  reactToMessageAction: (messageId: string, emoji: string) => void;
  editMessageAction: (messageId: string, newText: string) => void;
  deleteMessageAction: (messageId: string, forEveryone: boolean) => void;
  closeConversationAction: (id: string) => void;
  reopenConversationAction: (id: string) => void;
  pinConversationAction: (id: string) => void;
  unpinConversationAction: (id: string) => void;

  // Mutation states
  isSending: boolean;
}

const InboxContext = createContext<InboxContextValue | null>(null);

export function useInbox() {
  const context = useContext(InboxContext);
  if (!context) {
    throw new Error('useInbox must be used within an InboxProvider');
  }
  return context;
}

interface InboxProviderProps {
  children: ReactNode;
}

export function InboxProvider({ children }: InboxProviderProps) {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { socket, joinConversation, leaveConversation, startTyping, stopTyping, broadcastPendingMessage } = useWebSocket();
  const { user } = useAuthStore();

  // URL param for conversation
  const urlConversationId = searchParams.get('conversation');

  // State
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(urlConversationId);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [incognitoMode, setIncognitoMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('incognitoMode') === 'true';
    }
    return false;
  });
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
  const [allMessages, setAllMessages] = useState<Message[]>([]);

  // Queries
  const { data: conversationsData, isLoading: isLoadingConversations } = useQuery({
    queryKey: ['conversations', selectedTagIds, searchQuery],
    queryFn: () => listConversations({
      tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
      search: searchQuery || undefined,
      sortBy: 'lastMessageAt',
      sortOrder: 'desc',
    }),
    refetchInterval: 10000,
  });

  const { data: messagesData, isLoading: isLoadingMessages } = useQuery({
    queryKey: ['messages', selectedConversationId],
    queryFn: () => selectedConversationId ? getMessages(selectedConversationId) : null,
    enabled: !!selectedConversationId,
  });

  // Update allMessages when data loads
  useEffect(() => {
    if (messagesData?.messages) {
      setAllMessages(prev => {
        if (prev.length === 0) return messagesData.messages;
        const newMessageIds = new Set(messagesData.messages.map((m: Message) => m.id));
        const olderMessages = prev.filter((m: Message) => !newMessageIds.has(m.id));
        if (olderMessages.length > 0) {
          return [...olderMessages, ...messagesData.messages];
        }
        return messagesData.messages;
      });
      setHasMoreMessages(messagesData.hasMore ?? false);
    }
  }, [messagesData]);

  // Reset when conversation changes
  useEffect(() => {
    setAllMessages([]);
    setHasMoreMessages(true);
    setIsLoadingMoreMessages(false);
  }, [selectedConversationId]);

  // Load more messages
  const loadMoreMessages = useCallback(async () => {
    if (!selectedConversationId || !hasMoreMessages || isLoadingMoreMessages || allMessages.length === 0) return;
    const oldestMessage = allMessages[0];
    if (!oldestMessage) return;

    setIsLoadingMoreMessages(true);
    try {
      const olderMessages = await getMessages(selectedConversationId, { before: oldestMessage.id, limit: 50 });
      if (olderMessages?.messages && olderMessages.messages.length > 0) {
        setAllMessages(prev => [...olderMessages.messages, ...prev]);
        setHasMoreMessages(olderMessages.hasMore ?? false);
      } else {
        setHasMoreMessages(false);
      }
    } catch (error) {
      console.error('Error loading more messages:', error);
    } finally {
      setIsLoadingMoreMessages(false);
    }
  }, [selectedConversationId, hasMoreMessages, isLoadingMoreMessages, allMessages]);

  // Selected conversation
  const selectedConversation = conversationsData?.conversations.find(
    (c: Conversation) => c.id === selectedConversationId
  ) || null;

  // Handle conversation selection
  const handleSelectConversation = useCallback((id: string) => {
    if (selectedConversationId) {
      leaveConversation(selectedConversationId);
    }
    setSelectedConversationId(id);
    joinConversation(id);
  }, [selectedConversationId, leaveConversation, joinConversation]);

  // Mutations
  const sendMessageMutation = useMutation({
    mutationFn: (data: Parameters<typeof sendMessage>[0]) => sendMessage(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', selectedConversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => {
      toast.error('Failed to send message');
    },
  });

  const reactToMessageMutation = useMutation({
    mutationFn: (data: { messageId: string; emoji: string }) =>
      reactToMessage(data.messageId, data.emoji),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', selectedConversationId] });
    },
  });

  const editMessageMutation = useMutation({
    mutationFn: (data: { messageId: string; newText: string }) =>
      editMessage(data.messageId, data.newText),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', selectedConversationId] });
      toast.success('Message edited');
    },
    onError: () => {
      toast.error('Failed to edit message');
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: string) => deleteMessage(messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', selectedConversationId] });
      toast.success('Message deleted');
    },
  });

  const deleteForEveryoneMutation = useMutation({
    mutationFn: (messageId: string) => deleteMessageForEveryone(messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', selectedConversationId] });
      toast.success('Message deleted for everyone');
    },
    onError: () => {
      toast.error('Failed to delete message');
    },
  });

  const closeConversationMutation = useMutation({
    mutationFn: closeConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const reopenConversationMutation = useMutation({
    mutationFn: reopenConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const pinConversationMutation = useMutation({
    mutationFn: pinConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const unpinConversationMutation = useMutation({
    mutationFn: unpinConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  // Action wrappers
  const sendMessageAction = useCallback((content: { text?: string; mediaUrl?: string; mediaType?: string; quotedMessageId?: string }) => {
    if (!selectedConversationId) return;
    sendMessageMutation.mutate({
      conversationId: selectedConversationId,
      text: content.text,
      media: content.mediaUrl ? {
        type: (content.mediaType as 'image' | 'video' | 'audio' | 'document') || 'image',
        url: content.mediaUrl,
      } : undefined,
      quotedMessageId: content.quotedMessageId,
    });
  }, [selectedConversationId, sendMessageMutation]);

  const reactToMessageAction = useCallback((messageId: string, emoji: string) => {
    reactToMessageMutation.mutate({ messageId, emoji });
  }, [reactToMessageMutation]);

  const editMessageAction = useCallback((messageId: string, newText: string) => {
    editMessageMutation.mutate({ messageId, newText });
  }, [editMessageMutation]);

  const deleteMessageAction = useCallback((messageId: string, forEveryone: boolean) => {
    if (forEveryone) {
      deleteForEveryoneMutation.mutate(messageId);
    } else {
      deleteMessageMutation.mutate(messageId);
    }
  }, [deleteMessageMutation, deleteForEveryoneMutation]);

  const closeConversationAction = useCallback((id: string) => {
    closeConversationMutation.mutate(id);
  }, [closeConversationMutation]);

  const reopenConversationAction = useCallback((id: string) => {
    reopenConversationMutation.mutate(id);
  }, [reopenConversationMutation]);

  const pinConversationAction = useCallback((id: string) => {
    pinConversationMutation.mutate(id);
  }, [pinConversationMutation]);

  const unpinConversationAction = useCallback((id: string) => {
    unpinConversationMutation.mutate(id);
  }, [unpinConversationMutation]);

  // Persist incognito mode
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('incognitoMode', String(incognitoMode));
    }
  }, [incognitoMode]);

  const value: InboxContextValue = {
    selectedConversationId,
    setSelectedConversationId,
    selectedConversation,
    conversations: conversationsData?.conversations || [],
    isLoadingConversations,
    messages: messagesData?.messages || [],
    allMessages,
    isLoadingMessages,
    hasMoreMessages,
    isLoadingMoreMessages,
    loadMoreMessages,
    searchQuery,
    setSearchQuery,
    selectedTagIds,
    setSelectedTagIds,
    incognitoMode,
    setIncognitoMode,
    typingUsers,
    handleSelectConversation,
    sendMessageAction,
    reactToMessageAction,
    editMessageAction,
    deleteMessageAction,
    closeConversationAction,
    reopenConversationAction,
    pinConversationAction,
    unpinConversationAction,
    isSending: sendMessageMutation.isPending,
  };

  return (
    <InboxContext.Provider value={value}>
      {children}
    </InboxContext.Provider>
  );
}
