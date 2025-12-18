/**
 * Quick Reply Service
 *
 * Business logic for quick reply/template management
 * Uses pg_trgm for fuzzy text search on names and shortcuts
 */

import { prisma } from '../../core/database/prisma';
import { logger } from '../../shared/utils/logger';

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
   * Uses pg_trgm fuzzy search when search term is provided
   */
  async listQuickReplies(organizationId: string, search?: string) {
    // If search is provided, use fuzzy search
    if (search && search.trim().length > 0) {
      return this.searchQuickRepliesFuzzy(organizationId, search);
    }

    const quickReplies = await prisma.quickReply.findMany({
      where: { organizationId },
      orderBy: [{ usageCount: 'desc' }, { name: 'asc' }],
    });

    return quickReplies;
  }

  /**
   * Fuzzy search quick replies using pg_trgm
   */
  private async searchQuickRepliesFuzzy(organizationId: string, search: string) {
    try {
      const results = await prisma.$queryRaw<
        Array<{
          id: string;
          organization_id: string;
          name: string;
          shortcut: string;
          content: any;
          category: string | null;
          usage_count: number;
          created_at: Date;
          updated_at: Date;
          similarity_score: number;
        }>
      >`
        SELECT
          qr.*,
          GREATEST(
            COALESCE(similarity(qr.name, ${search}), 0),
            COALESCE(similarity(qr.shortcut, ${search}), 0),
            COALESCE(similarity(qr.category, ${search}), 0),
            CASE WHEN qr.name ILIKE '%' || ${search} || '%' THEN 0.4 ELSE 0 END,
            CASE WHEN qr.shortcut ILIKE '%' || ${search} || '%' THEN 0.5 ELSE 0 END
          ) as similarity_score
        FROM quick_replies qr
        WHERE qr.organization_id = ${organizationId}::uuid
          AND (
            qr.name % ${search}
            OR qr.shortcut % ${search}
            OR qr.category % ${search}
            OR qr.name ILIKE '%' || ${search} || '%'
            OR qr.shortcut ILIKE '%' || ${search} || '%'
          )
        ORDER BY similarity_score DESC, qr.usage_count DESC, qr.name ASC
      `;

      // Map to expected format
      return results.map((r) => ({
        id: r.id,
        organizationId: r.organization_id,
        name: r.name,
        shortcut: r.shortcut,
        content: r.content,
        category: r.category,
        usageCount: r.usage_count,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        similarityScore: r.similarity_score,
      }));
    } catch (error: any) {
      // Fallback to substring search if pg_trgm fails
      logger.warn({ error: error.message }, 'Fuzzy quick reply search failed, falling back to substring');
      return this.searchQuickRepliesSubstring(organizationId, search);
    }
  }

  /**
   * Fallback substring search
   */
  private async searchQuickRepliesSubstring(organizationId: string, search: string) {
    return prisma.quickReply.findMany({
      where: {
        organizationId,
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { shortcut: { contains: search, mode: 'insensitive' } },
          { category: { contains: search, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ usageCount: 'desc' }, { name: 'asc' }],
    });
  }

  /**
   * Search quick replies by shortcut prefix (for autocomplete)
   * Uses pg_trgm for fuzzy matching
   */
  async searchByShortcut(organizationId: string, prefix: string, limit = 5) {
    try {
      // Try fuzzy search first
      const results = await prisma.$queryRaw<
        Array<{
          id: string;
          organization_id: string;
          name: string;
          shortcut: string;
          content: any;
          category: string | null;
          usage_count: number;
          created_at: Date;
          updated_at: Date;
          similarity_score: number;
        }>
      >`
        SELECT
          qr.*,
          similarity(qr.shortcut, ${prefix}) as similarity_score
        FROM quick_replies qr
        WHERE qr.organization_id = ${organizationId}::uuid
          AND (
            qr.shortcut % ${prefix}
            OR qr.shortcut ILIKE ${prefix} || '%'
          )
        ORDER BY
          CASE WHEN qr.shortcut ILIKE ${prefix} || '%' THEN 0 ELSE 1 END,
          similarity_score DESC,
          qr.usage_count DESC
        LIMIT ${limit}
      `;

      return results.map((r) => ({
        id: r.id,
        organizationId: r.organization_id,
        name: r.name,
        shortcut: r.shortcut,
        content: r.content,
        category: r.category,
        usageCount: r.usage_count,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    } catch (error: any) {
      // Fallback to prefix search
      logger.warn({ error: error.message }, 'Fuzzy shortcut search failed, falling back to prefix');
      return prisma.quickReply.findMany({
        where: {
          organizationId,
          shortcut: { startsWith: prefix.toLowerCase(), mode: 'insensitive' },
        },
        orderBy: [{ usageCount: 'desc' }, { shortcut: 'asc' }],
        take: limit,
      });
    }
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
