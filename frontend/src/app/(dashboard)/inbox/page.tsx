'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
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
  User,
  Phone,
  Mail,
  Tag,
  MessageSquare,
  Edit,
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
import { cn } from '@/lib/utils/cn';
import { updateContact } from '@/lib/api/contacts';
import { useWebSocket } from '@/providers/websocket-provider';
import {
  listConversations,
  getMessages,
  sendMessage,
  markConversationAsRead,
  closeConversation,
  reopenConversation,
  type Conversation,
  type Message,
  type ConversationStatus,
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

export default function InboxPage() {
  const queryClient = useQueryClient();
  const { socket, joinConversation, leaveConversation, startTyping, stopTyping } = useWebSocket();

  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ConversationStatus[]>(['OPEN', 'PENDING']);
  const [messageText, setMessageText] = useState('');
  const [showContactPanel, setShowContactPanel] = useState(true);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [editContactOpen, setEditContactOpen] = useState(false);
  const [editContactName, setEditContactName] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch conversations
  const { data: conversationsData, isLoading: isLoadingConversations } = useQuery({
    queryKey: ['conversations', statusFilter, searchQuery],
    queryFn: () => listConversations({
      status: statusFilter,
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

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: sendMessage,
    onSuccess: () => {
      setMessageText('');
      queryClient.invalidateQueries({ queryKey: ['messages', selectedConversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error: Error) => {
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

  // Handle selecting a conversation
  const handleSelectConversation = useCallback((conversationId: string) => {
    // Leave previous conversation room
    if (selectedConversationId) {
      leaveConversation(selectedConversationId);
    }

    setSelectedConversationId(conversationId);
    joinConversation(conversationId);

    // Mark as read
    markConversationAsRead(conversationId).catch(() => {
      // Ignore errors
    });
  }, [selectedConversationId, joinConversation, leaveConversation]);

  // Handle sending a message
  const handleSendMessage = useCallback(() => {
    if (!messageText.trim() || !selectedConversationId) return;

    sendMessageMutation.mutate({
      conversationId: selectedConversationId,
      text: messageText.trim(),
    });
  }, [messageText, selectedConversationId, sendMessageMutation]);

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

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesData?.messages]);

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    // New message
    const handleNewMessage = (data: { message: Message; conversationId: string }) => {
      queryClient.invalidateQueries({ queryKey: ['messages', data.conversationId] });
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

    socket.on('message:new', handleNewMessage);
    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);
    socket.on('conversation:updated', handleConversationUpdated);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
      socket.off('conversation:updated', handleConversationUpdated);
    };
  }, [socket, selectedConversationId, queryClient]);

  return (
    <div className="flex h-full">
      {/* Conversation List Panel */}
      <div className="w-80 border-r flex flex-col">
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
          <div className="flex gap-1">
            {(['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'] as ConversationStatus[]).map((status) => (
              <Button
                key={status}
                variant={statusFilter.includes(status) ? 'default' : 'outline'}
                size="sm"
                className="text-xs"
                onClick={() => {
                  setStatusFilter((prev) =>
                    prev.includes(status)
                      ? prev.filter((s) => s !== status)
                      : [...prev, status]
                  );
                }}
              >
                {status.charAt(0) + status.slice(1).toLowerCase()}
              </Button>
            ))}
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
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      <Avatar>
                        <AvatarImage src={conversation.contact.avatarUrl || undefined} />
                        <AvatarFallback>{getContactInitials(conversation.contact)}</AvatarFallback>
                      </Avatar>
                      {conversation.unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                          {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-medium truncate">
                          {getContactName(conversation.contact)}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {conversation.lastMessageAt
                            ? formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true })
                            : ''}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {getMessagePreview(conversation.lastMessage)}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <StatusBadge status={conversation.status} />
                        <span className="text-xs text-muted-foreground">
                          {conversation.channel.name}
                        </span>
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
                <Avatar>
                  <AvatarImage src={selectedConversation.contact.avatarUrl || undefined} />
                  <AvatarFallback>{getContactInitials(selectedConversation.contact)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{getContactName(selectedConversation.contact)}</p>
                  <p className="text-sm text-muted-foreground">
                    +{selectedConversation.contact.identifier}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
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

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
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
                <div className="space-y-4">
                  {messagesData?.messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        'flex gap-3',
                        message.direction === 'OUTBOUND' && 'flex-row-reverse'
                      )}
                    >
                      {message.direction === 'INBOUND' && (
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {getContactInitials(selectedConversation.contact)}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div
                        className={cn(
                          'max-w-[70%] rounded-lg p-3',
                          message.direction === 'OUTBOUND'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        )}
                      >
                        {message.type === 'TEXT' && (
                          <p className="text-sm whitespace-pre-wrap">{message.content.text}</p>
                        )}
                        {message.type === 'IMAGE' && (
                          <div className="space-y-2">
                            <div className="h-48 w-48 bg-black/10 rounded flex items-center justify-center">
                              <ImageIcon className="h-8 w-8 opacity-50" />
                            </div>
                            {message.content.caption && (
                              <p className="text-sm">{message.content.caption}</p>
                            )}
                          </div>
                        )}
                        <div className={cn(
                          'flex items-center gap-1 mt-1',
                          message.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'
                        )}>
                          <span className={cn(
                            'text-xs',
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
                      </div>
                    </div>
                  ))}
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

            {/* Message Input */}
            <div className="p-4 border-t">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon">
                  <Paperclip className="h-5 w-5" />
                </Button>
                <Input
                  placeholder="Type a message..."
                  value={messageText}
                  onChange={(e) => {
                    setMessageText(e.target.value);
                    handleTyping();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  disabled={selectedConversation.status === 'CLOSED'}
                />
                <Button variant="ghost" size="icon">
                  <Smile className="h-5 w-5" />
                </Button>
                <Button
                  onClick={handleSendMessage}
                  disabled={!messageText.trim() || sendMessageMutation.isPending || selectedConversation.status === 'CLOSED'}
                >
                  <Send className="h-5 w-5" />
                </Button>
              </div>
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
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Select a conversation</p>
              <p className="text-sm">Choose a conversation from the list to start messaging</p>
            </div>
          </div>
        )}
      </div>

      {/* Contact Info Panel */}
      {showContactPanel && selectedConversation && (
        <div className="w-80 border-l flex flex-col">
          <div className="h-16 border-b flex items-center justify-between px-4">
            <h3 className="font-semibold">Contact Info</h3>
            <Button variant="ghost" size="icon" onClick={() => setShowContactPanel(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-6">
              {/* Contact Avatar & Name */}
              <div className="text-center">
                <Avatar className="h-20 w-20 mx-auto mb-3">
                  <AvatarImage src={selectedConversation.contact.avatarUrl || undefined} />
                  <AvatarFallback className="text-2xl">
                    {getContactInitials(selectedConversation.contact)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex items-center justify-center gap-2">
                  <h4 className="font-semibold text-lg">
                    {getContactName(selectedConversation.contact)}
                  </h4>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={handleEditContact}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  +{selectedConversation.contact.identifier}
                </p>
              </div>

              {/* Contact Details */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">+{selectedConversation.contact.identifier}</span>
                </div>
                {selectedConversation.contact.firstName && (
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      {selectedConversation.contact.firstName} {selectedConversation.contact.lastName}
                    </span>
                  </div>
                )}
              </div>

              {/* Channel Info */}
              <div className="border-t pt-4">
                <h5 className="text-sm font-medium mb-3">Channel</h5>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded bg-green-500/10 flex items-center justify-center">
                    <MessageSquare className="h-4 w-4 text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{selectedConversation.channel.name}</p>
                    <p className="text-xs text-muted-foreground">
                      +{selectedConversation.channel.identifier}
                    </p>
                  </div>
                </div>
              </div>

              {/* Conversation Info */}
              <div className="border-t pt-4">
                <h5 className="text-sm font-medium mb-3">Conversation</h5>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <StatusBadge status={selectedConversation.status} />
                  </div>
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
                      <span className="text-muted-foreground">Assigned to</span>
                      <span>
                        {selectedConversation.assignedUser.firstName}{' '}
                        {selectedConversation.assignedUser.lastName}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
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
    </div>
  );
}
