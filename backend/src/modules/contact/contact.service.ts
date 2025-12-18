/**
 * Contact Service
 *
 * Business logic for contact management
 * Uses pg_trgm for fuzzy text search on names and identifiers
 */

import { ChannelType, Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { logger } from '../../shared/utils/logger';

// Minimum similarity threshold for fuzzy search (0-1, higher = stricter)
const FUZZY_SIMILARITY_THRESHOLD = 0.2;

export interface ListContactsInput {
  organizationId: string;
  search?: string;
  channelType?: ChannelType;
  tagIds?: string[];
  limit?: number;
  offset?: number;
  sortBy?: 'displayName' | 'identifier' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface CreateContactInput {
  organizationId: string;
  identifier: string;
  channelType: ChannelType;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatarUrl?: string;
  metadata?: Record<string, any>;
}

export interface UpdateContactInput {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatarUrl?: string;
  metadata?: Record<string, any>;
}

export class ContactService {
  /**
   * List contacts with filters and pagination
   * Uses pg_trgm fuzzy search when search term is provided
   */
  async listContacts(input: ListContactsInput) {
    const {
      organizationId,
      search,
      channelType,
      tagIds,
      limit = 50,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = input;

    // If search is provided, use fuzzy search with pg_trgm
    if (search && search.trim().length > 0) {
      return this.searchContactsFuzzy(input);
    }

    const where: Prisma.ContactWhereInput = {
      organizationId,
    };

    // Filter by channel type
    if (channelType) {
      where.channelType = channelType;
    }

    // Filter by tags
    if (tagIds && tagIds.length > 0) {
      where.tags = {
        some: {
          tagId: { in: tagIds },
        },
      };
    }

    // Build orderBy
    const orderBy: Prisma.ContactOrderByWithRelationInput = {};
    orderBy[sortBy] = sortOrder;

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy,
        take: limit,
        skip: offset,
        include: {
          tags: {
            include: {
              tag: true,
            },
          },
          // Include the most recent conversation for quick navigation
          conversations: {
            orderBy: { lastMessageAt: 'desc' },
            take: 1,
            select: { id: true },
          },
          _count: {
            select: {
              conversations: true,
            },
          },
        },
      }),
      prisma.contact.count({ where }),
    ]);

    return {
      contacts: contacts.map((contact) => ({
        ...contact,
        tags: contact.tags.map((t) => t.tag),
        conversationCount: contact._count.conversations,
        // Include the most recent conversation ID for linking
        latestConversationId: contact.conversations[0]?.id || null,
        conversations: undefined,
        _count: undefined,
      })),
      total,
      limit,
      offset,
    };
  }

  /**
   * Fuzzy search contacts using pg_trgm trigram similarity
   * Matches partial names, typos, and phone number fragments
   */
  private async searchContactsFuzzy(input: ListContactsInput) {
    const {
      organizationId,
      search,
      channelType,
      tagIds,
      limit = 50,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = input;

    try {
      // Build channel type filter
      const channelFilter = channelType ? `AND channel_type = '${channelType}'` : '';

      // Build tag filter (if tags specified, contact must have at least one)
      const tagFilter = tagIds && tagIds.length > 0
        ? `AND EXISTS (SELECT 1 FROM contact_tags ct WHERE ct.contact_id = c.id AND ct.tag_id = ANY(ARRAY[${tagIds.map(t => `'${t}'::uuid`).join(',')}]))`
        : '';

      // Map sortBy to actual column names
      const sortColumn = {
        displayName: 'display_name',
        identifier: 'identifier',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      }[sortBy] || 'created_at';

      // Use pg_trgm similarity for fuzzy matching
      // GREATEST picks the best similarity score across all searchable fields
      const results = await prisma.$queryRaw<
        Array<{
          id: string;
          organization_id: string;
          channel_type: string;
          identifier: string;
          display_name: string | null;
          first_name: string | null;
          last_name: string | null;
          email: string | null;
          avatar_url: string | null;
          metadata: any;
          created_at: Date;
          updated_at: Date;
          similarity_score: number;
        }>
      >`
        SELECT
          c.*,
          GREATEST(
            COALESCE(similarity(c.display_name, ${search}), 0),
            COALESCE(similarity(c.identifier, ${search}), 0),
            COALESCE(similarity(c.first_name, ${search}), 0),
            COALESCE(similarity(c.last_name, ${search}), 0),
            COALESCE(similarity(c.email, ${search}), 0),
            -- Also check for substring match (for phone numbers)
            CASE WHEN c.identifier ILIKE '%' || ${search} || '%' THEN 0.5 ELSE 0 END,
            CASE WHEN c.display_name ILIKE '%' || ${search} || '%' THEN 0.4 ELSE 0 END
          ) as similarity_score
        FROM contacts c
        WHERE c.organization_id = ${organizationId}::uuid
          AND (
            c.display_name % ${search}
            OR c.identifier % ${search}
            OR c.first_name % ${search}
            OR c.last_name % ${search}
            OR c.email % ${search}
            OR c.identifier ILIKE '%' || ${search} || '%'
            OR c.display_name ILIKE '%' || ${search} || '%'
          )
          ${Prisma.raw(channelFilter)}
          ${Prisma.raw(tagFilter)}
        ORDER BY similarity_score DESC, ${Prisma.raw(sortColumn)} ${Prisma.raw(sortOrder.toUpperCase())}
        LIMIT ${limit}
        OFFSET ${offset}
      `;

      // Get total count for pagination
      const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count
        FROM contacts c
        WHERE c.organization_id = ${organizationId}::uuid
          AND (
            c.display_name % ${search}
            OR c.identifier % ${search}
            OR c.first_name % ${search}
            OR c.last_name % ${search}
            OR c.email % ${search}
            OR c.identifier ILIKE '%' || ${search} || '%'
            OR c.display_name ILIKE '%' || ${search} || '%'
          )
          ${Prisma.raw(channelFilter)}
          ${Prisma.raw(tagFilter)}
      `;

      const total = Number(countResult[0]?.count || 0);

      // Fetch tags and conversation counts for found contacts
      const contactIds = results.map((r) => r.id);

      if (contactIds.length === 0) {
        return { contacts: [], total: 0, limit, offset };
      }

      // Get tags for all contacts
      const contactTags = await prisma.contactTag.findMany({
        where: { contactId: { in: contactIds } },
        include: { tag: true },
      });

      // Get conversation counts
      const conversationCounts = await prisma.conversation.groupBy({
        by: ['contactId'],
        where: { contactId: { in: contactIds } },
        _count: true,
      });

      // Get latest conversation IDs
      const latestConversations = await prisma.conversation.findMany({
        where: { contactId: { in: contactIds } },
        orderBy: { lastMessageAt: 'desc' },
        distinct: ['contactId'],
        select: { id: true, contactId: true },
      });

      // Map results to match expected format
      const contacts = results.map((r) => {
        const tags = contactTags.filter((ct) => ct.contactId === r.id).map((ct) => ct.tag);
        const convCount = conversationCounts.find((cc) => cc.contactId === r.id)?._count || 0;
        const latestConv = latestConversations.find((lc) => lc.contactId === r.id);

        return {
          id: r.id,
          organizationId: r.organization_id,
          channelType: r.channel_type as ChannelType,
          identifier: r.identifier,
          displayName: r.display_name,
          firstName: r.first_name,
          lastName: r.last_name,
          email: r.email,
          avatarUrl: r.avatar_url,
          metadata: r.metadata,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          tags,
          conversationCount: convCount,
          latestConversationId: latestConv?.id || null,
          similarityScore: r.similarity_score, // Expose for debugging/UI
        };
      });

      logger.debug({ search, resultsCount: contacts.length, topScore: contacts[0]?.similarityScore }, 'Fuzzy contact search completed');

      return { contacts, total, limit, offset };
    } catch (error: any) {
      // Fallback to regular contains search if pg_trgm fails
      logger.warn({ error: error.message }, 'Fuzzy search failed, falling back to substring search');
      return this.searchContactsSubstring(input);
    }
  }

  /**
   * Fallback substring search (used when pg_trgm unavailable)
   */
  private async searchContactsSubstring(input: ListContactsInput) {
    const {
      organizationId,
      search,
      channelType,
      tagIds,
      limit = 50,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = input;

    const where: Prisma.ContactWhereInput = {
      organizationId,
      OR: [
        { displayName: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { identifier: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    };

    if (channelType) {
      where.channelType = channelType;
    }

    if (tagIds && tagIds.length > 0) {
      where.tags = { some: { tagId: { in: tagIds } } };
    }

    const orderBy: Prisma.ContactOrderByWithRelationInput = {};
    orderBy[sortBy] = sortOrder;

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy,
        take: limit,
        skip: offset,
        include: {
          tags: { include: { tag: true } },
          conversations: { orderBy: { lastMessageAt: 'desc' }, take: 1, select: { id: true } },
          _count: { select: { conversations: true } },
        },
      }),
      prisma.contact.count({ where }),
    ]);

    return {
      contacts: contacts.map((contact) => ({
        ...contact,
        tags: contact.tags.map((t) => t.tag),
        conversationCount: contact._count.conversations,
        latestConversationId: contact.conversations[0]?.id || null,
        conversations: undefined,
        _count: undefined,
      })),
      total,
      limit,
      offset,
    };
  }

  /**
   * Get a single contact by ID
   */
  async getContact(contactId: string, organizationId: string) {
    const contact = await prisma.contact.findFirst({
      where: {
        id: contactId,
        organizationId,
      },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
        customFields: {
          include: {
            definition: true,
          },
        },
        conversations: {
          take: 5,
          orderBy: { lastMessageAt: 'desc' },
          include: {
            channel: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
        },
      },
    });

    if (!contact) {
      throw new Error('Contact not found');
    }

    return {
      ...contact,
      tags: contact.tags.map((t) => t.tag),
    };
  }

  /**
   * Create a new contact
   */
  async createContact(input: CreateContactInput) {
    // Check if contact already exists
    const existing = await prisma.contact.findFirst({
      where: {
        organizationId: input.organizationId,
        channelType: input.channelType,
        identifier: input.identifier,
      },
    });

    if (existing) {
      throw new Error('Contact with this identifier already exists');
    }

    const contact = await prisma.contact.create({
      data: {
        organizationId: input.organizationId,
        identifier: input.identifier,
        channelType: input.channelType,
        displayName: input.displayName,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        avatarUrl: input.avatarUrl,
        metadata: input.metadata || {},
      },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    return {
      ...contact,
      tags: contact.tags.map((t) => t.tag),
    };
  }

  /**
   * Update a contact
   */
  async updateContact(contactId: string, organizationId: string, input: UpdateContactInput) {
    const contact = await prisma.contact.findFirst({
      where: {
        id: contactId,
        organizationId,
      },
    });

    if (!contact) {
      throw new Error('Contact not found');
    }

    const updated = await prisma.contact.update({
      where: { id: contactId },
      data: {
        displayName: input.displayName,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        avatarUrl: input.avatarUrl,
        metadata: input.metadata,
      },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    return {
      ...updated,
      tags: updated.tags.map((t) => t.tag),
    };
  }

  /**
   * Delete a contact
   */
  async deleteContact(contactId: string, organizationId: string) {
    const contact = await prisma.contact.findFirst({
      where: {
        id: contactId,
        organizationId,
      },
    });

    if (!contact) {
      throw new Error('Contact not found');
    }

    await prisma.contact.delete({
      where: { id: contactId },
    });

    return { success: true };
  }

  /**
   * Add a tag to a contact
   */
  async addTag(contactId: string, organizationId: string, tagId: string) {
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, organizationId },
    });

    if (!contact) {
      throw new Error('Contact not found');
    }

    const tag = await prisma.tag.findFirst({
      where: { id: tagId, organizationId },
    });

    if (!tag) {
      throw new Error('Tag not found');
    }

    // Check if already tagged
    const existing = await prisma.contactTag.findFirst({
      where: { contactId, tagId },
    });

    if (existing) {
      throw new Error('Contact already has this tag');
    }

    await prisma.contactTag.create({
      data: { contactId, tagId },
    });

    return this.getContact(contactId, organizationId);
  }

  /**
   * Remove a tag from a contact
   */
  async removeTag(contactId: string, organizationId: string, tagId: string) {
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, organizationId },
    });

    if (!contact) {
      throw new Error('Contact not found');
    }

    await prisma.contactTag.deleteMany({
      where: { contactId, tagId },
    });

    return this.getContact(contactId, organizationId);
  }

  /**
   * Get contact by conversation (for inline editing)
   */
  async getContactByConversation(conversationId: string, organizationId: string) {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        organizationId,
      },
      include: {
        contact: {
          include: {
            tags: {
              include: {
                tag: true,
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    return {
      ...conversation.contact,
      tags: conversation.contact.tags.map((t) => t.tag),
    };
  }
}

export const contactService = new ContactService();
