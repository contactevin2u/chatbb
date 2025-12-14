/**
 * Identifier Normalization Utility
 *
 * Centralizes all WhatsApp JID normalization logic to prevent
 * inconsistent identifier handling across the codebase.
 *
 * ALL contact creation/update paths MUST use functions from this file
 * to ensure consistent behavior across the codebase.
 */

import { redisClient } from '../../core/cache/redis.client';
import { prisma } from '../../core/database/prisma';
import { ChannelType, Prisma } from '@prisma/client';
import { logger } from './logger';

// Contact type returned by our functions
export type ContactResult = {
  id: string;
  identifier: string;
  displayName: string | null;
  avatarUrl: string | null;
  isGroup: boolean;
  isNew: boolean;
};

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
      }, 'FAILED: LID not found in Redis - will try database fallback');

      // DATABASE FALLBACK: Try to find an existing contact with this LID stored
      // This helps when LID mappings weren't in Redis but we've seen this LID before
      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { organizationId: true },
      });

      if (channel) {
        // First check if there's a contact with this exact LID identifier
        const existingLidContact = await prisma.contact.findFirst({
          where: {
            organizationId: channel.organizationId,
            channelType: ChannelType.WHATSAPP,
            identifier: normalized,
          },
          select: { id: true, identifier: true },
        });

        if (existingLidContact) {
          logger.info({
            channelId,
            lid: lidPart,
            contactId: existingLidContact.id,
          }, 'Found existing contact with LID identifier');
          // Contact already exists with this LID, use it as-is
          return normalized;
        }

        // Check if we have metadata stored that maps this LID to a phone
        // This is stored when we successfully resolve an LID and save the contact
        const lidMetadataKey = `lid-contact:${channelId}:${lidPart}`;
        const storedPhoneNumber = await redisClient.get(lidMetadataKey);
        if (storedPhoneNumber) {
          const resolvedNormalized = normalizeIdentifier(storedPhoneNumber);
          logger.info({
            channelId,
            lid: lidPart,
            storedPhone: storedPhoneNumber,
            normalized: resolvedNormalized,
          }, 'SUCCESS: Resolved LID from stored metadata');
          return resolvedNormalized;
        }
      }

    } catch (error) {
      logger.error({ channelId, jidOrId, error }, 'ERROR: Failed to lookup LID mapping');
    }
  }

  return normalized;
}

/**
 * Store LID-to-phone mapping for future lookups
 * Call this when you know the relationship between an LID and a phone number
 *
 * IMPORTANT: This also triggers duplicate contact merge if both LID and PN contacts exist
 */
export async function storeLidMapping(channelId: string, lid: string, phoneNumber: string): Promise<void> {
  try {
    const normalizedPhone = normalizeIdentifier(phoneNumber);
    const normalizedLid = normalizeIdentifier(lid);

    // Skip if they're the same (no mapping needed)
    if (normalizedLid === normalizedPhone) {
      return;
    }

    // Store in the standard LID hash
    await redisClient.hset(`lid:${channelId}`, normalizedLid, normalizedPhone);
    await redisClient.hset(`pn:${channelId}`, normalizedPhone, normalizedLid);

    // Also store in a contact-specific key for quick lookup
    await redisClient.set(`lid-contact:${channelId}:${normalizedLid}`, normalizedPhone);

    logger.info({
      channelId,
      lid: normalizedLid,
      phone: normalizedPhone,
    }, 'Stored LID-to-phone mapping');

    // CRITICAL: Trigger duplicate contact merge
    // When we discover a LID↔PN mapping, merge any duplicate contacts
    await mergeDuplicateContacts(channelId, normalizedLid, normalizedPhone);
  } catch (error) {
    logger.warn({ channelId, lid, phoneNumber, error }, 'Failed to store LID mapping');
  }
}

/**
 * Merge duplicate contacts when we discover LID↔PN mapping
 *
 * If we have two contacts for the same person (one with LID identifier, one with PN identifier),
 * merge them into one contact using the phone number as the canonical identifier.
 *
 * This handles the case where:
 * 1. User messages via LID format → contact created with LID identifier
 * 2. Later, user messages via PN format → would create duplicate contact
 * 3. When mapping is discovered → merge the LID contact into PN contact
 */
export async function mergeDuplicateContacts(
  channelId: string,
  lidIdentifier: string,
  phoneIdentifier: string
): Promise<void> {
  try {
    // Get channel to find organization
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { organizationId: true },
    });

    if (!channel) return;

    const orgId = channel.organizationId;

    // Find contacts with both identifiers
    const [lidContact, phoneContact] = await Promise.all([
      prisma.contact.findUnique({
        where: {
          organizationId_channelType_identifier: {
            organizationId: orgId,
            channelType: ChannelType.WHATSAPP,
            identifier: lidIdentifier,
          },
        },
        include: {
          conversations: { select: { id: true } },
        },
      }),
      prisma.contact.findUnique({
        where: {
          organizationId_channelType_identifier: {
            organizationId: orgId,
            channelType: ChannelType.WHATSAPP,
            identifier: phoneIdentifier,
          },
        },
        include: {
          conversations: { select: { id: true } },
        },
      }),
    ]);

    // No merge needed if either doesn't exist
    if (!lidContact || !phoneContact) {
      // If only LID contact exists, update its identifier to phone number
      if (lidContact && !phoneContact) {
        await prisma.contact.update({
          where: { id: lidContact.id },
          data: { identifier: phoneIdentifier },
        });
        logger.info({
          channelId,
          contactId: lidContact.id,
          oldIdentifier: lidIdentifier,
          newIdentifier: phoneIdentifier,
        }, 'Updated LID contact identifier to phone number');
      }
      return;
    }

    // Both contacts exist - need to merge
    logger.info({
      channelId,
      lidContactId: lidContact.id,
      phoneContactId: phoneContact.id,
      lidIdentifier,
      phoneIdentifier,
    }, 'Merging duplicate contacts (LID → PN)');

    // Use transaction for atomic merge
    await prisma.$transaction(async (tx) => {
      // 1. Move all conversations from LID contact to phone contact
      for (const conv of lidContact.conversations) {
        // Check if phone contact already has a conversation in this channel
        const existingConv = await tx.conversation.findFirst({
          where: {
            contactId: phoneContact.id,
            channelId,
          },
        });

        if (existingConv) {
          // Move messages from LID conversation to existing conversation
          await tx.message.updateMany({
            where: { conversationId: conv.id },
            data: { conversationId: existingConv.id },
          });

          // Update unread count
          const lidConv = await tx.conversation.findUnique({
            where: { id: conv.id },
            select: { unreadCount: true },
          });

          if (lidConv && lidConv.unreadCount > 0) {
            await tx.conversation.update({
              where: { id: existingConv.id },
              data: { unreadCount: { increment: lidConv.unreadCount } },
            });
          }

          // Delete the LID conversation (messages already moved)
          await tx.conversation.delete({ where: { id: conv.id } });
        } else {
          // No existing conversation - just update the contact reference
          await tx.conversation.update({
            where: { id: conv.id },
            data: { contactId: phoneContact.id },
          });
        }
      }

      // 2. Merge contact metadata - prefer phone contact data, fill gaps from LID contact
      const updateData: any = {};

      if (!phoneContact.displayName && lidContact.displayName) {
        updateData.displayName = lidContact.displayName;
      }
      if (!phoneContact.avatarUrl && lidContact.avatarUrl) {
        updateData.avatarUrl = lidContact.avatarUrl;
      }

      if (Object.keys(updateData).length > 0) {
        await tx.contact.update({
          where: { id: phoneContact.id },
          data: updateData,
        });
      }

      // 3. Delete the LID contact
      await tx.contact.delete({ where: { id: lidContact.id } });

      logger.info({
        channelId,
        deletedContactId: lidContact.id,
        mergedIntoContactId: phoneContact.id,
        conversationsMerged: lidContact.conversations.length,
      }, 'Successfully merged duplicate contacts');
    });
  } catch (error) {
    logger.error({ channelId, lidIdentifier, phoneIdentifier, error }, 'Failed to merge duplicate contacts');
  }
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
 *
 * IMPORTANT: isGroup should be determined from the original JID using
 * jid.endsWith('@g.us') BEFORE normalization, not from the identifier
 *
 * @param options.forceDisplayNameUpdate - If true, always update displayName if provided (for sync operations)
 */
export async function getOrCreateContact(options: {
  organizationId: string;
  channelType: ChannelType;
  identifier: string;
  displayName?: string | null;
  isGroup: boolean; // Required - must be determined from original JID
  forceDisplayNameUpdate?: boolean; // For sync operations that should always update
}): Promise<ContactResult> {
  const { organizationId, channelType, identifier, displayName, isGroup, forceDisplayNameUpdate = false } = options;

  // isGroup is now explicitly passed, determined from original JID (jid.endsWith('@g.us'))
  const isGroupContact = isGroup;

  // Check if contact exists first to determine if it's new
  const existing = await prisma.contact.findUnique({
    where: {
      organizationId_channelType_identifier: {
        organizationId,
        channelType,
        identifier,
      },
    },
    select: { id: true, displayName: true },
  });

  const isNew = !existing;

  // Determine if we should update displayName
  let shouldUpdateName = false;

  if (displayName) {
    if (forceDisplayNameUpdate) {
      // Sync operations: always update if we have a name and it's different
      shouldUpdateName = existing?.displayName !== displayName;
    } else if (isGroupContact) {
      // Groups: update if new name is not a fallback and different from current
      const isValidGroupName = displayName !== 'Group Chat';
      shouldUpdateName = isValidGroupName && existing?.displayName !== displayName;
    } else {
      // Individuals: only update if they don't have a name yet (preserve manual edits)
      const existingHasNoName = !existing?.displayName || existing.displayName.trim() === '';
      shouldUpdateName = existingHasNoName;
    }
  }

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
        isGroup: isGroupContact,
      },
      update: {
        ...(shouldUpdateName ? { displayName } : {}),
        // Always ensure isGroup is correct (fix for existing contacts)
        isGroup: isGroupContact,
      },
      select: {
        id: true,
        identifier: true,
        displayName: true,
        avatarUrl: true,
        isGroup: true,
      },
    });

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
          isGroup: true,
        },
      });

      if (fetched) {
        // Recalculate shouldUpdateName for fetched contact
        let shouldUpdateFetchedName = false;
        if (displayName) {
          if (forceDisplayNameUpdate) {
            shouldUpdateFetchedName = fetched.displayName !== displayName;
          } else if (isGroupContact) {
            const isValidGroupName = displayName !== 'Group Chat';
            shouldUpdateFetchedName = isValidGroupName && fetched.displayName !== displayName;
          } else {
            const fetchedHasNoName = !fetched.displayName || fetched.displayName.trim() === '';
            shouldUpdateFetchedName = fetchedHasNoName;
          }
        }

        const shouldUpdateFetched = shouldUpdateFetchedName || fetched.isGroup !== isGroupContact;

        if (shouldUpdateFetched) {
          const updated = await prisma.contact.update({
            where: { id: fetched.id },
            data: {
              ...(shouldUpdateFetchedName ? { displayName } : {}),
              isGroup: isGroupContact,
            },
            select: {
              id: true,
              identifier: true,
              displayName: true,
              avatarUrl: true,
              isGroup: true,
            },
          });
          return { ...updated, isNew: false };
        }
        return { ...fetched, isNew: false };
      }
    }
    throw error;
  }
}

/**
 * Upsert contact from WhatsApp sync events (contacts.upsert, contacts.update, history sync)
 *
 * This is the ONLY function that should be used for syncing contacts from WhatsApp events.
 * It handles LID resolution and uses consistent displayName update logic.
 *
 * @param channelId - The WhatsApp channel ID
 * @param contactData - Contact data from Baileys event
 * @returns The upserted contact or null if skipped
 */
export async function upsertContactFromSync(
  channelId: string,
  contactData: {
    id: string;
    phoneNumber?: string;
    name?: string;
    notify?: string;
    verifiedName?: string;
    pushname?: string;
  }
): Promise<ContactResult | null> {
  try {
    // Get channel for organization ID
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { organizationId: true },
    });

    if (!channel) return null;

    const contactId = contactData.id;
    const phoneNumber = contactData.phoneNumber;

    // Skip groups in contact sync (they're handled separately)
    if (contactId?.endsWith('@g.us')) return null;

    // Resolve identifier - prefer phone number over LID
    let identifier: string;

    if (contactId?.includes('@lid') && phoneNumber) {
      // id is LID, use phoneNumber instead
      identifier = normalizeIdentifier(phoneNumber);

      // Store the LID mapping (this also triggers duplicate merge)
      const lidPart = normalizeIdentifier(contactId);
      await storeLidMapping(channelId, lidPart, identifier);
    } else if (contactId) {
      // Try to resolve LID to phone number
      identifier = await resolveIdentifier(channelId, contactId);
    } else {
      return null;
    }

    if (!identifier) return null;

    // Get display name from various fields (priority order)
    const displayName = contactData.name
      || contactData.verifiedName
      || contactData.notify
      || contactData.pushname
      || null;

    // Upsert contact with force update for sync operations
    return await getOrCreateContact({
      organizationId: channel.organizationId,
      channelType: ChannelType.WHATSAPP,
      identifier,
      displayName,
      isGroup: false,
      forceDisplayNameUpdate: true, // Sync operations should update displayName
    });
  } catch (error) {
    logger.error({ channelId, contactData, error }, 'Failed to upsert contact from sync');
    return null;
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
