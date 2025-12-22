'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, isToday, isYesterday, format, isSameDay } from 'date-fns';
import {
  Search,
  Filter,
  MoreVertical,
  Send,
  Paperclip,
  Image as ImageIcon,
  Smile,
  X,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  AlertTriangle,
  User,
  Users,
  Phone,
  Mail,
  Tag as TagIcon,
  MessageSquare,
  Edit,
  Reply,
  Heart,
  ThumbsUp,
  Download,
  Play,
  Pause,
  Mic,
  FileText,
  FileSpreadsheet,
  FileImage,
  File,
  Square,
  Pin,
  PinOff,
  Plus,
  StickyNote,
  Trash2,
  PanelLeftClose,
  PanelLeft,
  PanelRightClose,
  PanelRight,
  ShoppingBag,
  Package,
  Eye,
  EyeOff,
  Wand2,
  Copy,
  RefreshCw,
  ArrowLeft,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils/cn';
import { formatWhatsAppText } from '@/lib/utils/whatsapp-formatting';
import { updateContact } from '@/lib/api/contacts';
import { setIncognitoMode as setIncognitoModeApi, getIncognitoStatus } from '@/lib/api/channels';
import { useWebSocket } from '@/providers/websocket-provider';
import { useAuthStore } from '@/stores/auth-store';
import { OrderOpsTab } from '@/components/inbox/orderops-tab';
import { parseConversationMessage } from '@/lib/api/orderops';
import { Textarea } from '@/components/ui/textarea';
import { useUIStore } from '@/stores/ui-store';
import { useKeyboardShortcuts, KeyboardShortcut } from '@/hooks/use-keyboard-shortcuts';
import { SlashCommand, SlashCommandItem } from '@/components/slash-command';
import { startSequenceExecution } from '@/lib/api/sequences';
import { ScheduleMessageDialog } from '@/components/schedule-message-dialog';
import { EditMessageDialog } from '@/components/edit-message-dialog';
import { TagDropdown } from '@/components/tag-dropdown';
import { QuickReply } from '@/lib/api/quick-replies';
import { useRewards } from '@/hooks/use-rewards';
import { listScheduledMessages, cancelScheduledMessage, ScheduledMessage } from '@/lib/api/scheduled-messages';
import {
  listConversations,
  getConversation,
  getMessages,
  sendMessage,
  markConversationAsRead,
  closeConversation,
  reopenConversation,
  setActiveAgent,
  clearActiveAgent,
  uploadMedia,
  reactToMessage,
  pinConversation,
  unpinConversation,
  getConversationTags,
  addConversationTag,
  removeConversationTag,
  getConversationNotes,
  addConversationNote,
  updateConversationNote,
  deleteConversationNote,
  getGroupParticipants,
  listTags,
  editMessage,
  deleteMessage,
  deleteMessageForEveryone,
  fetchHistory,
  type Conversation,
  type Message,
  type ConversationStatus,
  type UploadedMedia,
  type MessageReaction,
  type Tag,
  type ConversationNote,
  type GroupParticipantsResponse,
  type ConversationTagRelation,
} from '@/lib/api/conversations';

// Status badge component
function StatusBadge({ status }: { status: ConversationStatus }) {
  const config = {
    OPEN: { label: 'Open', className: 'bg-green-500/10 text-green-500' },
    PENDING: { label: 'Pending', className: 'bg-yellow-500/10 text-yellow-500' },
    RESOLVED: { label: 'Resolved', className: 'bg-blue-500/10 text-blue-500' },
    CLOSED: { label: 'Closed', className: 'bg-gray-500/10 text-gray-500' },
  };
  const { label, className } = config[status];
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', className)}>
      {label}
    </span>
  );
}

// Message status icon
function MessageStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'PENDING':
    case 'QUEUED':
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

// Get contact display name
function getContactName(contact: Conversation['contact']): string {
  if (contact.displayName) return contact.displayName;
  if (contact.firstName || contact.lastName) {
    return `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
  }
  return contact.identifier;
}

// Get contact initials
function getContactInitials(contact: Conversation['contact']): string {
  const name = getContactName(contact);
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// Check if contact is a group using the isGroup field from database
function isGroupContact(contact: Conversation['contact']): boolean {
  return contact.isGroup;
}

// Format date header for message groups
function formatDateHeader(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMMM d, yyyy');
}

// Format message preview
function getMessagePreview(message?: Message): string {
  if (!message) return 'No messages yet';

  const content = message.content;
  switch (message.type) {
    case 'TEXT':
      return content.text || '';
    case 'IMAGE':
      return '📷 Image';
    case 'VIDEO':
      return '🎬 Video';
    case 'AUDIO':
      return '🎵 Audio';
    case 'DOCUMENT':
      return `📄 ${content.fileName || 'Document'}`;
    case 'STICKER':
      return '🎭 Sticker';
    case 'LOCATION':
      return '📍 Location';
    case 'CONTACT':
      return '👤 Contact';
    default:
      return 'Message';
  }
}

// Get icon for document type
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

// Format duration in mm:ss
function formatDuration(seconds?: number): string {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Download file helper
function downloadFile(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function InboxPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { socket, joinConversation, leaveConversation, startTyping, stopTyping, broadcastPendingMessage } = useWebSocket();
  const { user } = useAuthStore();
  const { conversationListCollapsed, toggleConversationList, contactPanelOpen, setContactPanelOpen } = useUIStore();
  const { maybeReward } = useRewards();

  // Get conversation ID from URL params
  const urlConversationId = searchParams.get('conversation');
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(urlConversationId);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [messageText, setMessageText] = useState('');
  // Contact panel state from store (persisted)
  const [contactPanelTab, setContactPanelTab] = useState<string>('info');
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [editContactOpen, setEditContactOpen] = useState(false);
  const [editContactName, setEditContactName] = useState('');
  const [activeAgentWarning, setActiveAgentWarning] = useState<string | null>(null);
  const [otherActiveAgent, setOtherActiveAgent] = useState<{ id: string; name: string } | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<{ file: File; preview: string; type: 'image' | 'video' | 'audio' | 'document' } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null); // messageId to show picker for
  const [activeMessageMenu, setActiveMessageMenu] = useState<string | null>(null); // messageId for mobile tap-to-show actions
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [mediaPreview, setMediaPreview] = useState<{ url: string; type: 'image' | 'video'; filename?: string } | null>(null);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [slashCommandOpen, setSlashCommandOpen] = useState(false);
  const [slashSearchTerm, setSlashSearchTerm] = useState('');
  const [messageSearchIndex, setMessageSearchIndex] = useState(0);
  const [editingMessage, setEditingMessage] = useState<{ id: string; text: string } | null>(null);
  const [deletingMessage, setDeletingMessage] = useState<{ id: string; forEveryone: boolean } | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [incognitoMode, setIncognitoMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('incognitoMode') === 'true';
    }
    return false;
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousConversationRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch all tags for the organization
  const { data: allTags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: listTags,
    select: (data) => Array.isArray(data) ? data : [],
  });

  // Fetch conversations
  const { data: conversationsData, isLoading: isLoadingConversations } = useQuery({
    queryKey: ['conversations', selectedTagIds, searchQuery],
    queryFn: () => listConversations({
      tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
      search: searchQuery || undefined,
      sortBy: 'lastMessageAt',
      sortOrder: 'desc',
    }),
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  // Fetch messages for selected conversation
  const { data: messagesData, isLoading: isLoadingMessages, refetch: refetchMessages } = useQuery({
    queryKey: ['messages', selectedConversationId],
    queryFn: () => selectedConversationId ? getMessages(selectedConversationId) : null,
    enabled: !!selectedConversationId,
  });

  // Track if we've attempted to fetch history for current conversation
  const [historyFetchAttempted, setHistoryFetchAttempted] = useState<string | null>(null);

  // Auto-fetch history when conversation is opened
  useEffect(() => {
    if (
      selectedConversationId &&
      historyFetchAttempted !== selectedConversationId
    ) {
      // Mark as attempted to prevent repeated fetches
      setHistoryFetchAttempted(selectedConversationId);

      console.log('[HistoryFetch] Triggering fetch for:', selectedConversationId);
      // Trigger on-demand history fetch
      fetchHistory(selectedConversationId).then((response) => {
        console.log('[HistoryFetch] Response:', response);
      }).catch((error) => {
        console.error('Failed to fetch history:', error);
      });
    }
  }, [selectedConversationId, historyFetchAttempted]);

  // Reset history fetch tracking when conversation changes
  useEffect(() => {
    if (!selectedConversationId) {
      setHistoryFetchAttempted(null);
    }
  }, [selectedConversationId]);

  // Find selected conversation from list
  const selectedConversationFromList = conversationsData?.conversations.find(
    (c) => c.id === selectedConversationId
  );

  // Fetch specific conversation if not in list (e.g., navigating from notification)
  const { data: fetchedConversation } = useQuery({
    queryKey: ['conversation', selectedConversationId],
    queryFn: () => selectedConversationId ? getConversation(selectedConversationId) : null,
    enabled: !!selectedConversationId && !selectedConversationFromList && !isLoadingConversations,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Use conversation from list if available, otherwise use fetched one
  const selectedConversation = selectedConversationFromList || fetchedConversation;

  // Handle URL param changes for conversation selection
  useEffect(() => {
    if (urlConversationId && urlConversationId !== selectedConversationId) {
      setSelectedConversationId(urlConversationId);
      // Clear tag filter to ensure the conversation is visible
      setSelectedTagIds([]);
    }
  }, [urlConversationId]);

  // Send message mutation with optimistic updates for instant UI feedback
  const sendMessageMutation = useMutation({
    mutationFn: sendMessage,
    onMutate: async (newMessage: any) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['messages', newMessage.conversationId] });

      // Snapshot previous messages for rollback
      const previousMessages = queryClient.getQueryData(['messages', newMessage.conversationId]);

      // Optimistically add the message to the UI immediately
      const optimisticMessage = {
        id: `temp-${Date.now()}`,
        conversationId: newMessage.conversationId,
        direction: 'OUTBOUND',
        type: newMessage.localPreview?.type?.toUpperCase() || newMessage.media?.type?.toUpperCase() || 'TEXT',
        content: {
          text: newMessage.text,
          // Use local preview URL for instant display, falls back to uploaded URL
          ...(newMessage.localPreview && {
            url: newMessage.localPreview.url,
            mimetype: newMessage.localPreview.mimetype || 'application/octet-stream',
            filename: newMessage.localPreview.filename,
          }),
          ...(!newMessage.localPreview && newMessage.media && {
            url: newMessage.media.url,
            mimetype: newMessage.media.mimetype,
            filename: newMessage.media.filename,
          }),
        },
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        sentByUser: user ? {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
        } : null,
        metadata: newMessage.quotedMessageId ? { quotedMessageId: newMessage.quotedMessageId } : null,
      };

      queryClient.setQueryData(['messages', newMessage.conversationId], (old: any) => {
        if (!old?.messages) return old;
        return {
          ...old,
          messages: [...old.messages, optimisticMessage],
        };
      });

      // Broadcast to other agents so they see the pending message too (prevents double-reply)
      // Don't send local blob URLs - send placeholder for uploading media
      const broadcastContent = newMessage.localPreview
        ? { text: optimisticMessage.content.text, isUploading: true }
        : optimisticMessage.content;
      broadcastPendingMessage(newMessage.conversationId, {
        id: optimisticMessage.id,
        type: optimisticMessage.type,
        content: broadcastContent,
        quotedMessageId: newMessage.quotedMessageId,
      });
      return { previousMessages, conversationId: newMessage.conversationId };
    },
    onSuccess: (_data, variables) => {
      // Refetch to get the real message with server ID
      queryClient.invalidateQueries({ queryKey: ['messages', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      // Gamification: Try for a random reward!
      maybeReward('message');
    },
    onError: (error: Error, variables, context) => {
      // Rollback on error
      if (context?.previousMessages) {
        queryClient.setQueryData(['messages', context.conversationId], context.previousMessages);
      }
      toast.error(error.message || 'Failed to send message');
    },
  });

  // Close conversation mutation
  const closeConversationMutation = useMutation({
    mutationFn: closeConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Conversation closed');
      // Gamification: Higher chance reward for closing!
      maybeReward('close');
    },
  });

  // Reopen conversation mutation
  const reopenConversationMutation = useMutation({
    mutationFn: reopenConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Conversation reopened');
    },
  });

  // React to message mutation with optimistic updates for instant UI feedback
  const reactToMessageMutation = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      reactToMessage(messageId, emoji),
    onMutate: async ({ messageId, emoji }) => {
      // Close emoji picker immediately for instant feedback
      setShowEmojiPicker(null);

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['messages', selectedConversationId] });

      // Snapshot previous messages
      const previousMessages = queryClient.getQueryData(['messages', selectedConversationId]);

      // Optimistically update the message with the reaction
      queryClient.setQueryData(['messages', selectedConversationId], (old: any) => {
        if (!old?.messages) return old;
        return {
          ...old,
          messages: old.messages.map((msg: any) => {
            if (msg.id === messageId) {
              const currentReactions = msg.metadata?.reactions || [];
              const filteredReactions = currentReactions.filter((r: any) => r.senderId !== 'me');
              const newReactions = emoji
                ? [...filteredReactions, { emoji, senderId: 'me', timestamp: Date.now() }]
                : filteredReactions;
              return {
                ...msg,
                metadata: { ...msg.metadata, reactions: newReactions },
              };
            }
            return msg;
          }),
        };
      });

      return { previousMessages };
    },
    onError: (error: Error, _variables, context) => {
      // Rollback on error
      if (context?.previousMessages) {
        queryClient.setQueryData(['messages', selectedConversationId], context.previousMessages);
      }
      toast.error(error.message || 'Failed to send reaction');
    },
    onSettled: () => {
      // Refetch to ensure consistency with server
      queryClient.invalidateQueries({ queryKey: ['messages', selectedConversationId] });
    },
  });

  // Edit message mutation with optimistic update
  const editMessageMutation = useMutation({
    mutationFn: ({ messageId, text }: { messageId: string; text: string }) =>
      editMessage(messageId, text),
    onMutate: async ({ messageId, text }) => {
      await queryClient.cancelQueries({ queryKey: ['messages', selectedConversationId] });
      const previousMessages = queryClient.getQueryData(['messages', selectedConversationId]);

      // Optimistically update the message
      queryClient.setQueryData(['messages', selectedConversationId], (old: any) => {
        if (!old?.messages) return old;
        return {
          ...old,
          messages: old.messages.map((msg: any) =>
            msg.id === messageId
              ? { ...msg, content: { ...msg.content, text, isEdited: true } }
              : msg
          ),
        };
      });

      return { previousMessages };
    },
    onSuccess: () => {
      toast.success('Message edited');
      setEditingMessage(null);
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(['messages', selectedConversationId], context.previousMessages);
      }
      toast.error(error.message || 'Failed to edit message');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', selectedConversationId] });
    },
  });

  // Parse order mutation - runs in background with toast notifications
  const parseOrderMutation = useMutation({
    mutationFn: (text: string) => {
      if (!selectedConversationId) throw new Error('No conversation selected');
      return parseConversationMessage(selectedConversationId, { text });
    },
    onMutate: () => {
      // Show loading toast immediately
      toast.loading('Parsing order...', { id: 'parse-order' });
    },
    onSuccess: (data: any) => {
      toast.dismiss('parse-order');
      if (data.linked) {
        toast.success(`Order #${data.parsed?.data?.order_code || ''} created and linked!`, {
          duration: 5000,
        });
        // Refresh linked order data
        queryClient.invalidateQueries({ queryKey: ['linkedOrder', selectedConversationId] });
      } else if (data.parsed?.data?.order_id) {
        toast.success(`Order #${data.parsed?.data?.order_code || ''} created`, {
          duration: 5000,
        });
      } else {
        toast.success('Message parsed - no order detected');
      }
    },
    onError: (error: any) => {
      toast.dismiss('parse-order');
      toast.error(error.response?.data?.error || 'Failed to parse order');
    },
  });

  // Delete message mutation (local only)
  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: string) => deleteMessage(messageId),
    onMutate: async (messageId) => {
      await queryClient.cancelQueries({ queryKey: ['messages', selectedConversationId] });
      const previousMessages = queryClient.getQueryData(['messages', selectedConversationId]);

      // Optimistically remove the message
      queryClient.setQueryData(['messages', selectedConversationId], (old: any) => {
        if (!old?.messages) return old;
        return {
          ...old,
          messages: old.messages.filter((msg: any) => msg.id !== messageId),
        };
      });

      return { previousMessages };
    },
    onSuccess: () => {
      toast.success('Message deleted');
      setDeletingMessage(null);
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(['messages', selectedConversationId], context.previousMessages);
      }
      toast.error(error.message || 'Failed to delete message');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', selectedConversationId] });
    },
  });

  // Delete message for everyone mutation
  const deleteForEveryoneMutation = useMutation({
    mutationFn: (messageId: string) => deleteMessageForEveryone(messageId),
    onMutate: async (messageId) => {
      await queryClient.cancelQueries({ queryKey: ['messages', selectedConversationId] });
      const previousMessages = queryClient.getQueryData(['messages', selectedConversationId]);

      // Optimistically mark as deleted
      queryClient.setQueryData(['messages', selectedConversationId], (old: any) => {
        if (!old?.messages) return old;
        return {
          ...old,
          messages: old.messages.map((msg: any) =>
            msg.id === messageId
              ? { ...msg, content: { deleted: true }, type: 'SYSTEM' }
              : msg
          ),
        };
      });

      return { previousMessages };
    },
    onSuccess: () => {
      toast.success('Message deleted for everyone');
      setDeletingMessage(null);
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(['messages', selectedConversationId], context.previousMessages);
      }
      toast.error(error.message || 'Failed to delete message');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', selectedConversationId] });
    },
  });

  // Update contact mutation
  const updateContactMutation = useMutation({
    mutationFn: ({ contactId, displayName }: { contactId: string; displayName: string }) =>
      updateContact(contactId, { displayName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setEditContactOpen(false);
      toast.success('Contact name updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update contact');
    },
  });

  // Pin conversation mutation
  const pinConversationMutation = useMutation({
    mutationFn: pinConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Conversation pinned');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to pin conversation');
    },
  });

  // Unpin conversation mutation
  const unpinConversationMutation = useMutation({
    mutationFn: unpinConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Conversation unpinned');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to unpin conversation');
    },
  });

  // Add note mutation
  const addNoteMutation = useMutation({
    mutationFn: ({ conversationId, content }: { conversationId: string; content: string }) =>
      addConversationNote(conversationId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversationNotes', selectedConversationId] });
      toast.success('Note added');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add note');
    },
  });

  // Delete note mutation
  const deleteNoteMutation = useMutation({
    mutationFn: deleteConversationNote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversationNotes', selectedConversationId] });
      toast.success('Note deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete note');
    },
  });

  // Fetch conversation notes
  const { data: conversationNotes } = useQuery({
    queryKey: ['conversationNotes', selectedConversationId],
    queryFn: () => selectedConversationId ? getConversationNotes(selectedConversationId) : null,
    enabled: !!selectedConversationId,
  });

  // Fetch group participants
  const { data: groupParticipants } = useQuery({
    queryKey: ['groupParticipants', selectedConversationId],
    queryFn: () => selectedConversationId ? getGroupParticipants(selectedConversationId) : null,
    enabled: !!selectedConversationId && !!selectedConversation && isGroupContact(selectedConversation.contact),
  });

  // Fetch scheduled messages
  const { data: scheduledMessages = [] } = useQuery({
    queryKey: ['scheduledMessages', selectedConversationId],
    queryFn: () => selectedConversationId ? listScheduledMessages(selectedConversationId) : [],
    enabled: !!selectedConversationId,
    refetchInterval: 30000, // Refresh every 30 seconds to update times
    select: (data) => Array.isArray(data) ? data : [],
  });

  // Cancel scheduled message mutation
  const cancelScheduledMutation = useMutation({
    mutationFn: cancelScheduledMessage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduledMessages', selectedConversationId] });
      toast.success('Scheduled message cancelled');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to cancel scheduled message');
    },
  });

  // Handle editing contact name
  const handleEditContact = () => {
    if (selectedConversation) {
      setEditContactName(selectedConversation.contact.displayName || '');
      setEditContactOpen(true);
    }
  };

  const handleSaveContactName = () => {
    if (selectedConversation && editContactName.trim()) {
      updateContactMutation.mutate({
        contactId: selectedConversation.contact.id,
        displayName: editContactName.trim(),
      });
    }
  };

  // Voice recording functions
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });

      audioChunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        // Create File object with proper typing
        const audioFile = new globalThis.File([audioBlob], 'voice-note.webm', { type: 'audio/webm' });

        // Set as selected media
        const preview = URL.createObjectURL(audioBlob);
        setSelectedMedia({ file: audioFile, preview, type: 'audio' });

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      toast.error('Could not access microphone');
      console.error('Microphone error:', error);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }
  }, [isRecording]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      audioChunksRef.current = [];

      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }

      // Stop the stream
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  }, [isRecording]);

  // Handle selecting a conversation
  const handleSelectConversation = useCallback(async (conversationId: string) => {
    // Clear active agent on previous conversation
    if (previousConversationRef.current) {
      clearActiveAgent(previousConversationRef.current).catch(() => {});
      leaveConversation(previousConversationRef.current);
    }

    setSelectedConversationId(conversationId);
    setActiveAgentWarning(null);
    setOtherActiveAgent(null);
    previousConversationRef.current = conversationId;
    joinConversation(conversationId);

    // Set this agent as active and check for collision
    try {
      const result = await setActiveAgent(conversationId);
      if (result.warning) {
        setActiveAgentWarning(result.warning);
        setOtherActiveAgent(result.activeAgent || null);
      }
    } catch {
      // Ignore errors
    }

    // Mark as read (only if not in incognito mode)
    if (!incognitoMode) {
      markConversationAsRead(conversationId).catch(() => {});
    }

    // Gamification: Small chance reward for viewing
    maybeReward('view');
  }, [joinConversation, leaveConversation, incognitoMode, maybeReward]);

  // Keyboard shortcuts for inbox
  const inboxShortcuts = useMemo<KeyboardShortcut[]>(() => {
    const conversations = conversationsData?.conversations || [];
    const currentIndex = conversations.findIndex((c) => c.id === selectedConversationId);

    return [
      // Navigation
      {
        key: 'j',
        description: 'Next conversation',
        category: 'navigation',
        action: () => {
          if (conversations.length === 0) return;
          const nextIndex = currentIndex < conversations.length - 1 ? currentIndex + 1 : 0;
          const nextConversation = conversations[nextIndex];
          if (nextConversation) {
            handleSelectConversation(nextConversation.id);
          }
        },
      },
      {
        key: 'k',
        description: 'Previous conversation',
        category: 'navigation',
        action: () => {
          if (conversations.length === 0) return;
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : conversations.length - 1;
          const prevConversation = conversations[prevIndex];
          if (prevConversation) {
            handleSelectConversation(prevConversation.id);
          }
        },
      },
      {
        key: 'n',
        description: 'Next unread conversation',
        category: 'navigation',
        action: () => {
          const unreadConversations = conversations.filter((c) => c.unreadCount > 0);
          if (unreadConversations.length === 0) return;
          // Find first unread after current, or wrap to first unread
          const currentUnreadIndex = unreadConversations.findIndex((c) => c.id === selectedConversationId);
          const nextUnread = unreadConversations[currentUnreadIndex + 1] || unreadConversations[0];
          if (nextUnread) {
            handleSelectConversation(nextUnread.id);
          }
        },
      },
      {
        key: '/',
        description: 'Focus search',
        category: 'navigation',
        action: () => {
          if (searchInputRef.current) {
            searchInputRef.current.focus();
            searchInputRef.current.select();
          }
        },
      },
      // Actions
      {
        key: 'r',
        description: 'Reply (focus message input)',
        category: 'actions',
        action: () => {
          if (selectedConversationId && messageInputRef.current) {
            messageInputRef.current.focus();
          }
        },
      },
      {
        key: 'e',
        description: 'Close conversation',
        category: 'actions',
        action: () => {
          if (selectedConversation && selectedConversation.status !== 'CLOSED') {
            closeConversationMutation.mutate(selectedConversation.id);
          }
        },
      },
      {
        key: 'o',
        description: 'Reopen conversation',
        category: 'actions',
        action: () => {
          if (selectedConversation && selectedConversation.status === 'CLOSED') {
            reopenConversationMutation.mutate(selectedConversation.id);
          }
        },
      },
      {
        key: 'p',
        description: 'Pin/Unpin conversation',
        category: 'actions',
        action: () => {
          if (selectedConversation) {
            if (selectedConversation.isPinned) {
              unpinConversationMutation.mutate(selectedConversation.id);
            } else {
              pinConversationMutation.mutate(selectedConversation.id);
            }
          }
        },
      },
      {
        key: 'i',
        description: 'Toggle contact info panel',
        category: 'navigation',
        action: () => {
          if (selectedConversationId) {
            setContactPanelOpen(!contactPanelOpen);
          }
        },
      },
      {
        key: '[',
        description: 'Toggle conversation list',
        category: 'navigation',
        action: () => {
          toggleConversationList();
        },
      },
      {
        key: 'f',
        ctrl: true,
        description: 'Search messages',
        category: 'navigation',
        action: () => {
          if (searchInputRef.current) {
            searchInputRef.current.focus();
            searchInputRef.current.select();
          }
        },
      },
      {
        key: 'Escape',
        description: 'Clear selection / Close panel',
        category: 'actions',
        action: () => {
          // Clear search first if active
          if (searchQuery) {
            setSearchQuery('');
            return;
          }
          // Close emoji picker first
          if (showEmojiPicker) {
            setShowEmojiPicker(null);
            return;
          }
          // Close active message menu
          if (activeMessageMenu) {
            setActiveMessageMenu(null);
            return;
          }
          // Close reply-to
          if (replyToMessage) {
            setReplyToMessage(null);
            return;
          }
          // Close contact panel
          if (contactPanelOpen) {
            setContactPanelOpen(false);
            return;
          }
          // Deselect conversation
          if (selectedConversationId) {
            setSelectedConversationId(null);
          }
        },
      },
    ];
  }, [
    conversationsData?.conversations,
    selectedConversationId,
    selectedConversation,
    closeConversationMutation,
    reopenConversationMutation,
    pinConversationMutation,
    unpinConversationMutation,
    contactPanelOpen,
    showEmojiPicker,
    activeMessageMenu,
    replyToMessage,
    handleSelectConversation,
    toggleConversationList,
  ]);

  useKeyboardShortcuts({ shortcuts: inboxShortcuts });

  // Handle file selection (from file input or paste)
  const handleFileSelect = useCallback((fileOrEvent: File | React.ChangeEvent<HTMLInputElement>) => {
    const file = 'target' in fileOrEvent ? fileOrEvent.target.files?.[0] : fileOrEvent;
    if (!file) return;

    // Determine media type
    let type: 'image' | 'video' | 'audio' | 'document';
    if (file.type.startsWith('image/')) {
      type = 'image';
    } else if (file.type.startsWith('video/')) {
      type = 'video';
    } else if (file.type.startsWith('audio/')) {
      type = 'audio';
    } else {
      type = 'document';
    }

    // Create preview URL
    const preview = URL.createObjectURL(file);
    setSelectedMedia({ file, preview, type });

    // Reset file input if it was from input element
    if ('target' in fileOrEvent && fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Handle paste from clipboard (images)
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    // Convert DataTransferItemList to array for iteration
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          // Create a named file for better UX
          const FileConstructor = window.File;
          const namedFile = new FileConstructor([file], `pasted-image-${Date.now()}.png`, { type: file.type });
          handleFileSelect(namedFile);
          toast.success('Image pasted');
        }
        break;
      }
    }
  }, [handleFileSelect]);

  // Clear selected media
  const clearSelectedMedia = useCallback(() => {
    if (selectedMedia?.preview) {
      URL.revokeObjectURL(selectedMedia.preview);
    }
    setSelectedMedia(null);
  }, [selectedMedia]);

  // Handle sending a message
  const handleSendMessage = useCallback(async () => {
    if ((!messageText.trim() && !selectedMedia) || !selectedConversationId) return;

    // Capture values before clearing
    const textToSend = messageText.trim() || undefined;
    const mediaToUpload = selectedMedia;
    const quoteId = replyToMessage?.externalId || undefined;

    // Clear input immediately for better UX
    setMessageText('');
    clearSelectedMedia();
    setReplyToMessage(null);

    try {
      // If we have media, show optimistic message with local preview immediately
      if (mediaToUpload) {
        // Create local preview data for instant display
        const localPreview = {
          type: mediaToUpload.type,
          url: mediaToUpload.preview,
          mimetype: mediaToUpload.file.type,
          filename: mediaToUpload.file.name,
        };

        // Show optimistic message immediately with local preview
        sendMessageMutation.mutate({
          conversationId: selectedConversationId,
          text: textToSend,
          localPreview,
          quotedMessageId: quoteId,
        } as any);

        // Upload media in background
        setIsUploading(true);
        try {
          const uploaded = await uploadMedia(mediaToUpload.file);
          // Now send the actual message with uploaded URL
          // The optimistic update will be replaced by server response
          await sendMessage({
            conversationId: selectedConversationId,
            text: textToSend,
            media: {
              type: uploaded.type,
              url: uploaded.url,
              mimetype: uploaded.mimetype,
              filename: uploaded.filename,
            },
            quotedMessageId: quoteId,
          });
          // Refetch to get the real message
          queryClient.invalidateQueries({ queryKey: ['messages', selectedConversationId] });
        } catch (error) {
          toast.error('Failed to upload media');
          // Rollback will happen via mutation error handling
        } finally {
          setIsUploading(false);
        }
      } else {
        // Text-only message - simple optimistic flow
        sendMessageMutation.mutate({
          conversationId: selectedConversationId,
          text: textToSend,
          quotedMessageId: quoteId,
        });
      }
    } catch (error) {
      toast.error('Failed to send message');
    }
  }, [messageText, selectedMedia, selectedConversationId, sendMessageMutation, clearSelectedMedia, replyToMessage, queryClient]);

  // Handle typing
  const handleTyping = useCallback(() => {
    if (!selectedConversationId) return;

    startTyping(selectedConversationId);

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping(selectedConversationId);
    }, 2000);
  }, [selectedConversationId, startTyping, stopTyping]);

  // Handle slash command selection
  const handleSlashCommandSelect = useCallback(async (item: SlashCommandItem) => {
    const slashStart = messageText.lastIndexOf('/');

    if (item.type === 'quickReply') {
      // Quick Reply: fill chat box with text (user can edit before sending)
      const quickReply = item.data as QuickReply;
      const newText = messageText.substring(0, slashStart) + quickReply.content.text;
      setMessageText(newText);
    } else {
      // Sequence: start execution (worker handles sending all steps)
      const sequence = item.data;

      // Clear the slash command from input
      const newText = messageText.substring(0, slashStart);
      setMessageText(newText);

      if (!selectedConversationId) {
        toast.error('No conversation selected');
        setSlashCommandOpen(false);
        setSlashSearchTerm('');
        return;
      }

      try {
        // Start sequence execution - worker will send all steps
        await startSequenceExecution(sequence.id, selectedConversationId);
        toast.success(`Started sequence: ${sequence.name}`);
      } catch (error: any) {
        console.error('Failed to start sequence:', error);
        toast.error(error.message || 'Failed to start sequence');
      }
    }

    setSlashCommandOpen(false);
    setSlashSearchTerm('');

    // Focus the input
    messageInputRef.current?.focus();
  }, [messageText, selectedConversationId]);

  // Handle message input change with slash command detection
  const handleMessageInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessageText(value);
    handleTyping();

    // Check for slash command
    const lastSlashIndex = value.lastIndexOf('/');
    if (lastSlashIndex !== -1) {
      // Check if slash is at start or after a space (not in the middle of a word)
      const charBeforeSlash = value[lastSlashIndex - 1];
      if (lastSlashIndex === 0 || charBeforeSlash === ' ' || charBeforeSlash === '\n') {
        const searchTerm = value.substring(lastSlashIndex + 1);
        // Only show popup if there's no space after the slash (still typing the command)
        if (!searchTerm.includes(' ')) {
          setSlashSearchTerm(searchTerm);
          setSlashCommandOpen(true);
          return;
        }
      }
    }

    // Close popup if no valid slash command
    if (slashCommandOpen) {
      setSlashCommandOpen(false);
      setSlashSearchTerm('');
    }
  }, [handleTyping, slashCommandOpen]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesData?.messages]);

  // In-conversation message search - uses existing searchQuery when conversation is selected
  const messageSearchResults = useMemo(() => {
    if (!selectedConversationId || !searchQuery.trim() || !messagesData?.messages) return [];
    const query = searchQuery.toLowerCase();
    return messagesData.messages
      .filter((msg) => {
        const text = msg.content.text?.toLowerCase() || '';
        const caption = msg.content.caption?.toLowerCase() || '';
        return text.includes(query) || caption.includes(query);
      })
      .map((msg) => msg.id);
  }, [selectedConversationId, searchQuery, messagesData?.messages]);

  // Navigate to search result
  const scrollToSearchResult = useCallback((index: number) => {
    if (messageSearchResults.length === 0) return;
    const messageId = messageSearchResults[index];
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
      }, 2000);
    }
  }, [messageSearchResults]);

  // Navigate to next/previous search result
  const nextSearchResult = useCallback(() => {
    if (messageSearchResults.length === 0) return;
    const newIndex = (messageSearchIndex + 1) % messageSearchResults.length;
    setMessageSearchIndex(newIndex);
    scrollToSearchResult(newIndex);
  }, [messageSearchResults.length, messageSearchIndex, scrollToSearchResult]);

  const prevSearchResult = useCallback(() => {
    if (messageSearchResults.length === 0) return;
    const newIndex = messageSearchIndex === 0 ? messageSearchResults.length - 1 : messageSearchIndex - 1;
    setMessageSearchIndex(newIndex);
    scrollToSearchResult(newIndex);
  }, [messageSearchResults.length, messageSearchIndex, scrollToSearchResult]);

  // Reset search index when query or conversation changes
  useEffect(() => {
    setMessageSearchIndex(0);
  }, [searchQuery, selectedConversationId]);

  // Auto-scroll to first result when search produces results
  useEffect(() => {
    if (messageSearchResults.length > 0 && searchQuery.trim()) {
      scrollToSearchResult(0);
    }
  }, [messageSearchResults.length, searchQuery]); // Only when results change, not on every navigation

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    // New message handler
    const handleNewMessage = (data: { message?: Message; conversationId: string }) => {
      // Deduplicate: skip if current user sent this message (already shown via optimistic UI)
      // Only skip if we have a message object AND it was sent by current user
      if (data.message?.sentByUser?.id === user?.id) {
        return;
      }

      // Remove any temp/pending messages from the same sender to prevent brief duplicates
      if (data.conversationId && data.message?.sentByUser?.id) {
        queryClient.setQueryData(['messages', data.conversationId], (old: any) => {
          if (!old?.messages) return old;
          return {
            ...old,
            messages: old.messages.filter((m: any) =>
              // Keep messages that are NOT temp messages from this sender
              !(m.id?.startsWith('temp-') && m.sentByUser?.id === data.message?.sentByUser?.id)
            ),
          };
        });
      }

      // Invalidate queries to refetch - server handles deduplication
      if (data.conversationId) {
        queryClient.invalidateQueries({ queryKey: ['messages', data.conversationId] });
      }
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };

    // Typing indicators
    const handleTypingStart = (data: { conversationId: string; userId: string; userName: string }) => {
      if (data.conversationId === selectedConversationId) {
        setTypingUsers((prev) => new Map(prev).set(data.userId, data.userName));
      }
    };

    const handleTypingStop = (data: { conversationId: string; userId: string }) => {
      if (data.conversationId === selectedConversationId) {
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.delete(data.userId);
          return next;
        });
      }
    };

    // Conversation updates
    const handleConversationUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };

    // Agent collision handlers
    const handleAgentActive = (data: { conversationId: string; agentId: string; agentName: string }) => {
      if (data.conversationId === selectedConversationId && data.agentId !== user?.id) {
        setActiveAgentWarning(`${data.agentName} is now viewing this conversation`);
        setOtherActiveAgent({ id: data.agentId, name: data.agentName });
      }
    };

    const handleAgentLeft = (data: { conversationId: string; agentId: string }) => {
      if (data.conversationId === selectedConversationId && data.agentId === otherActiveAgent?.id) {
        setActiveAgentWarning(null);
        setOtherActiveAgent(null);
      }
    };

    // Reaction updates
    const handleReaction = (data: { messageId: string; emoji: string; reactions: MessageReaction[] }) => {
      queryClient.invalidateQueries({ queryKey: ['messages', selectedConversationId] });
    };

    // Handle pending messages from other agents (shared optimistic UI)
    const handlePendingMessage = (data: { conversationId: string; message: any }) => {
      if (data.conversationId === selectedConversationId) {
        queryClient.setQueryData(['messages', data.conversationId], (old: any) => {
          if (!old?.messages) return old;
          // Check if message with this ID already exists (avoid duplicates)
          if (old.messages.some((m: any) => m.id === data.message.id)) return old;
          return {
            ...old,
            messages: [...old.messages, data.message],
          };
        });
      }
    };

    // Handle history loaded event - refresh messages when on-demand sync completes
    const handleHistoryLoaded = (data: { conversationId: string; messageCount: number; isLatest?: boolean }) => {
      if (data.conversationId === selectedConversationId && data.messageCount > 0) {
        console.log(`[HistoryFetch] Loaded ${data.messageCount} messages (complete: ${data.isLatest ?? 'unknown'})`);
        queryClient.invalidateQueries({ queryKey: ['messages', data.conversationId] });
      }
    };

    socket.on('message:new', handleNewMessage);
    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);
    socket.on('conversation:updated', handleConversationUpdated);
    socket.on('agent:active', handleAgentActive);
    socket.on('agent:left', handleAgentLeft);
    socket.on('message:reaction', handleReaction);
    socket.on('message:pending', handlePendingMessage);
    socket.on('history:loaded', handleHistoryLoaded);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
      socket.off('conversation:updated', handleConversationUpdated);
      socket.off('agent:active', handleAgentActive);
      socket.off('agent:left', handleAgentLeft);
      socket.off('message:reaction', handleReaction);
      socket.off('message:pending', handlePendingMessage);
      socket.off('history:loaded', handleHistoryLoaded);
    };
  }, [socket, selectedConversationId, queryClient, user?.id, otherActiveAgent?.id]);

  // Cleanup active agent on unmount
  useEffect(() => {
    return () => {
      if (previousConversationRef.current) {
        clearActiveAgent(previousConversationRef.current).catch(() => {});
      }
    };
  }, []);

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Conversation List Panel */}
      <div
        className={cn(
          'border-r flex flex-col transition-all duration-200 ease-in-out flex-shrink-0 overflow-hidden',
          conversationListCollapsed ? 'w-0' : 'w-full md:w-[280px] lg:w-[320px]',
          // On mobile: hide list when conversation is selected
          selectedConversationId && 'hidden md:flex'
        )}
      >
        {/* Search and Filter */}
        <div className="p-3 sm:p-4 border-b space-y-2 sm:space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder={selectedConversationId ? "Search messages... (Ctrl+F)" : "Search conversations..."}
              className={cn(
                "pl-9 h-9 sm:h-10 text-sm",
                messageSearchResults.length > 0 ? "pr-24" : "pr-8"
              )}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                // Navigate search results with arrow keys
                if (messageSearchResults.length > 0) {
                  if (e.key === 'ArrowDown' || e.key === 'Enter') {
                    e.preventDefault();
                    nextSearchResult();
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    prevSearchResult();
                  }
                }
              }}
            />
            {/* Message search navigation - show when there are results */}
            {messageSearchResults.length > 0 && selectedConversationId ? (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {messageSearchIndex + 1}/{messageSearchResults.length}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={prevSearchResult}
                  title="Previous result (↑)"
                >
                  <ChevronUp className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={nextSearchResult}
                  title="Next result (↓)"
                >
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              /* Keyboard shortcut hint */
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/60 hidden md:block font-mono">/</span>
            )}
          </div>
          {/* Tag filter chips */}
          <div className="flex gap-1 flex-wrap">
            {allTags?.filter((tag) => tag?.id).slice(0, 5).map((tag) => (
              <Button
                key={tag.id}
                variant={selectedTagIds.includes(tag.id) ? 'default' : 'outline'}
                size="sm"
                className="text-xs h-6 sm:h-7 gap-1 px-2"
                onClick={() => {
                  setSelectedTagIds((prev) =>
                    prev.includes(tag.id)
                      ? prev.filter((id) => id !== tag.id)
                      : [...prev, tag.id]
                  );
                }}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: tag.color || '#6b7280' }}
                />
                <span className="truncate max-w-[60px]">{tag.name}</span>
              </Button>
            ))}
            {selectedTagIds.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-6 sm:h-7 px-2"
                onClick={() => setSelectedTagIds([])}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Conversation List */}
        <ScrollArea className="flex-1">
          {isLoadingConversations ? (
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
          ) : conversationsData?.conversations.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No conversations found</p>
            </div>
          ) : (
            <div className="divide-y">
              {conversationsData?.conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={cn(
                    'group/conv relative p-3 sm:p-4 cursor-pointer hover:bg-muted/50 transition-colors active:bg-muted',
                    selectedConversationId === conversation.id && 'bg-muted'
                  )}
                  onClick={() => handleSelectConversation(conversation.id)}
                >
                  {/* Quick actions - hover only on desktop */}
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden md:flex gap-1 opacity-0 group-hover/conv:opacity-100 transition-opacity z-10">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 bg-background/80 hover:bg-background shadow-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (conversation.isPinned) {
                          unpinConversationMutation.mutate(conversation.id);
                        } else {
                          pinConversationMutation.mutate(conversation.id);
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
                          closeConversationMutation.mutate(conversation.id);
                        }}
                        title="Close conversation"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-start gap-2.5 sm:gap-3 group">
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
                        <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] sm:text-xs flex items-center justify-center font-medium">
                          {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
                        </span>
                      )}
                      {isGroupContact(conversation.contact) && (
                        <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full bg-green-500 text-white flex items-center justify-center">
                          <Users className="h-2 w-2 sm:h-2.5 sm:w-2.5" />
                        </span>
                      )}
                    </div>
                    {/* Tag dropdown beside avatar - hidden on mobile */}
                    <div className="hidden sm:block">
                      <TagDropdown
                        conversationId={conversation.id}
                        currentTags={conversation.tags || []}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 flex-1">
                          {conversation.isPinned && (
                            <Pin className="h-3 w-3 text-primary flex-shrink-0" />
                          )}
                          <p className="font-medium truncate text-sm sm:text-base">
                            {getContactName(conversation.contact)}
                          </p>
                        </div>
                        <span className="text-[10px] sm:text-xs text-muted-foreground flex-shrink-0">
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
          )}
        </ScrollArea>
        {/* Keyboard shortcuts hint - desktop only */}
        <div className="hidden md:flex items-center justify-center gap-4 px-3 py-2 border-t bg-muted/30 text-[10px] text-muted-foreground">
          <span><kbd className="px-1 py-0.5 bg-muted rounded font-mono">J</kbd>/<kbd className="px-1 py-0.5 bg-muted rounded font-mono">K</kbd> navigate</span>
          <span><kbd className="px-1 py-0.5 bg-muted rounded font-mono">N</kbd> next unread</span>
          <span><kbd className="px-1 py-0.5 bg-muted rounded font-mono">R</kbd> reply</span>
        </div>
      </div>

      {/* Chat Panel */}
      <div className={cn(
        'flex-1 flex flex-col min-w-0 overflow-hidden',
        // On mobile: hide chat when no conversation selected
        !selectedConversationId && 'hidden md:flex'
      )}>
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="h-14 sm:h-16 border-b flex items-center justify-between px-2 sm:px-4">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                {/* Back button for mobile */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedConversationId(null)}
                  className="flex-shrink-0 md:hidden h-9 w-9"
                  title="Back to conversations"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                {/* Toggle conversation list - hidden on mobile */}
                <Button
                  variant={conversationListCollapsed ? "ghost" : "secondary"}
                  size="icon"
                  onClick={toggleConversationList}
                  className="flex-shrink-0 hidden md:flex h-9 w-9"
                  title={conversationListCollapsed ? 'Show conversations ([)' : 'Hide conversations ([)'}
                >
                  {conversationListCollapsed ? (
                    <PanelLeft className="h-5 w-5" />
                  ) : (
                    <PanelLeftClose className="h-5 w-5" />
                  )}
                </Button>
                <div className="relative flex-shrink-0">
                  <Avatar className="h-9 w-9 sm:h-10 sm:w-10">
                    <AvatarImage src={selectedConversation.contact.avatarUrl || undefined} className="object-cover" />
                    <AvatarFallback className="text-sm">
                      {isGroupContact(selectedConversation.contact) ? (
                        <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                      ) : (
                        getContactInitials(selectedConversation.contact)
                      )}
                    </AvatarFallback>
                  </Avatar>
                  {isGroupContact(selectedConversation.contact) && (
                    <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full bg-green-500 text-white flex items-center justify-center">
                      <Users className="h-2 w-2 sm:h-2.5 sm:w-2.5" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <p className="font-medium text-sm sm:text-base truncate">{getContactName(selectedConversation.contact)}</p>
                    {isGroupContact(selectedConversation.contact) && (
                      <span className="text-[10px] sm:text-xs bg-green-500/10 text-green-600 px-1 sm:px-1.5 py-0.5 rounded flex-shrink-0">Group</span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground truncate">
                    {isGroupContact(selectedConversation.contact)
                      ? <span className="hidden sm:inline">Group ID: </span>
                      : '+'}
                    {selectedConversation.contact.identifier}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                {/* Incognito Mode Toggle */}
                <Button
                  variant={incognitoMode ? 'default' : 'ghost'}
                  size="icon"
                  onClick={async () => {
                    const newValue = !incognitoMode;
                    setIncognitoMode(newValue);
                    localStorage.setItem('incognitoMode', String(newValue));

                    // Call backend API to set incognito mode on the channel
                    if (selectedConversation?.channelId) {
                      try {
                        await setIncognitoModeApi(selectedConversation.channelId, newValue);
                        toast.success(
                          newValue
                            ? 'Stealth mode ON - You appear offline, no typing indicators or read receipts'
                            : 'Stealth mode OFF - Normal presence restored'
                        );
                      } catch (error) {
                        toast.error('Failed to update incognito mode on server');
                        // Still works locally even if backend fails
                      }
                    } else {
                      toast.success(newValue ? 'Incognito mode ON - Read receipts disabled' : 'Incognito mode OFF - Read receipts enabled');
                    }
                  }}
                  title={incognitoMode ? 'Stealth ON (click to disable)' : 'Stealth OFF (click to enable)'}
                  className={cn(
                    'h-8 w-8 sm:h-9 sm:w-9',
                    incognitoMode ? 'bg-purple-600 hover:bg-purple-700 text-white' : ''
                  )}
                >
                  {incognitoMode ? <EyeOff className="h-4 w-4 sm:h-5 sm:w-5" /> : <Eye className="h-4 w-4 sm:h-5 sm:w-5" />}
                </Button>
                <Button
                  variant={contactPanelOpen ? "secondary" : "ghost"}
                  size="icon"
                  onClick={() => setContactPanelOpen(!contactPanelOpen)}
                  title={contactPanelOpen ? "Hide contact info (I)" : "Show contact info (I)"}
                  className="h-8 w-8 sm:h-9 sm:w-9"
                >
                  {contactPanelOpen ? (
                    <PanelRightClose className="h-4 w-4 sm:h-5 sm:w-5" />
                  ) : (
                    <PanelRight className="h-4 w-4 sm:h-5 sm:w-5" />
                  )}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9">
                      <MoreVertical className="h-4 w-4 sm:h-5 sm:w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {selectedConversation.isPinned ? (
                      <DropdownMenuItem
                        onClick={() => unpinConversationMutation.mutate(selectedConversation.id)}
                      >
                        <PinOff className="h-4 w-4 mr-2" />
                        <span className="flex-1">Unpin conversation</span>
                        <span className="ml-4 text-xs text-muted-foreground font-mono">P</span>
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => pinConversationMutation.mutate(selectedConversation.id)}
                      >
                        <Pin className="h-4 w-4 mr-2" />
                        <span className="flex-1">Pin conversation</span>
                        <span className="ml-4 text-xs text-muted-foreground font-mono">P</span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {selectedConversation.status === 'CLOSED' ? (
                      <DropdownMenuItem
                        onClick={() => reopenConversationMutation.mutate(selectedConversation.id)}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        <span className="flex-1">Reopen conversation</span>
                        <span className="ml-4 text-xs text-muted-foreground font-mono">O</span>
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => closeConversationMutation.mutate(selectedConversation.id)}
                      >
                        <Check className="h-4 w-4 mr-2" />
                        <span className="flex-1">Close conversation</span>
                        <span className="ml-4 text-xs text-muted-foreground font-mono">E</span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>Assign to...</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Agent Collision Warning */}
            {activeAgentWarning && (
              <div className="bg-yellow-100 dark:bg-yellow-900/20 border-l-4 border-yellow-500 text-yellow-800 dark:text-yellow-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                  <span className="text-sm font-medium">{activeAgentWarning}</span>
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 relative overflow-hidden">
              {/* Logo Watermark */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                <img
                  src="/logo.png"
                  alt=""
                  className="w-24 sm:w-32 h-auto opacity-[0.35]"
                />
              </div>
              <ScrollArea className="h-full p-2 sm:p-4 relative z-10">
              {isLoadingMessages ? (
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
              ) : (
                <div className="space-y-2">
                  {messagesData?.messages.map((message, index) => {
                    const messageDate = new Date(message.createdAt);
                    const prevMessage = index > 0 ? messagesData.messages[index - 1] : null;
                    const showDateSeparator = !prevMessage || !isSameDay(messageDate, new Date(prevMessage.createdAt));

                    return (
                      <div key={message.id}>
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
                            'flex gap-1.5 sm:gap-2 items-end transition-all duration-300',
                            message.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'
                          )}
                        >
                          {message.direction === 'INBOUND' && (
                            <Avatar className="h-6 w-6 sm:h-7 sm:w-7 flex-shrink-0">
                              {/* For group messages, show sender's avatar if available */}
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
                              // Toggle message menu on tap for mobile
                              if (window.matchMedia('(max-width: 768px)').matches) {
                                setActiveMessageMenu(activeMessageMenu === message.id ? null : message.id);
                              }
                            }}
                          >
                            {/* Message actions (hover on desktop, tap on mobile) */}
                            <div className={cn(
                              'absolute top-0 transition-opacity flex gap-1 z-10',
                              message.direction === 'OUTBOUND' ? 'left-0 -translate-x-full pr-2' : 'right-0 translate-x-full pl-2',
                              // Show on hover (desktop) OR when tapped (mobile)
                              activeMessageMenu === message.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            )}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 bg-background shadow-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReplyToMessage(message);
                                }}
                                title="Reply"
                              >
                                <Reply className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 bg-background shadow-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowEmojiPicker(showEmojiPicker === message.id ? null : message.id);
                                }}
                                title="React"
                              >
                                <Smile className="h-4 w-4" />
                              </Button>
                              {/* More actions dropdown */}
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
                                  {/* Parse Order - for text messages (runs in background) */}
                                  {message.type === 'TEXT' && message.content.text && (
                                    <DropdownMenuItem
                                      onClick={() => parseOrderMutation.mutate(message.content.text || '')}
                                    >
                                      <Wand2 className="h-4 w-4 mr-2" />
                                      Parse Order
                                    </DropdownMenuItem>
                                  )}
                                  {/* Edit - only for outbound text messages */}
                                  {message.direction === 'OUTBOUND' && message.type === 'TEXT' && message.externalId && (
                                    <DropdownMenuItem
                                      onClick={() => setEditingMessage({ id: message.id, text: message.content.text || '' })}
                                    >
                                      <Edit className="h-4 w-4 mr-2" />
                                      Edit message
                                    </DropdownMenuItem>
                                  )}
                                  {/* Delete for me */}
                                  <DropdownMenuItem
                                    onClick={() => setDeletingMessage({ id: message.id, forEveryone: false })}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete for me
                                  </DropdownMenuItem>
                                  {/* Delete for everyone - only for outbound messages */}
                                  {message.direction === 'OUTBOUND' && message.externalId && (
                                    <DropdownMenuItem
                                      onClick={() => setDeletingMessage({ id: message.id, forEveryone: true })}
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
                                {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) => (
                                  <button
                                    key={emoji}
                                    className="text-lg hover:bg-muted rounded p-1 transition-colors"
                                    onClick={() => message.externalId && reactToMessageMutation.mutate({ messageId: message.id, emoji })}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}

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
                                  {/* For group messages, show the actual sender from metadata */}
                                  {isGroupContact(selectedConversation.contact) && message.metadata?.groupSender
                                    ? message.metadata.groupSender.displayName || message.metadata.groupSender.pushName || `+${message.metadata.groupSender.identifier}`
                                    : getContactName(selectedConversation.contact)}
                                </p>
                              )}

                              {/* Quoted message (reply) */}
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

                              {message.type === 'TEXT' && (
                                <p className="text-sm whitespace-pre-wrap break-words">{formatWhatsAppText(message.content.text || '')}</p>
                              )}
                              {message.type === 'IMAGE' && (
                                <div className="space-y-2">
                                  {message.content.mediaUrl ? (
                                    <div className="relative group/media">
                                      <img
                                        src={message.content.mediaUrl}
                                        alt="Image"
                                        className="max-w-[280px] max-h-[280px] rounded object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                        onClick={() => setMediaPreview({ url: message.content.mediaUrl, type: 'image' })}
                                      />
                                      <Button
                                        variant="secondary"
                                        size="icon"
                                        className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover/media:opacity-100 transition-opacity"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          downloadFile(message.content.mediaUrl, `image-${message.id}.jpg`);
                                        }}
                                      >
                                        <Download className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="h-32 w-32 bg-black/10 rounded flex items-center justify-center">
                                      <ImageIcon className="h-8 w-8 opacity-50" />
                                    </div>
                                  )}
                                  {(message.content.caption || message.content.text) && (
                                    <p className="text-sm whitespace-pre-wrap break-words">{formatWhatsAppText(message.content.caption || message.content.text || '')}</p>
                                  )}
                                </div>
                              )}

                              {message.type === 'VIDEO' && (
                                <div className="space-y-2">
                                  {message.content.mediaUrl ? (
                                    <div className="relative group/media">
                                      <div
                                        className="relative cursor-pointer"
                                        onClick={() => setMediaPreview({ url: message.content.mediaUrl, type: 'video' })}
                                      >
                                        <video
                                          src={message.content.mediaUrl}
                                          preload="metadata"
                                          playsInline
                                          className="max-w-[280px] max-h-[280px] rounded"
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded hover:bg-black/30 transition-colors">
                                          <Play className="h-12 w-12 text-white" />
                                        </div>
                                      </div>
                                      <Button
                                        variant="secondary"
                                        size="icon"
                                        className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover/media:opacity-100 transition-opacity"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          downloadFile(message.content.mediaUrl, `video-${message.id}.mp4`);
                                        }}
                                      >
                                        <Download className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="h-32 w-32 bg-black/10 rounded flex items-center justify-center">
                                      <span className="text-2xl">🎬</span>
                                    </div>
                                  )}
                                  {(message.content.caption || message.content.text) && (
                                    <p className="text-sm whitespace-pre-wrap break-words">{formatWhatsAppText(message.content.caption || message.content.text || '')}</p>
                                  )}
                                </div>
                              )}

                              {message.type === 'AUDIO' && (
                                <div className="flex items-center gap-2 min-w-[180px]">
                                  {message.content.mediaUrl ? (
                                    <>
                                      <div className={cn(
                                        'flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center',
                                        message.direction === 'OUTBOUND' ? 'bg-primary-foreground/20' : 'bg-primary/20'
                                      )}>
                                        <Mic className={cn(
                                          'h-4 w-4',
                                          message.direction === 'OUTBOUND' ? 'text-primary-foreground' : 'text-primary'
                                        )} />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <audio
                                          src={message.content.mediaUrl}
                                          controls
                                          className="w-full h-8"
                                          style={{ maxWidth: '180px' }}
                                        />
                                      </div>
                                    </>
                                  ) : (
                                    <div className="flex items-center gap-2 text-sm">
                                      <Mic className="h-4 w-4" />
                                      <span>Voice message</span>
                                    </div>
                                  )}
                                </div>
                              )}

                              {message.type === 'DOCUMENT' && (
                                <div className="space-y-2">
                                  <div className={cn(
                                    'flex items-center gap-2 p-2 rounded min-w-[180px]',
                                    message.direction === 'OUTBOUND' ? 'bg-primary-foreground/10' : 'bg-background/50'
                                  )}>
                                    {getDocumentIcon(message.content.fileName, message.content.mimeType)}
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate">
                                        {message.content.fileName || 'Document'}
                                      </p>
                                      <p className={cn(
                                        'text-xs',
                                        message.direction === 'OUTBOUND' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                                      )}>
                                        {message.content.fileName?.split('.').pop()?.toUpperCase() || 'FILE'}
                                      </p>
                                    </div>
                                    {message.content.mediaUrl && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 flex-shrink-0"
                                        onClick={() => downloadFile(message.content.mediaUrl, message.content.fileName || `document-${message.id}`)}
                                      >
                                        <Download className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </div>
                                  {message.content.caption && (
                                    <p className="text-sm">{message.content.caption}</p>
                                  )}
                                </div>
                              )}

                              {message.type === 'STICKER' && (
                                <div>
                                  {message.content.mediaUrl ? (
                                    <img
                                      src={message.content.mediaUrl}
                                      alt="Sticker"
                                      className="w-24 h-24 object-contain"
                                    />
                                  ) : (
                                    <span className="text-4xl">🎭</span>
                                  )}
                                </div>
                              )}

                              {/* Time and status */}
                              <div className={cn(
                                'flex items-center gap-1 mt-1',
                                message.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'
                              )}>
                                <span className={cn(
                                  'text-[10px]',
                                  message.direction === 'OUTBOUND'
                                    ? 'text-primary-foreground/70'
                                    : 'text-muted-foreground'
                                )}>
                                  {new Date(message.createdAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                                {message.direction === 'OUTBOUND' && (
                                  <MessageStatusIcon status={message.status} />
                                )}
                              </div>

                              {/* Reactions display */}
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
              )}

              {/* Typing indicator */}
              {typingUsers.size > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-4">
                  <div className="flex gap-1">
                    <span className="animate-bounce">.</span>
                    <span className="animate-bounce delay-100">.</span>
                    <span className="animate-bounce delay-200">.</span>
                  </div>
                  {Array.from(typingUsers.values()).join(', ')} is typing
                </div>
              )}
            </ScrollArea>
            </div>

            {/* Scheduled Messages Banner */}
            {scheduledMessages.filter(m => m.status === 'PENDING').length > 0 && (
              <div className="px-4 py-2 border-t bg-blue-50/50 dark:bg-blue-900/10">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                    Scheduled ({scheduledMessages.filter(m => m.status === 'PENDING').length})
                  </span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {scheduledMessages
                    .filter(m => m.status === 'PENDING')
                    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
                    .map((scheduled) => (
                      <div
                        key={scheduled.id}
                        className="flex-shrink-0 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 text-sm border border-blue-200 dark:border-blue-800 shadow-sm max-w-[250px]"
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="truncate text-foreground text-xs">
                              {scheduled.content.text || (
                                scheduled.content.mediaType === 'image' ? '📷 Image' :
                                scheduled.content.mediaType === 'video' ? '🎬 Video' :
                                scheduled.content.mediaType === 'audio' ? '🎵 Audio' :
                                scheduled.content.mediaType === 'document' ? '📄 Document' :
                                'Message'
                              )}
                            </p>
                            <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5">
                              {format(new Date(scheduled.scheduledAt), 'MMM d, h:mm a')}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 flex-shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => cancelScheduledMutation.mutate(scheduled.id)}
                            disabled={cancelScheduledMutation.isPending}
                            title="Cancel"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Message Input */}
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
                        {replyToMessage.content.text ||
                         replyToMessage.content.caption ||
                         `[${replyToMessage.type}]`}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 flex-shrink-0"
                      onClick={() => setReplyToMessage(null)}
                    >
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
                        <img
                          src={selectedMedia.preview}
                          alt="Preview"
                          className="max-h-24 sm:max-h-32 rounded object-contain"
                        />
                      )}
                      {selectedMedia.type === 'video' && (
                        <video
                          src={selectedMedia.preview}
                          className="max-h-24 sm:max-h-32 rounded"
                          controls
                        />
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 flex-shrink-0"
                      onClick={clearSelectedMedia}
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
                onChange={handleFileSelect}
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={cancelRecording}
                    title="Cancel"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="default"
                    size="icon"
                    className="h-8 w-8 bg-red-500 hover:bg-red-600"
                    onClick={stopRecording}
                    title="Stop and send"
                  >
                    <Square className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-end gap-1 sm:gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={selectedConversation.status === 'CLOSED'}
                    className="h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0"
                  >
                    <Paperclip className="h-4 w-4 sm:h-5 sm:w-5" />
                  </Button>
                  <div className="relative flex-1 min-w-0">
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
                    <Textarea
                      ref={messageInputRef}
                      placeholder={selectedMedia ? "Add caption..." : "Type a message... (Shift+Enter for new line)"}
                      value={messageText}
                      onChange={(e) => {
                        handleMessageInputChange(e);
                        // Auto-resize textarea
                        const textarea = e.target;
                        textarea.style.height = 'auto';
                        textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
                      }}
                      onPaste={handlePaste}
                      onKeyDown={(e) => {
                        // Let slash command popup handle Enter/Tab
                        if (slashCommandOpen && (e.key === 'Enter' || e.key === 'Tab' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                          return;
                        }
                        // Send on Enter, new line on Shift+Enter
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                          // Reset height after sending
                          const textarea = e.target as HTMLTextAreaElement;
                          textarea.style.height = 'auto';
                        }
                      }}
                      disabled={selectedConversation.status === 'CLOSED'}
                      className="min-h-[36px] sm:min-h-[40px] max-h-[120px] py-2 text-sm resize-none overflow-y-auto"
                      rows={1}
                    />
                  </div>
                  {/* Emoji button - hidden on small mobile */}
                  <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-10 sm:w-10 hidden sm:flex flex-shrink-0">
                    <Smile className="h-4 w-4 sm:h-5 sm:w-5" />
                  </Button>
                  {/* Schedule button - only show when there's content, hidden on mobile */}
                  {(messageText.trim() || selectedMedia) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setScheduleDialogOpen(true)}
                      disabled={selectedConversation.status === 'CLOSED'}
                      title="Schedule message"
                      className="h-9 w-9 sm:h-10 sm:w-10 hidden sm:flex flex-shrink-0"
                    >
                      <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
                    </Button>
                  )}
                  {/* Show mic button when no text, send button when there's text or media */}
                  {!messageText.trim() && !selectedMedia ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={startRecording}
                      disabled={selectedConversation.status === 'CLOSED'}
                      title="Record voice note"
                      className="h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0"
                    >
                      <Mic className="h-4 w-4 sm:h-5 sm:w-5" />
                    </Button>
                  ) : (
                    <Button
                      onClick={handleSendMessage}
                      disabled={(!messageText.trim() && !selectedMedia) || sendMessageMutation.isPending || isUploading || selectedConversation.status === 'CLOSED'}
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
              {selectedConversation.status === 'CLOSED' && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  This conversation is closed.{' '}
                  <button
                    className="text-primary hover:underline"
                    onClick={() => reopenConversationMutation.mutate(selectedConversation.id)}
                  >
                    Reopen it
                  </button>{' '}
                  to send messages.
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col">
            {/* Empty state header with toggle */}
            {conversationListCollapsed && (
              <div className="h-16 border-b flex items-center px-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleConversationList}
                  title="Show conversations"
                >
                  <PanelLeft className="h-5 w-5" />
                </Button>
              </div>
            )}
            <div className="flex-1 flex items-center justify-center text-muted-foreground p-4">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-3 sm:mb-4 opacity-50" />
                <p className="text-base sm:text-lg font-medium">Select a conversation</p>
                <p className="text-xs sm:text-sm">Choose a conversation from the list</p>
                {conversationListCollapsed && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleConversationList}
                    className="mt-4"
                  >
                    <PanelLeft className="h-4 w-4 mr-2" />
                    Show conversations
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Contact Info Panel */}
      {contactPanelOpen && selectedConversation && (
        <div className={cn(
          'border-l flex flex-col transition-all duration-200 flex-shrink-0 overflow-hidden',
          // Mobile: full width overlay, tablet/desktop: sidebar (max 320px)
          'fixed inset-0 z-50 bg-background md:static md:z-auto',
          'md:w-[300px] lg:w-[320px] md:max-w-[320px]'
        )}>
          <div className="h-14 sm:h-16 border-b flex items-center justify-between px-3 sm:px-4">
            <h3 className="font-semibold text-sm sm:text-base">
              {contactPanelTab === 'orderops'
                ? 'Orders'
                : contactPanelTab === 'tags'
                ? 'Tags'
                : isGroupContact(selectedConversation.contact) ? 'Group Info' : 'Contact'}
            </h3>
            <Button variant="ghost" size="icon" onClick={() => setContactPanelOpen(false)} className="h-8 w-8 sm:h-9 sm:w-9">
              <X className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </div>

          {/* Tabs */}
          <Tabs value={contactPanelTab} onValueChange={setContactPanelTab} className="flex-1 flex flex-col">
            <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-auto p-0">
              <TabsTrigger
                value="info"
                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2.5 sm:py-2 text-xs"
              >
                <User className="h-3 w-3 mr-1" />
                Info
              </TabsTrigger>
              <TabsTrigger
                value="tags"
                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2.5 sm:py-2 text-xs"
              >
                <TagIcon className="h-3 w-3 mr-1" />
                Tags
              </TabsTrigger>
              <TabsTrigger
                value="orderops"
                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2.5 sm:py-2 text-xs"
              >
                <Package className="h-3 w-3 mr-1" />
                Orders
              </TabsTrigger>
            </TabsList>

            {/* Info Tab */}
            <TabsContent value="info" className="flex-1 m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-4">
                  {/* Contact Avatar & Name */}
                  <div className="text-center pb-4 border-b">
                    <div className="relative inline-block">
                      <Avatar className="h-16 w-16 mx-auto mb-2">
                        <AvatarImage src={selectedConversation.contact.avatarUrl || undefined} className="object-cover" />
                        <AvatarFallback className="text-xl">
                          {isGroupContact(selectedConversation.contact) ? (
                            <Users className="h-6 w-6" />
                          ) : (
                            getContactInitials(selectedConversation.contact)
                          )}
                        </AvatarFallback>
                      </Avatar>
                      {isGroupContact(selectedConversation.contact) && (
                        <span className="absolute bottom-1 right-0 h-5 w-5 rounded-full bg-green-500 text-white flex items-center justify-center">
                          <Users className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-center gap-1 max-w-full">
                      <h4 className="font-semibold text-sm truncate max-w-[200px]">
                        {getContactName(selectedConversation.contact)}
                      </h4>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={handleEditContact}
                      >
                        <Edit className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {isGroupContact(selectedConversation.contact) ? 'WhatsApp Group' : `+${selectedConversation.contact.identifier}`}
                    </p>
                  </div>

                  {/* Contact/Group Details */}
                  <div className="space-y-2">
                    <h5 className="text-xs font-medium text-muted-foreground uppercase">Details</h5>
                    {isGroupContact(selectedConversation.contact) ? (
                      <div className="flex items-center gap-2 text-sm min-w-0">
                        <Users className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-muted-foreground text-xs truncate">ID: {selectedConversation.contact.identifier}</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs">+{selectedConversation.contact.identifier}</span>
                        </div>
                        {selectedConversation.contact.firstName && (
                          <div className="flex items-center gap-2 text-sm">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs">
                              {selectedConversation.contact.firstName} {selectedConversation.contact.lastName}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Channel Info */}
                  <div className="border-t pt-4">
                    <h5 className="text-xs font-medium text-muted-foreground uppercase mb-2">Channel</h5>
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded bg-green-500/10 flex items-center justify-center">
                        <MessageSquare className="h-3.5 w-3.5 text-green-500" />
                      </div>
                      <div>
                        <p className="text-xs font-medium">{selectedConversation.channel.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          +{selectedConversation.channel.identifier}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Conversation Info */}
                  <div className="border-t pt-4">
                    <h5 className="text-xs font-medium text-muted-foreground uppercase mb-2">Conversation</h5>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Priority</span>
                        <span>{selectedConversation.priority}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Created</span>
                        <span>{new Date(selectedConversation.createdAt).toLocaleDateString()}</span>
                      </div>
                      {selectedConversation.assignedUser && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Assigned</span>
                          <span>
                            {selectedConversation.assignedUser.firstName} {selectedConversation.assignedUser.lastName}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Group Participants */}
                  {isGroupContact(selectedConversation.contact) && groupParticipants?.isGroup && (
                    <div className="border-t pt-4">
                      <h5 className="text-xs font-medium text-muted-foreground uppercase mb-2 flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        Participants ({groupParticipants.participantCount})
                      </h5>
                      <div className="space-y-1.5 max-h-32 sm:max-h-40 overflow-y-auto">
                        {groupParticipants.participants.slice(0, 20).map((participant) => (
                          <div key={participant.id} className="flex items-center gap-2 text-xs min-w-0">
                            <Avatar className="h-5 w-5">
                              {participant.avatarUrl && (
                                <AvatarImage src={participant.avatarUrl} className="object-cover" />
                              )}
                              <AvatarFallback className="text-[8px]">
                                {(participant.displayName || participant.identifier).slice(-2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="flex-1 truncate">
                              {participant.displayName || `+${participant.identifier}`}
                            </span>
                            {participant.admin && (
                              <span className="text-[8px] bg-primary/10 text-primary px-1 py-0.5 rounded">
                                {participant.admin === 'superadmin' ? 'Owner' : 'Admin'}
                              </span>
                            )}
                          </div>
                        ))}
                        {groupParticipants.participantCount > 20 && (
                          <p className="text-[10px] text-muted-foreground text-center">
                            +{groupParticipants.participantCount - 20} more
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Tags & Notes Tab */}
            <TabsContent value="tags" className="flex-1 m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-3 sm:p-4 space-y-4">
                  {/* Tags */}
                  <div>
                    <h5 className="text-xs font-medium text-muted-foreground uppercase mb-2 flex items-center gap-1">
                      <TagIcon className="h-3 w-3" />
                      Tags
                    </h5>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedConversation.tags && selectedConversation.tags.length > 0 ? (
                        selectedConversation.tags.filter((tagRelation) => tagRelation.tag).map((tagRelation) => (
                          <span
                            key={tagRelation.tag.id}
                            className="px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1"
                            style={{
                              backgroundColor: `${tagRelation.tag.color || '#6b7280'}20`,
                              color: tagRelation.tag.color || '#6b7280',
                            }}
                          >
                            {tagRelation.tag.name}
                            <button
                              onClick={() => removeConversationTag(selectedConversation.id, tagRelation.tag.id)
                                .then(() => queryClient.invalidateQueries({ queryKey: ['conversations'] }))}
                              className="hover:bg-black/10 rounded"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">No tags</span>
                      )}
                    </div>
                    {allTags && allTags.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="mt-2 w-full h-7 text-xs">
                            <Plus className="h-3 w-3 mr-1" />
                            Add Tag
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-48">
                          {allTags.filter((tag) => tag?.id).map((tag) => {
                            const isAdded = selectedConversation.tags?.some(t => t.tag?.id === tag.id);
                            return (
                              <DropdownMenuItem
                                key={tag.id}
                                disabled={isAdded}
                                onClick={() => addConversationTag(selectedConversation.id, tag.id)
                                  .then(() => queryClient.invalidateQueries({ queryKey: ['conversations'] }))}
                              >
                                <span
                                  className="w-2.5 h-2.5 rounded-full mr-2"
                                  style={{ backgroundColor: tag.color || '#6b7280' }}
                                />
                                <span className="text-xs">{tag.name}</span>
                                {isAdded && <Check className="h-3 w-3 ml-auto" />}
                              </DropdownMenuItem>
                            );
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  {/* Notes */}
                  <div className="border-t pt-4">
                    <h5 className="text-xs font-medium text-muted-foreground uppercase mb-2 flex items-center gap-1">
                      <StickyNote className="h-3 w-3" />
                      Notes
                    </h5>
                    <div className="space-y-2">
                      {/* Add note form */}
                      <div className="flex gap-1.5">
                        <Input
                          placeholder="Add a note..."
                          value={newNoteContent}
                          onChange={(e) => setNewNoteContent(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newNoteContent.trim()) {
                              addNoteMutation.mutate({
                                conversationId: selectedConversation.id,
                                content: newNoteContent.trim(),
                              });
                              setNewNoteContent('');
                            }
                          }}
                          className="h-7 text-xs"
                        />
                        <Button
                          size="sm"
                          className="h-7 px-2"
                          disabled={!newNoteContent.trim() || addNoteMutation.isPending}
                          onClick={() => {
                            if (newNoteContent.trim()) {
                              addNoteMutation.mutate({
                                conversationId: selectedConversation.id,
                                content: newNoteContent.trim(),
                              });
                              setNewNoteContent('');
                            }
                          }}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      {/* Notes list */}
                      {conversationNotes && conversationNotes.length > 0 ? (
                        <div className="space-y-1.5 max-h-60 overflow-y-auto">
                          {conversationNotes.map((note) => (
                            <div key={note.id} className="bg-muted/50 rounded p-2 text-xs">
                              <div className="flex items-start justify-between gap-1">
                                <p className="flex-1 whitespace-pre-wrap break-words">{note.content}</p>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-4 w-4 flex-shrink-0"
                                  onClick={() => deleteNoteMutation.mutate(note.id)}
                                >
                                  <Trash2 className="h-2.5 w-2.5" />
                                </Button>
                              </div>
                              <div className="flex items-center gap-1 mt-1 text-[9px] text-muted-foreground">
                                <span>{note.user.firstName} {note.user.lastName}</span>
                                <span>·</span>
                                <span>{formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No notes yet</p>
                      )}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            {/* OrderOps Tab */}
            <TabsContent value="orderops" className="flex-1 m-0 overflow-hidden">
              <OrderOpsTab conversationId={selectedConversation.id} />
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Edit Contact Name Dialog */}
      <Dialog open={editContactOpen} onOpenChange={setEditContactOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Contact Name</DialogTitle>
            <DialogDescription>
              Change the display name for this contact. This will be shown in all conversations.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="contactName">Display Name</Label>
              <Input
                id="contactName"
                placeholder="Enter contact name"
                value={editContactName}
                onChange={(e) => setEditContactName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveContactName();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditContactOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveContactName}
              disabled={updateContactMutation.isPending || !editContactName.trim()}
            >
              {updateContactMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Media Preview Modal */}
      {mediaPreview && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setMediaPreview(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute -top-12 right-0 text-white hover:bg-white/20"
              onClick={() => setMediaPreview(null)}
            >
              <X className="h-6 w-6" />
            </Button>

            {/* Download button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute -top-12 right-12 text-white hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                const ext = mediaPreview.type === 'image' ? 'jpg' : 'mp4';
                downloadFile(mediaPreview.url, `media.${ext}`);
              }}
            >
              <Download className="h-6 w-6" />
            </Button>

            {/* Media content */}
            {mediaPreview.type === 'image' ? (
              <img
                src={mediaPreview.url}
                alt="Preview"
                className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <video
                src={mediaPreview.url}
                controls
                autoPlay
                className="max-w-[90vw] max-h-[90vh] rounded-lg"
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>
        </div>
      )}

      {/* Schedule Message Dialog */}
      {selectedConversationId && (
        <ScheduleMessageDialog
          open={scheduleDialogOpen}
          onOpenChange={setScheduleDialogOpen}
          conversationId={selectedConversationId}
          messageContent={{
            text: messageText.trim() || undefined,
            mediaUrl: selectedMedia?.preview,
            mediaType: selectedMedia?.type,
          }}
          onScheduled={() => {
            setMessageText('');
            setSelectedMedia(null);
          }}
        />
      )}

      {/* Edit Message Dialog */}
      {editingMessage && selectedConversationId && (
        <EditMessageDialog
          open={!!editingMessage}
          onOpenChange={(open) => !open && setEditingMessage(null)}
          messageId={editingMessage.id}
          currentText={editingMessage.text}
          conversationId={selectedConversationId}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingMessage} onOpenChange={(open) => !open && setDeletingMessage(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Delete Message
            </DialogTitle>
            <DialogDescription>
              {deletingMessage?.forEveryone
                ? 'This message will be deleted for everyone in this conversation. This action cannot be undone.'
                : 'This message will be deleted from your view only. Others can still see it.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeletingMessage(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deletingMessage) {
                  if (deletingMessage.forEveryone) {
                    deleteForEveryoneMutation.mutate(deletingMessage.id);
                  } else {
                    deleteMessageMutation.mutate(deletingMessage.id);
                  }
                }
              }}
              disabled={deleteMessageMutation.isPending || deleteForEveryoneMutation.isPending}
            >
              {(deleteMessageMutation.isPending || deleteForEveryoneMutation.isPending) ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
