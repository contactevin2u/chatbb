'use client';

import { memo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  X,
  User,
  Users,
  Phone,
  MessageSquare,
  Tag as TagIcon,
  Edit,
  Plus,
  StickyNote,
  Trash2,
  Check,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils/cn';

export interface ContactPanelContact {
  id: string;
  identifier: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
}

export interface ContactPanelChannel {
  name: string;
  identifier: string;
}

export interface ContactPanelTag {
  id: string;
  name: string;
  color: string;
}

export interface ContactPanelTagRelation {
  tag: ContactPanelTag;
}

export interface ContactPanelUser {
  firstName: string;
  lastName: string;
}

export interface ContactPanelNote {
  id: string;
  content: string;
  createdAt: string;
  user: ContactPanelUser;
}

export interface GroupParticipant {
  id: string;
  identifier: string;
  admin?: string | null;
}

export interface GroupParticipantsData {
  isGroup: boolean;
  participantCount: number;
  participants: GroupParticipant[];
}

export interface ContactPanelConversation {
  id: string;
  status: string;
  priority: string;
  createdAt: string;
  contact: ContactPanelContact;
  channel: ContactPanelChannel;
  tags?: ContactPanelTagRelation[];
  assignedUser?: ContactPanelUser | null;
}

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    OPEN: { label: 'Open', className: 'bg-green-500/10 text-green-500' },
    PENDING: { label: 'Pending', className: 'bg-yellow-500/10 text-yellow-500' },
    RESOLVED: { label: 'Resolved', className: 'bg-blue-500/10 text-blue-500' },
    CLOSED: { label: 'Closed', className: 'bg-gray-500/10 text-gray-500' },
  };
  const { label, className } = config[status] || { label: status, className: 'bg-gray-500/10 text-gray-500' };
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', className)}>
      {label}
    </span>
  );
}

interface ContactInfoPanelProps {
  conversation: ContactPanelConversation;
  allTags?: ContactPanelTag[];
  notes?: ContactPanelNote[];
  groupParticipants?: GroupParticipantsData | null;
  onClose: () => void;
  onEditContact: () => void;
  onAddTag: (conversationId: string, tagId: string) => Promise<void>;
  onRemoveTag: (conversationId: string, tagId: string) => Promise<void>;
  onAddNote: (conversationId: string, content: string) => void;
  onDeleteNote: (noteId: string) => void;
  isAddingNote?: boolean;
}

function isGroupContact(identifier: string): boolean {
  return identifier.includes('-');
}

function getContactName(contact: ContactPanelContact): string {
  if (contact.displayName) return contact.displayName;
  if (contact.firstName || contact.lastName) {
    return `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
  }
  return contact.identifier;
}

function getContactInitials(contact: ContactPanelContact): string {
  const name = getContactName(contact);
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export const ContactInfoPanel = memo(function ContactInfoPanel({
  conversation,
  allTags,
  notes,
  groupParticipants,
  onClose,
  onEditContact,
  onAddTag,
  onRemoveTag,
  onAddNote,
  onDeleteNote,
  isAddingNote,
}: ContactInfoPanelProps) {
  const [newNoteContent, setNewNoteContent] = useState('');
  const isGroup = isGroupContact(conversation.contact.identifier);

  const handleAddNote = () => {
    if (newNoteContent.trim()) {
      onAddNote(conversation.id, newNoteContent.trim());
      setNewNoteContent('');
    }
  };

  return (
    <div className="w-80 border-l flex flex-col">
      <div className="h-16 border-b flex items-center justify-between px-4">
        <h3 className="font-semibold">
          {isGroup ? 'Group Info' : 'Contact Info'}
        </h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Contact Avatar & Name */}
          <div className="text-center">
            <div className="relative inline-block">
              <Avatar className="h-20 w-20 mx-auto mb-3">
                <AvatarImage src={conversation.contact.avatarUrl || undefined} />
                <AvatarFallback className="text-2xl">
                  {isGroup ? (
                    <Users className="h-8 w-8" />
                  ) : (
                    getContactInitials(conversation.contact)
                  )}
                </AvatarFallback>
              </Avatar>
              {isGroup && (
                <span className="absolute bottom-2 right-0 h-6 w-6 rounded-full bg-green-500 text-white flex items-center justify-center">
                  <Users className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
            <div className="flex items-center justify-center gap-2">
              <h4 className="font-semibold text-lg">
                {getContactName(conversation.contact)}
              </h4>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onEditContact}
              >
                <Edit className="h-3 w-3" />
              </Button>
            </div>
            {isGroup ? (
              <p className="text-sm text-green-600 font-medium">WhatsApp Group</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                +{conversation.contact.identifier}
              </p>
            )}
          </div>

          {/* Contact/Group Details */}
          <div className="space-y-3">
            {isGroup ? (
              <div className="flex items-center gap-3">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Group ID: {conversation.contact.identifier}</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">+{conversation.contact.identifier}</span>
                </div>
                {conversation.contact.firstName && (
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      {conversation.contact.firstName} {conversation.contact.lastName}
                    </span>
                  </div>
                )}
              </>
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
                <p className="text-sm font-medium">{conversation.channel.name}</p>
                <p className="text-xs text-muted-foreground">
                  +{conversation.channel.identifier}
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
                <StatusBadge status={conversation.status} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Priority</span>
                <span>{conversation.priority}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{new Date(conversation.createdAt).toLocaleDateString()}</span>
              </div>
              {conversation.assignedUser && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Assigned to</span>
                  <span>
                    {conversation.assignedUser.firstName}{' '}
                    {conversation.assignedUser.lastName}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Tags */}
          <div className="border-t pt-4">
            <h5 className="text-sm font-medium mb-3 flex items-center gap-2">
              <TagIcon className="h-4 w-4" />
              Tags
            </h5>
            <div className="flex flex-wrap gap-1.5">
              {conversation.tags && conversation.tags.length > 0 ? (
                conversation.tags.map((tagRelation) => (
                  <span
                    key={tagRelation.tag.id}
                    className="px-2 py-1 rounded text-xs font-medium flex items-center gap-1"
                    style={{
                      backgroundColor: `${tagRelation.tag.color}20`,
                      color: tagRelation.tag.color,
                    }}
                  >
                    {tagRelation.tag.name}
                    <button
                      onClick={() => onRemoveTag(conversation.id, tagRelation.tag.id)}
                      className="hover:bg-black/10 rounded"
                    >
                      <X className="h-3 w-3" />
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
                  <Button variant="outline" size="sm" className="mt-2 w-full">
                    <Plus className="h-3 w-3 mr-1" />
                    Add Tag
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {allTags.map((tag) => {
                    const isAdded = conversation.tags?.some(t => t.tag.id === tag.id);
                    return (
                      <DropdownMenuItem
                        key={tag.id}
                        disabled={isAdded}
                        onClick={() => onAddTag(conversation.id, tag.id)}
                      >
                        <span
                          className="w-3 h-3 rounded-full mr-2"
                          style={{ backgroundColor: tag.color }}
                        />
                        {tag.name}
                        {isAdded && <Check className="h-3 w-3 ml-auto" />}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Group Participants */}
          {isGroup && groupParticipants?.isGroup && (
            <div className="border-t pt-4">
              <h5 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Participants ({groupParticipants.participantCount})
              </h5>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {groupParticipants.participants.slice(0, 20).map((participant) => (
                  <div key={participant.id} className="flex items-center gap-2 text-sm">
                    <Avatar className="h-6 w-6">
                      {participant.avatarUrl && (
                        <AvatarImage src={participant.avatarUrl} className="object-cover" />
                      )}
                      <AvatarFallback className="text-[10px]">
                        {(participant.displayName || participant.identifier).slice(-2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex-1 truncate">
                      {participant.displayName || `+${participant.identifier}`}
                    </span>
                    {participant.admin && (
                      <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                        {participant.admin === 'superadmin' ? 'Owner' : 'Admin'}
                      </span>
                    )}
                  </div>
                ))}
                {groupParticipants.participantCount > 20 && (
                  <p className="text-xs text-muted-foreground text-center">
                    +{groupParticipants.participantCount - 20} more
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="border-t pt-4">
            <h5 className="text-sm font-medium mb-3 flex items-center gap-2">
              <StickyNote className="h-4 w-4" />
              Notes
            </h5>
            <div className="space-y-3">
              {/* Add note form */}
              <div className="flex gap-2">
                <Input
                  placeholder="Add a note..."
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newNoteContent.trim()) {
                      handleAddNote();
                    }
                  }}
                  className="h-8 text-sm"
                />
                <Button
                  size="sm"
                  className="h-8 px-2"
                  disabled={!newNoteContent.trim() || isAddingNote}
                  onClick={handleAddNote}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {/* Notes list */}
              {notes && notes.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {notes.map((note) => (
                    <div key={note.id} className="bg-muted/50 rounded p-2 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="flex-1 whitespace-pre-wrap break-words">{note.content}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 flex-shrink-0"
                          onClick={() => onDeleteNote(note.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
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
    </div>
  );
});
