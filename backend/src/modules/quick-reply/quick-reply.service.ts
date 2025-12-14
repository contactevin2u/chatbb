/**
 * Quick Reply Service
 *
 * Business logic for quick reply/template management
 */

import { prisma } from '../../core/database/prisma';

export interface QuickReplyContent {
  text: string;
  media?: {
    type: 'image' | 'video' | 'audio' | 'document';
    url: string;
    filename?: string;
    mimetype?: string;
  };
}

export interface CreateQuickReplyInput {
  organizationId: string;
  name: string;
  shortcut: string;
  content: QuickReplyContent;
  category?: string;
}

export interface UpdateQuickReplyInput {
  name?: string;
  shortcut?: string;
  content?: QuickReplyContent;
  category?: string;
}

export class QuickReplyService {
  /**
   * List all quick replies for an organization
   */
  async listQuickReplies(organizationId: string, search?: string) {
    const where: any = { organizationId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { shortcut: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ];
    }

    const quickReplies = await prisma.quickReply.findMany({
      where,
      orderBy: [{ usageCount: 'desc' }, { name: 'asc' }],
    });

    return quickReplies;
  }

  /**
   * Search quick replies by shortcut prefix (for autocomplete)
   */
  async searchByShortcut(organizationId: string, prefix: string, limit = 5) {
    const quickReplies = await prisma.quickReply.findMany({
      where: {
        organizationId,
        shortcut: { startsWith: prefix.toLowerCase(), mode: 'insensitive' },
      },
      orderBy: [{ usageCount: 'desc' }, { shortcut: 'asc' }],
      take: limit,
    });

    return quickReplies;
  }

  /**
   * Get a single quick reply by ID
   */
  async getQuickReply(id: string, organizationId: string) {
    const quickReply = await prisma.quickReply.findFirst({
      where: { id, organizationId },
    });

    if (!quickReply) {
      throw new Error('Quick reply not found');
    }

    return quickReply;
  }

  /**
   * Get a quick reply by shortcut
   */
  async getByShortcut(organizationId: string, shortcut: string) {
    const quickReply = await prisma.quickReply.findFirst({
      where: {
        organizationId,
        shortcut: { equals: shortcut.toLowerCase(), mode: 'insensitive' },
      },
    });

    return quickReply;
  }

  /**
   * Create a new quick reply
   */
  async createQuickReply(input: CreateQuickReplyInput) {
    const { organizationId, name, shortcut, content, category } = input;

    // Check for duplicate shortcut
    const existing = await prisma.quickReply.findFirst({
      where: {
        organizationId,
        shortcut: { equals: shortcut.toLowerCase(), mode: 'insensitive' },
      },
    });

    if (existing) {
      throw new Error(`Shortcut "${shortcut}" already exists`);
    }

    const quickReply = await prisma.quickReply.create({
      data: {
        organizationId,
        name,
        shortcut: shortcut.toLowerCase(),
        content: content as any,
        category,
      },
    });

    return quickReply;
  }

  /**
   * Update a quick reply
   */
  async updateQuickReply(
    id: string,
    organizationId: string,
    input: UpdateQuickReplyInput
  ) {
    const quickReply = await prisma.quickReply.findFirst({
      where: { id, organizationId },
    });

    if (!quickReply) {
      throw new Error('Quick reply not found');
    }

    // Check for duplicate shortcut if changing
    if (input.shortcut && input.shortcut.toLowerCase() !== quickReply.shortcut) {
      const existing = await prisma.quickReply.findFirst({
        where: {
          organizationId,
          shortcut: { equals: input.shortcut.toLowerCase(), mode: 'insensitive' },
          id: { not: id },
        },
      });

      if (existing) {
        throw new Error(`Shortcut "${input.shortcut}" already exists`);
      }
    }

    const updated = await prisma.quickReply.update({
      where: { id },
      data: {
        name: input.name,
        shortcut: input.shortcut?.toLowerCase(),
        content: input.content as any,
        category: input.category,
      },
    });

    return updated;
  }

  /**
   * Delete a quick reply
   */
  async deleteQuickReply(id: string, organizationId: string) {
    const quickReply = await prisma.quickReply.findFirst({
      where: { id, organizationId },
    });

    if (!quickReply) {
      throw new Error('Quick reply not found');
    }

    await prisma.quickReply.delete({
      where: { id },
    });
  }

  /**
   * Increment usage count for a quick reply
   */
  async incrementUsageCount(id: string, organizationId: string) {
    await prisma.quickReply.updateMany({
      where: { id, organizationId },
      data: { usageCount: { increment: 1 } },
    });
  }

  /**
   * Get categories for organization
   */
  async getCategories(organizationId: string) {
    const result = await prisma.quickReply.findMany({
      where: { organizationId, category: { not: null } },
      distinct: ['category'],
      select: { category: true },
    });

    return result.map((r) => r.category).filter(Boolean) as string[];
  }
}

export const quickReplyService = new QuickReplyService();
