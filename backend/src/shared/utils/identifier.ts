/**
 * Identifier Normalization Utility
 *
 * Centralizes all WhatsApp JID normalization logic to prevent
 * inconsistent identifier handling across the codebase.
 */

import { redisClient } from '../../core/cache/redis.client';
import { prisma } from '../../core/database/prisma';
import { ChannelType, Prisma } from '@prisma/client';
import { logger } from './logger';

/**
 * Normalize WhatsApp JID to consistent contact identifier
 *
 * Handles various formats:
 * - 1234567890@s.whatsapp.net -> 1234567890
 * - +1234567890@s.whatsapp.net -> 1234567890
 * - 1234567890:0@lid -> 1234567890
 * - 1234567890:0@s.whatsapp.net -> 1234567890
 * - Groups: 123456789-1234567890@g.us -> 123456789-1234567890
 *
 * @param jidOrId - The JID or identifier to normalize
 * @returns Normalized identifier (digits only for individuals, full ID for groups)
 */
export function normalizeIdentifier(jidOrId: string): string {
  if (!jidOrId) {
    return '';
  }

  // Split off the domain part (@s.whatsapp.net, @lid, @g.us)
  let identifier = jidOrId.split('@')[0];

  // Check if this is a group (preserve full ID including hyphens)
  if (jidOrId.endsWith('@g.us')) {
    return identifier;
  }

  // Remove LID suffix (e.g., "1234567890:0" -> "1234567890")
  if (identifier.includes(':')) {
    identifier = identifier.split(':')[0];
  }

  // Remove leading + sign
  identifier = identifier.replace(/^\+/, '');

  // Remove any remaining non-digit characters for phone numbers
  // This ensures consistency with all normalization approaches
  identifier = identifier.replace(/\D/g, '');

  return identifier;
}

/**
 * Resolve a WhatsApp JID to a normalized identifier, checking LID mappings
 *
 * This function should be used when processing incoming messages to ensure
 * we find existing contacts even when the JID format varies.
 *
 * @param channelId - The WhatsApp channel ID
 * @param jidOrId - The JID or identifier to resolve
 * @returns Normalized identifier
 */
export async function resolveIdentifier(channelId: string, jidOrId: string): Promise<string> {
  // First, get the basic normalized identifier
  const normalized = normalizeIdentifier(jidOrId);

  // Skip LID lookup for groups
  if (jidOrId.endsWith('@g.us')) {
    return normalized;
  }

  // Check if this is a LID format (has @lid suffix or :0 in the user part)
  const isLidFormat = jidOrId.includes('@lid') || jidOrId.includes(':');

  if (isLidFormat) {
    try {
      // Extract the LID part (before @)
      const lidPart = jidOrId.split('@')[0];

      // Log LID lookup attempt
      logger.info({
        channelId,
        originalJid: jidOrId,
        lidPart,
        redisKey: `lid:${channelId}`,
      }, 'Attempting LID lookup');

      // Try to get the phone number from LID mapping
      const phoneNumber = await redisClient.hget(`lid:${channelId}`, lidPart);
      if (phoneNumber) {
        const resolvedNormalized = normalizeIdentifier(phoneNumber);
        logger.info({
          channelId,
          originalJid: jidOrId,
          lid: lidPart,
          resolvedPhone: phoneNumber,
          normalized: resolvedNormalized,
        }, 'SUCCESS: Resolved LID to phone number');
        return resolvedNormalized;
      }

      // Also try without the :0 suffix
      const lidWithoutSuffix = lidPart.split(':')[0];
      if (lidWithoutSuffix !== lidPart) {
        const phoneNumber2 = await redisClient.hget(`lid:${channelId}`, lidWithoutSuffix);
        if (phoneNumber2) {
          const resolvedNormalized = normalizeIdentifier(phoneNumber2);
          logger.info({
            channelId,
            originalJid: jidOrId,
            lid: lidWithoutSuffix,
            resolvedPhone: phoneNumber2,
            normalized: resolvedNormalized,
          }, 'SUCCESS: Resolved LID (without suffix) to phone number');
          return resolvedNormalized;
        }
      }

      // Log all keys in this LID hash for debugging
      const allLidMappings = await redisClient.hgetall(`lid:${channelId}`);
      const mappingCount = Object.keys(allLidMappings || {}).length;

      logger.warn({
        channelId,
        originalJid: jidOrId,
        lidPart,
        lidWithoutSuffix,
        mappingCount,
        sampleMappings: Object.entries(allLidMappings || {}).slice(0, 5),
      }, 'FAILED: LID not found in Redis - creating contact with LID as identifier');

    } catch (error) {
      logger.error({ channelId, jidOrId, error }, 'ERROR: Failed to lookup LID mapping');
    }
  }

  return normalized;
}

/**
 * Build a JID from an identifier for sending messages
 *
 * @param identifier - The normalized identifier
 * @param isGroup - Whether this is a group
 * @returns Properly formatted JID
 */
export function buildJid(identifier: string, isGroup: boolean = false): string {
  // Remove any existing domain
  const clean = identifier.split('@')[0];

  if (isGroup || identifier.includes('-')) {
    return `${clean}@g.us`;
  }

  // Ensure only digits for phone numbers
  const digits = clean.replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

/**
 * Get or create a contact with upsert pattern
 * Uses Prisma upsert for atomic operation - prevents race conditions
 */
export async function getOrCreateContact(options: {
  organizationId: string;
  channelType: ChannelType;
  identifier: string;
  displayName?: string | null;
}): Promise<{
  id: string;
  identifier: string;
  displayName: string | null;
  avatarUrl: string | null;
  isNew: boolean;
}> {
  const { organizationId, channelType, identifier, displayName } = options;

  // Check if contact exists first to determine if it's new
  const existing = await prisma.contact.findUnique({
    where: {
      organizationId_channelType_identifier: {
        organizationId,
        channelType,
        identifier,
      },
    },
    select: { id: true },
  });

  const isNew = !existing;

  try {
    const contact = await prisma.contact.upsert({
      where: {
        organizationId_channelType_identifier: {
          organizationId,
          channelType,
          identifier,
        },
      },
      create: {
        organizationId,
        channelType,
        identifier,
        displayName,
      },
      update: {
        // Only update displayName if provided and contact doesn't have one
        ...(displayName ? {} : {}),
      },
      select: {
        id: true,
        identifier: true,
        displayName: true,
        avatarUrl: true,
      },
    });

    // Update displayName if provided and current is empty
    if (displayName && !contact.displayName) {
      const updated = await prisma.contact.update({
        where: { id: contact.id },
        data: { displayName },
        select: {
          id: true,
          identifier: true,
          displayName: true,
          avatarUrl: true,
        },
      });
      return { ...updated, isNew };
    }

    return { ...contact, isNew };
  } catch (error: any) {
    // Handle race condition - another process created the contact
    if (error.code === 'P2002') {
      logger.debug({ organizationId, identifier }, 'Contact race condition, fetching existing...');
      const fetched = await prisma.contact.findUnique({
        where: {
          organizationId_channelType_identifier: {
            organizationId,
            channelType,
            identifier,
          },
        },
        select: {
          id: true,
          identifier: true,
          displayName: true,
          avatarUrl: true,
        },
      });

      if (fetched) {
        return { ...fetched, isNew: false };
      }
    }
    throw error;
  }
}

/**
 * Get or create a conversation with upsert pattern
 * Uses Prisma upsert for atomic operation - prevents race conditions
 */
export async function getOrCreateConversation(options: {
  organizationId: string;
  channelId: string;
  contactId: string;
  isFromMe?: boolean;
}): Promise<{
  id: string;
  isNew: boolean;
}> {
  const { organizationId, channelId, contactId, isFromMe = false } = options;

  // Check if conversation exists first to determine if it's new
  const existing = await prisma.conversation.findUnique({
    where: {
      channelId_contactId: {
        channelId,
        contactId,
      },
    },
    select: { id: true, status: true },
  });

  const isNew = !existing;

  try {
    const conversation = await prisma.conversation.upsert({
      where: {
        channelId_contactId: {
          channelId,
          contactId,
        },
      },
      create: {
        organizationId,
        channelId,
        contactId,
        status: 'OPEN',
        lastMessageAt: new Date(),
        unreadCount: isFromMe ? 0 : 1,
      },
      update: {
        lastMessageAt: new Date(),
        // Only increment unread for incoming messages
        ...(isFromMe ? {} : { unreadCount: { increment: 1 } }),
      },
      select: {
        id: true,
        status: true,
      },
    });

    // Reopen closed conversations for incoming messages
    if (existing && existing.status === 'CLOSED' && !isFromMe) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: 'OPEN' },
      });
    }

    return { id: conversation.id, isNew };
  } catch (error: any) {
    // Handle race condition
    if (error.code === 'P2002') {
      logger.debug({ channelId, contactId }, 'Conversation race condition, fetching existing...');
      const fetched = await prisma.conversation.findUnique({
        where: {
          channelId_contactId: {
            channelId,
            contactId,
          },
        },
        select: { id: true },
      });

      if (fetched) {
        // Update the existing conversation
        await prisma.conversation.update({
          where: { id: fetched.id },
          data: {
            lastMessageAt: new Date(),
            ...(isFromMe ? {} : { unreadCount: { increment: 1 } }),
          },
        });
        return { id: fetched.id, isNew: false };
      }
    }
    throw error;
  }
}
