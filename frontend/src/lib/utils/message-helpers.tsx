import { isToday, isYesterday, format } from 'date-fns';
import {
  Clock,
  Check,
  CheckCheck,
  AlertCircle,
  FileText,
  FileSpreadsheet,
  FileImage,
  File,
} from 'lucide-react';
import { cn } from './cn';
import type { Conversation, Message, ConversationStatus } from '@/lib/api/conversations';

// Status badge component
export function StatusBadge({ status }: { status: ConversationStatus }) {
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
export function MessageStatusIcon({ status }: { status: string }) {
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
export function getContactName(contact: Conversation['contact']): string {
  if (contact.displayName) return contact.displayName;
  if (contact.firstName || contact.lastName) {
    return `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
  }
  return contact.identifier;
}

// Get contact initials
export function getContactInitials(contact: Conversation['contact']): string {
  const name = getContactName(contact);
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// Check if contact is a group using the isGroup field from database
export function isGroupContact(contact: Conversation['contact']): boolean {
  return contact.isGroup;
}

// Format date header for message groups
export function formatDateHeader(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMMM d, yyyy');
}

// Format message preview
export function getMessagePreview(message?: Message): string {
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
export function getDocumentIcon(filename?: string, mimeType?: string) {
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
export function formatDuration(seconds?: number): string {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Check if this is a WhatsApp protocol/system message that should not be displayed
export function isProtocolMessage(content: any): boolean {
  const msg = content?.message;
  if (!msg) return false;

  // Protocol messages - encryption key distribution, revoke, etc.
  if (msg.protocolMessage) return true;
  if (msg.senderKeyDistributionMessage && !msg.conversation && !msg.extendedTextMessage) return true;

  // Associated child messages (HD image pairs) - these are metadata, not actual messages
  if (msg.associatedChildMessage && !msg.conversation && !msg.extendedTextMessage) return true;

  // Message context info only (no actual content)
  if (msg.messageContextInfo && Object.keys(msg).length <= 2 &&
      !msg.conversation && !msg.extendedTextMessage && !msg.imageMessage &&
      !msg.videoMessage && !msg.audioMessage && !msg.documentMessage) {
    return true;
  }

  return false;
}

// Extract displayable text from message content (handles raw WhatsApp format)
export function getMessageText(content: any): string | null {
  if (!content) return null;

  // Standard normalized format
  if (content.text) return content.text;
  if (content.caption) return content.caption;

  // Raw WhatsApp format - try to extract text from various message types
  const msg = content.message;
  if (msg) {
    // Text messages
    if (msg.conversation) return msg.conversation;
    if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;

    // Media with captions
    if (msg.imageMessage?.caption) return msg.imageMessage.caption;
    if (msg.videoMessage?.caption) return msg.videoMessage.caption;
    if (msg.documentMessage?.caption) return msg.documentMessage.caption;
    if (msg.documentMessage?.fileName) return `📄 ${msg.documentMessage.fileName}`;

    // Associated child message with caption (HD image pairs)
    if (msg.associatedChildMessage?.message?.imageMessage?.caption) {
      return msg.associatedChildMessage.message.imageMessage.caption;
    }

    // Location
    if (msg.locationMessage) {
      const lat = msg.locationMessage.degreesLatitude;
      const lng = msg.locationMessage.degreesLongitude;
      if (lat && lng) return `📍 Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }

    // Contact
    if (msg.contactMessage?.displayName) return `👤 ${msg.contactMessage.displayName}`;

    // Album (multiple images)
    if (msg.albumMessage) return '🖼️ Album';
  }

  return null;
}

// Get media type indicator for raw format messages
export function getRawMediaType(content: any): string | null {
  const msg = content?.message;
  if (!msg) return null;

  if (msg.imageMessage) return 'image';
  if (msg.videoMessage) return 'video';
  if (msg.audioMessage || msg.pttMessage) return 'audio';
  if (msg.documentMessage) return 'document';
  if (msg.stickerMessage) return 'sticker';
  if (msg.locationMessage) return 'location';
  if (msg.contactMessage) return 'contact';
  if (msg.albumMessage) return 'album';

  return null;
}

// Check if a message has any renderable content
export function isMessageRenderable(message: { type: string; content: any }): boolean {
  const { type, content } = message;
  if (!content) return false;

  // Filter out protocol/system messages that have no user-facing content
  if (isProtocolMessage(content)) return false;

  // For TEXT type, we need actual text to display
  if (type === 'TEXT') {
    const textContent = content.text || getMessageText(content);
    return !!textContent && textContent.trim().length > 0;
  }

  // For media types, check if we have content to show
  if (type === 'IMAGE' || type === 'VIDEO') {
    // Has media URL or has caption/text
    if (content.mediaUrl) return true;
    if (content.caption || content.text) return true;
    // Or has raw format we can extract text from
    const extractedText = getMessageText(content);
    if (extractedText) return true;
    // Show placeholder even without media URL (historical sync)
    return true;
  }

  if (type === 'AUDIO') {
    return !!content.mediaUrl || true; // Show placeholder for audio
  }

  if (type === 'DOCUMENT') {
    return !!content.mediaUrl || !!content.fileName || true; // Show placeholder
  }

  if (type === 'STICKER') return true;

  // For other types (LOCATION, CONTACT, TEMPLATE, etc.), check if we have any content
  if (content.text) return true;
  if (content.caption) return true;
  if (content.mediaUrl) return true;

  const extractedText = getMessageText(content);
  if (extractedText) return true;

  const rawMediaType = getRawMediaType(content);
  if (rawMediaType) return true;

  return false;
}

// Download file helper
export function downloadFile(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
