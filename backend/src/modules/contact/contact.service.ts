/**
 * Contact Service
 *
 * Business logic for contact management
 */

import { ChannelType, Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';

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

    const where: Prisma.ContactWhereInput = {
      organizationId,
    };

    // Filter by channel type
    if (channelType) {
      where.channelType = channelType;
    }

    // Search by name or identifier
    if (search) {
      where.OR = [
        { displayName: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { identifier: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
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
