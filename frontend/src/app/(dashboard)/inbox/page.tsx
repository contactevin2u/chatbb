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
  ShoppingBag,
  Package,
  Eye,
  EyeOff,
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
import { useUIStore } from '@/stores/ui-store';
import { useKeyboardShortcuts, KeyboardShortcut } from '@/hooks/use-keyboard-shortcuts';
import { SlashCommand, SlashCommandItem } from '@/components/slash-command';
import { startSequenceExecution } from '@/lib/api/sequences';
import { ScheduleMessageDialog } from '@/components/schedule-message-dialog';
import { TagDropdown } from '@/components/tag-dropdown';
import { QuickReply } from '@/lib/api/quick-replies';
import { listScheduledMessages, cancelScheduledMessage, ScheduledMessage } from '@/lib/api/scheduled-messages';
import {
  listConversations,
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
  const { socket, joinConversation, leaveConversation, startTyping, stopTyping } = useWebSocket();
  const { user } = useAuthStore();
  const { conversationListCollapsed, toggleConversationList } = useUIStore();

  // Get conversation ID from URL params
  const urlConversationId = searchParams.get('conversation');
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(urlConversationId);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [messageText, setMessageText] = useState('');
  const [showContactPanel, setShowContactPanel] = useState(true);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [editContactOpen, setEditContactOpen] = useState(false);
  const [editContactName, setEditContactName] = useState('');
  const [activeAgentWarning, setActiveAgentWarning] = useState<string | null>(null);
  const [otherActiveAgent, setOtherActiveAgent] = useState<{ id: string; name: string } | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<{ file: File; preview: string; type: 'image' | 'video' | 'audio' | 'document' } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null); // messageId to show picker for
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [mediaPreview, setMediaPreview] = useState<{ url: string; type: 'image' | 'video'; filename?: string } | null>(null);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [slashCommandOpen, setSlashCommandOpen] = useState(false);
  const [slashSearchTerm, setSlashSearchTerm] = useState('');
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
  const messageInputRef = useRef<HTMLInputElement>(null);

  // Fetch all tags for the organization
  const { data: allTags } = useQuery({
    queryKey: ['tags'],
    queryFn: listTags,
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
  const { data: messagesData, isLoading: isLoadingMessages } = useQuery({
    queryKey: ['messages', selectedConversationId],
    queryFn: () => selectedConversationId ? getMessages(selectedConversationId) : null,
    enabled: !!selectedConversationId,
  });

  // Find selected conversation
  const selectedConversation = conversationsData?.conversations.find(
    (c) => c.id === selectedConversationId
  );

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
    onMutate: async (newMessage) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['messages', newMessage.conversationId] });

      // Snapshot previous messages for rollback
      const previousMessages = queryClient.getQueryData(['messages', newMessage.conversationId]);

      // Optimistically add the message to the UI immediately
      const optimisticMessage = {
        id: `temp-${Date.now()}`,
        conversationId: newMessage.conversationId,
        direction: 'OUTBOUND',
        type: newMessage.media?.type?.toUpperCase() || 'TEXT',
        content: {
          text: newMessage.text,
          ...(newMessage.media && {
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

      return { previousMessages, conversationId: newMessage.conversationId };
    },
    onSuccess: (_data, variables) => {
      // Refetch to get the real message with server ID
      queryClient.invalidateQueries({ queryKey: ['messages', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
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
  const { data: scheduledMessages } = useQuery({
    queryKey: ['scheduledMessages', selectedConversationId],
    queryFn: () => selectedConversationId ? listScheduledMessages(selectedConversationId) : null,
    enabled: !!selectedConversationId,
    refetchInterval: 30000, // Refresh every 30 seconds to update times
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
  }, [joinConversation, leaveConversation, incognitoMode]);

  // Keyboard shortcuts for inbox
  const inboxShortcuts = useMemo<KeyboardShortcut[]>(() => {
    const conversations = conversationsData?.conversations || [];
    const currentIndex = conversations.findIndex((c) => c.id === selectedConversationId);

    return [
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
        key: 'Escape',
        description: 'Clear selection / Close panel',
        category: 'actions',
        action: () => {
          if (showContactPanel) {
            setShowContactPanel(false);
          } else if (selectedConversationId) {
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
    pinConversationMutation,
    unpinConversationMutation,
    showContactPanel,
    handleSelectConversation,
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

    try {
      let mediaData: { type: 'image' | 'video' | 'audio' | 'document'; url: string; mimetype: string; filename: string } | undefined;

      // Upload media if selected
      if (selectedMedia) {
        setIsUploading(true);
        try {
          const uploaded = await uploadMedia(selectedMedia.file);
          mediaData = {
            type: uploaded.type,
            url: uploaded.url,
            mimetype: uploaded.mimetype,
            filename: uploaded.filename,
          };
        } catch (error) {
          toast.error('Failed to upload media');
          setIsUploading(false);
          return;
        }
        setIsUploading(false);
      }

      // Send message
      sendMessageMutation.mutate({
        conversationId: selectedConversationId,
        text: messageText.trim() || undefined,
        media: mediaData,
        quotedMessageId: replyToMessage?.externalId || undefined,
      });

      // Clear media and reply after sending
      clearSelectedMedia();
      setReplyToMessage(null);
    } catch (error) {
      toast.error('Failed to send message');
    }
  }, [messageText, selectedMedia, selectedConversationId, sendMessageMutation, clearSelectedMedia, replyToMessage]);

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
  const handleMessageInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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

    socket.on('message:new', handleNewMessage);
    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);
    socket.on('conversation:updated', handleConversationUpdated);
    socket.on('agent:active', handleAgentActive);
    socket.on('agent:left', handleAgentLeft);
    socket.on('message:reaction', handleReaction);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
      socket.off('conversation:updated', handleConversationUpdated);
      socket.off('agent:active', handleAgentActive);
      socket.off('agent:left', handleAgentLeft);
      socket.off('message:reaction', handleReaction);
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
    <div className="flex h-full overflow-hidden">
      {/* Conversation List Panel */}
      <div
        className={cn(
          'border-r flex flex-col transition-all duration-200 ease-in-out flex-shrink-0',
          conversationListCollapsed ? 'w-0 overflow-hidden' : 'w-80'
        )}
      >
        {/* Search and Filter */}
        <div className="p-4 border-b space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {/* Tag filter chips */}
          <div className="flex gap-1 flex-wrap">
            {allTags?.filter((tag) => tag?.id).map((tag) => (
              <Button
                key={tag.id}
                variant={selectedTagIds.includes(tag.id) ? 'default' : 'outline'}
                size="sm"
                className="text-xs h-7 gap-1"
                onClick={() => {
                  setSelectedTagIds((prev) =>
                    prev.includes(tag.id)
                      ? prev.filter((id) => id !== tag.id)
                      : [...prev, tag.id]
                  );
                }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: tag.color || '#6b7280' }}
                />
                {tag.name}
              </Button>
            ))}
            {selectedTagIds.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
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
                    'p-4 cursor-pointer hover:bg-muted/50 transition-colors',
                    selectedConversationId === conversation.id && 'bg-muted'
                  )}
                  onClick={() => handleSelectConversation(conversation.id)}
                >
                  <div className="flex items-start gap-3 group">
                    <div className="relative flex-shrink-0">
                      <Avatar className="h-10 w-10">
                        <AvatarImage
                          src={conversation.contact.avatarUrl || undefined}
                          className="object-cover"
                        />
                        <AvatarFallback>
                          {isGroupContact(conversation.contact) ? (
                            <Users className="h-5 w-5" />
                          ) : (
                            getContactInitials(conversation.contact)
                          )}
                        </AvatarFallback>
                      </Avatar>
                      {conversation.unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                          {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
                        </span>
                      )}
                      {isGroupContact(conversation.contact) && (
                        <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-green-500 text-white flex items-center justify-center">
                          <Users className="h-2.5 w-2.5" />
                        </span>
                      )}
                    </div>
                    {/* Tag dropdown beside avatar */}
                    <TagDropdown
                      conversationId={conversation.id}
                      currentTags={conversation.tags || []}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {conversation.isPinned && (
                            <Pin className="h-3 w-3 text-primary flex-shrink-0" />
                          )}
                          <p className="font-medium truncate">
                            {getContactName(conversation.contact)}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                          {conversation.lastMessageAt
                            ? formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true })
                            : ''}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {getMessagePreview(conversation.lastMessage)}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          {conversation.channel.name}
                        </span>
                        {conversation.tags && conversation.tags.length > 0 && (
                          <>
                            {conversation.tags.slice(0, 2).map((tagRelation) => tagRelation.tag && (
                              <span
                                key={tagRelation.tag.id}
                                className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                                style={{
                                  backgroundColor: `${tagRelation.tag.color || '#6b7280'}20`,
                                  color: tagRelation.tag.color || '#6b7280',
                                }}
                              >
                                {tagRelation.tag.name}
                              </span>
                            ))}
                            {conversation.tags.length > 2 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{conversation.tags.length - 2}
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
      </div>

      {/* Chat Panel */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="h-16 border-b flex items-center justify-between px-4">
              <div className="flex items-center gap-3">
                {/* Toggle conversation list */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleConversationList}
                  className="flex-shrink-0"
                  title={conversationListCollapsed ? 'Show conversations' : 'Hide conversations'}
                >
                  {conversationListCollapsed ? (
                    <PanelLeft className="h-5 w-5" />
                  ) : (
                    <PanelLeftClose className="h-5 w-5" />
                  )}
                </Button>
                <div className="relative">
                  <Avatar>
                    <AvatarImage src={selectedConversation.contact.avatarUrl || undefined} className="object-cover" />
                    <AvatarFallback>
                      {isGroupContact(selectedConversation.contact) ? (
                        <Users className="h-5 w-5" />
                      ) : (
                        getContactInitials(selectedConversation.contact)
                      )}
                    </AvatarFallback>
                  </Avatar>
                  {isGroupContact(selectedConversation.contact) && (
                    <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-green-500 text-white flex items-center justify-center">
                      <Users className="h-2.5 w-2.5" />
                    </span>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{getContactName(selectedConversation.contact)}</p>
                    {isGroupContact(selectedConversation.contact) && (
                      <span className="text-xs bg-green-500/10 text-green-600 px-1.5 py-0.5 rounded">Group</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {isGroupContact(selectedConversation.contact)
                      ? `Group ID: ${selectedConversation.contact.identifier}`
                      : `+${selectedConversation.contact.identifier}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
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
                  className={incognitoMode ? 'bg-purple-600 hover:bg-purple-700 text-white' : ''}
                >
                  {incognitoMode ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowContactPanel(!showContactPanel)}
                >
                  <User className="h-5 w-5" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {selectedConversation.isPinned ? (
                      <DropdownMenuItem
                        onClick={() => unpinConversationMutation.mutate(selectedConversation.id)}
                      >
                        <PinOff className="h-4 w-4 mr-2" />
                        Unpin conversation
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => pinConversationMutation.mutate(selectedConversation.id)}
                      >
                        <Pin className="h-4 w-4 mr-2" />
                        Pin conversation
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {selectedConversation.status === 'CLOSED' ? (
                      <DropdownMenuItem
                        onClick={() => reopenConversationMutation.mutate(selectedConversation.id)}
                      >
                        Reopen conversation
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => closeConversationMutation.mutate(selectedConversation.id)}
                      >
                        Close conversation
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
                  className="w-32 h-auto opacity-[0.35]"
                />
              </div>
              <ScrollArea className="h-full p-4 relative z-10">
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
                          className={cn(
                            'flex gap-2 items-end',
                            message.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'
                          )}
                        >
                          {message.direction === 'INBOUND' && (
                            <Avatar className="h-7 w-7 flex-shrink-0">
                              {/* For group messages, show sender's avatar if available */}
                              {isGroupContact(selectedConversation.contact) && message.metadata?.groupSender?.avatarUrl ? (
                                <AvatarImage src={message.metadata.groupSender.avatarUrl} className="object-cover" />
                              ) : selectedConversation.contact.avatarUrl ? (
                                <AvatarImage src={selectedConversation.contact.avatarUrl} className="object-cover" />
                              ) : null}
                              <AvatarFallback className="text-xs">
                                {isGroupContact(selectedConversation.contact) && message.metadata?.groupSender
                                  ? (message.metadata.groupSender.displayName || message.metadata.groupSender.pushName || message.metadata.groupSender.identifier || '').slice(0, 2).toUpperCase()
                                  : getContactInitials(selectedConversation.contact)}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <div className="group relative max-w-[70%]">
                            {/* Message actions (hover) */}
                            <div className={cn(
                              'absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10',
                              message.direction === 'OUTBOUND' ? 'left-0 -translate-x-full pr-2' : 'right-0 translate-x-full pl-2'
                            )}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 bg-background shadow-sm"
                                onClick={() => setReplyToMessage(message)}
                                title="Reply"
                              >
                                <Reply className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 bg-background shadow-sm"
                                onClick={() => setShowEmojiPicker(showEmojiPicker === message.id ? null : message.id)}
                                title="React"
                              >
                                <Smile className="h-4 w-4" />
                              </Button>
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
                                'rounded-lg px-3 py-2',
                                message.direction === 'OUTBOUND'
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted'
                              )}
                            >
                              {/* Sender name */}
                              {message.direction === 'OUTBOUND' && message.sentByUser && (
                                <p className="text-[11px] font-medium text-primary-foreground/80 mb-1">
                                  {message.sentByUser.firstName} {message.sentByUser.lastName}
                                </p>
                              )}
                              {message.direction === 'INBOUND' && (
                                <p className="text-[11px] font-medium text-foreground/70 mb-1">
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
                                  <p className="font-medium truncate">
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
            {scheduledMessages && scheduledMessages.filter(m => m.status === 'PENDING').length > 0 && (
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
            <div className="p-4 border-t">
              {/* Reply Preview */}
              {replyToMessage && (
                <div className="mb-3 p-2 bg-muted rounded-lg border-l-4 border-primary">
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
                      onClick={() => setReplyToMessage(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Media Preview */}
              {selectedMedia && (
                <div className="mb-3 p-2 bg-muted rounded-lg">
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
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={selectedConversation.status === 'CLOSED'}
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
                      ref={messageInputRef}
                      placeholder={selectedMedia ? "Add a caption..." : "Type a message... (/ for quick replies, Ctrl+V to paste image)"}
                      value={messageText}
                      onChange={handleMessageInputChange}
                      onPaste={handlePaste}
                      onKeyDown={(e) => {
                        // Let slash command popup handle Enter/Tab
                        if (slashCommandOpen && (e.key === 'Enter' || e.key === 'Tab' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                          return;
                        }
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      disabled={selectedConversation.status === 'CLOSED'}
                    />
                  </div>
                  <Button variant="ghost" size="icon">
                    <Smile className="h-5 w-5" />
                  </Button>
                  {/* Schedule button - only show when there's content */}
                  {(messageText.trim() || selectedMedia) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setScheduleDialogOpen(true)}
                      disabled={selectedConversation.status === 'CLOSED'}
                      title="Schedule message"
                    >
                      <Clock className="h-5 w-5" />
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
                    >
                      <Mic className="h-5 w-5" />
                    </Button>
                  ) : (
                    <Button
                      onClick={handleSendMessage}
                      disabled={(!messageText.trim() && !selectedMedia) || sendMessageMutation.isPending || isUploading || selectedConversation.status === 'CLOSED'}
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
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">Select a conversation</p>
                <p className="text-sm">Choose a conversation from the list to start messaging</p>
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
      {showContactPanel && selectedConversation && (
        <div className="w-80 border-l flex flex-col">
          <div className="h-16 border-b flex items-center justify-between px-4">
            <h3 className="font-semibold">
              {isGroupContact(selectedConversation.contact) ? 'Group Info' : 'Contact Info'}
            </h3>
            <Button variant="ghost" size="icon" onClick={() => setShowContactPanel(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Contact Avatar & Name - Always visible */}
          <div className="p-4 border-b">
            <div className="text-center">
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
              <div className="flex items-center justify-center gap-1">
                <h4 className="font-semibold text-sm">
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
          </div>

          {/* Tabs */}
          <Tabs defaultValue="info" className="flex-1 flex flex-col">
            <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-auto p-0">
              <TabsTrigger
                value="info"
                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2 text-xs"
              >
                <User className="h-3 w-3 mr-1" />
                Info
              </TabsTrigger>
              <TabsTrigger
                value="tags"
                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2 text-xs"
              >
                <TagIcon className="h-3 w-3 mr-1" />
                Tags
              </TabsTrigger>
              <TabsTrigger
                value="orderops"
                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2 text-xs"
              >
                <Package className="h-3 w-3 mr-1" />
                Orders
              </TabsTrigger>
            </TabsList>

            {/* Info Tab */}
            <TabsContent value="info" className="flex-1 m-0">
              <ScrollArea className="h-[calc(100vh-280px)]">
                <div className="p-4 space-y-4">
                  {/* Contact/Group Details */}
                  <div className="space-y-2">
                    <h5 className="text-xs font-medium text-muted-foreground uppercase">Details</h5>
                    {isGroupContact(selectedConversation.contact) ? (
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground text-xs">ID: {selectedConversation.contact.identifier}</span>
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
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {groupParticipants.participants.slice(0, 20).map((participant) => (
                          <div key={participant.id} className="flex items-center gap-2 text-xs">
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
            <TabsContent value="tags" className="flex-1 m-0">
              <ScrollArea className="h-[calc(100vh-280px)]">
                <div className="p-4 space-y-4">
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
            <TabsContent value="orderops" className="flex-1 m-0">
              <ScrollArea className="h-[calc(100vh-280px)]">
                <div className="p-4 space-y-4">
                  <div className="text-center py-8">
                    <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                    <h5 className="text-sm font-medium mb-1">Order Operations</h5>
                    <p className="text-xs text-muted-foreground mb-4">
                      Manage orders and operations for this contact
                    </p>
                    <Button variant="outline" size="sm" disabled>
                      <Plus className="h-3 w-3 mr-1" />
                      Coming Soon
                    </Button>
                  </div>
                </div>
              </ScrollArea>
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
    </div>
  );
}
