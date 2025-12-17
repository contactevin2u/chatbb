/**
 * Knowledge Bank Service
 *
 * Business logic for managing knowledge items (FAQs, products, policies)
 */

import { prisma } from '../../core/database/prisma';
import { KnowledgeType } from '@prisma/client';

export interface CreateKnowledgeInput {
  organizationId: string;
  type: KnowledgeType;
  title: string;
  content: string;
  keywords?: string[];
  category?: string;
  priority?: number;
}

export interface UpdateKnowledgeInput {
  type?: KnowledgeType;
  title?: string;
  content?: string;
  keywords?: string[];
  category?: string;
  priority?: number;
  isActive?: boolean;
}

export class KnowledgeService {
  /**
   * List all knowledge items for an organization
   */
  async listKnowledge(
    organizationId: string,
    options?: {
      type?: KnowledgeType;
      category?: string;
      search?: string;
      activeOnly?: boolean;
    }
  ) {
    const where: any = { organizationId };

    if (options?.type) {
      where.type = options.type;
    }

    if (options?.category) {
      where.category = options.category;
    }

    if (options?.activeOnly) {
      where.isActive = true;
    }

    if (options?.search) {
      where.OR = [
        { title: { contains: options.search, mode: 'insensitive' } },
        { content: { contains: options.search, mode: 'insensitive' } },
        { category: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const items = await prisma.knowledgeItem.findMany({
      where,
      orderBy: [{ type: 'asc' }, { priority: 'desc' }, { title: 'asc' }],
    });

    return items;
  }

  /**
   * Search knowledge by keywords (for AI context retrieval)
   */
  async searchByKeywords(organizationId: string, query: string, limit = 10) {
    // Extract words from query (min 2 characters)
    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 2);

    if (words.length === 0) {
      return [];
    }

    // Search by keywords array, title, or content
    const items = await prisma.knowledgeItem.findMany({
      where: {
        organizationId,
        isActive: true,
        OR: [
          { keywords: { hasSome: words } },
          { title: { contains: query, mode: 'insensitive' } },
          { content: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { priority: 'desc' },
      take: limit,
    });

    return items;
  }

  /**
   * Get all active knowledge for AI context (limited)
   */
  async getActiveKnowledge(organizationId: string, type?: KnowledgeType, limit = 20) {
    return prisma.knowledgeItem.findMany({
      where: {
        organizationId,
        isActive: true,
        ...(type && { type }),
      },
      orderBy: { priority: 'desc' },
      take: limit,
    });
  }

  /**
   * Get a single knowledge item by ID
   */
  async getKnowledge(id: string, organizationId: string) {
    const item = await prisma.knowledgeItem.findFirst({
      where: { id, organizationId },
    });

    if (!item) {
      throw new Error('Knowledge item not found');
    }

    return item;
  }

  /**
   * Create a new knowledge item
   */
  async createKnowledge(input: CreateKnowledgeInput) {
    const { organizationId, type, title, content, keywords, category, priority } = input;

    // Process keywords - lowercase and dedupe
    const processedKeywords = keywords
      ? [...new Set(keywords.map((k) => k.toLowerCase().trim()).filter(Boolean))]
      : [];

    const item = await prisma.knowledgeItem.create({
      data: {
        organizationId,
        type,
        title,
        content,
        keywords: processedKeywords,
        category,
        priority: priority || 0,
      },
    });

    return item;
  }

  /**
   * Update a knowledge item
   */
  async updateKnowledge(id: string, organizationId: string, input: UpdateKnowledgeInput) {
    const item = await prisma.knowledgeItem.findFirst({
      where: { id, organizationId },
    });

    if (!item) {
      throw new Error('Knowledge item not found');
    }

    // Process keywords if provided
    const processedKeywords = input.keywords
      ? [...new Set(input.keywords.map((k) => k.toLowerCase().trim()).filter(Boolean))]
      : undefined;

    const updated = await prisma.knowledgeItem.update({
      where: { id },
      data: {
        type: input.type,
        title: input.title,
        content: input.content,
        keywords: processedKeywords,
        category: input.category,
        priority: input.priority,
        isActive: input.isActive,
      },
    });

    return updated;
  }

  /**
   * Delete a knowledge item
   */
  async deleteKnowledge(id: string, organizationId: string) {
    const item = await prisma.knowledgeItem.findFirst({
      where: { id, organizationId },
    });

    if (!item) {
      throw new Error('Knowledge item not found');
    }

    await prisma.knowledgeItem.delete({
      where: { id },
    });
  }

  /**
   * Get categories for organization
   */
  async getCategories(organizationId: string) {
    const result = await prisma.knowledgeItem.findMany({
      where: { organizationId, category: { not: null } },
      distinct: ['category'],
      select: { category: true },
    });

    return result.map((r) => r.category).filter(Boolean) as string[];
  }

  /**
   * Get statistics for knowledge items
   */
  async getStats(organizationId: string) {
    const [total, byType, active] = await Promise.all([
      prisma.knowledgeItem.count({ where: { organizationId } }),
      prisma.knowledgeItem.groupBy({
        by: ['type'],
        where: { organizationId },
        _count: true,
      }),
      prisma.knowledgeItem.count({ where: { organizationId, isActive: true } }),
    ]);

    return {
      total,
      active,
      byType: byType.reduce(
        (acc, item) => {
          acc[item.type] = item._count;
          return acc;
        },
        {} as Record<string, number>
      ),
    };
  }
}

export const knowledgeService = new KnowledgeService();
