// Inbox components
export { ConversationListItem } from './conversation-list-item';
export type { ConversationData, ConversationContact, ConversationLastMessage } from './conversation-list-item';

export { MessageBubble } from './message-bubble';
export type { MessageData, MessageContent, MessageReaction, QuotedMessage } from './message-bubble';

export { ChatHeader } from './chat-header';
export type { ChatHeaderConversation, ChatHeaderContact } from './chat-header';

export { MessageInput } from './message-input';
export type { ReplyToMessage, SelectedMedia } from './message-input';

export { ContactInfoPanel } from './contact-info-panel';
export type {
  ContactPanelConversation,
  ContactPanelContact,
  ContactPanelChannel,
  ContactPanelTag,
  ContactPanelTagRelation,
  ContactPanelNote,
  ContactPanelUser,
  GroupParticipant,
  GroupParticipantsData,
} from './contact-info-panel';

export { OrderPanel } from './order-panel';
export { OrderOpsTab } from './orderops-tab';

// Context
export { InboxProvider, useInbox } from './inbox-context';
export type { InboxContextValue } from './inbox-context';

// New modular components
export { MessageList } from './chat';
export type { MessageListProps } from './chat';

export { MessageInputArea } from './chat';
export type { MessageInputAreaProps } from './chat';

export { ConversationList } from './conversation-list';
export type { ConversationListProps } from './conversation-list';
