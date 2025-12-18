/**
 * Knowledge Bank Service
 *
 * Business logic for managing knowledge items (FAQs, products, policies)
 * Now with pgvector semantic search for AI-powered retrieval
 */

import { prisma } from '../../core/database/prisma';
import { KnowledgeType } from '@prisma/client';
import OpenAI from 'openai';
import { logger } from '../../shared/utils/logger';

// Embedding model - OpenAI text-embedding-3-small (1536 dimensions)
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

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
   * Generate embedding for text using OpenAI
   * Returns null if no API key or on error (graceful degradation)
   */
  private async generateEmbedding(
    organizationId: string,
    text: string
  ): Promise<number[] | null> {
    try {
      // Get OpenAI API key from AI config
      const aiConfig = await prisma.aIConfig.findUnique({
        where: { organizationId },
        select: { openaiApiKey: true },
      });

      if (!aiConfig?.openaiApiKey) {
        logger.debug({ organizationId }, 'No OpenAI API key configured, skipping embedding generation');
        return null;
      }

      const openai = new OpenAI({ apiKey: aiConfig.openaiApiKey });

      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8000), // Max ~8k tokens for embedding
      });

      return response.data[0].embedding;
    } catch (error: any) {
      logger.error({ error: error.message, organizationId }, 'Failed to generate embedding');
      return null;
    }
  }

  /**
   * Build text for embedding from knowledge item
   * Combines title and content for better semantic matching
   */
  private buildEmbeddingText(title: string, content: string, type: KnowledgeType): string {
    // Include type for context
    const typePrefix = type === 'FAQ' ? 'FAQ: ' : type === 'PRODUCT' ? 'Product: ' : '';
    return `${typePrefix}${title}\n${content}`;
  }

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
   * Search knowledge by keywords (fallback for non-vector search)
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
   * Semantic search using vector similarity (pgvector)
   * Falls back to keyword search if embeddings not available
   */
  async searchSemantic(organizationId: string, query: string, limit = 10) {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(organizationId, query);

      if (!queryEmbedding) {
        // Fallback to keyword search if no embedding possible
        logger.debug({ organizationId }, 'No embedding generated, falling back to keyword search');
        return this.searchByKeywords(organizationId, query, limit);
      }

      // Convert embedding to PostgreSQL vector format
      const embeddingStr = `[${queryEmbedding.join(',')}]`;

      // Use raw SQL for vector similarity search with cosine distance
      // Lower distance = more similar (cosine distance, not cosine similarity)
      const results = await prisma.$queryRaw<
        Array<{
          id: string;
          organization_id: string;
          type: string;
          title: string;
          content: string;
          keywords: string[];
          category: string | null;
          is_active: boolean;
          priority: number;
          created_at: Date;
          updated_at: Date;
          similarity: number;
        }>
      >`
        SELECT
          id,
          organization_id,
          type,
          title,
          content,
          keywords,
          category,
          is_active,
          priority,
          created_at,
          updated_at,
          1 - (embedding <=> ${embeddingStr}::vector) as similarity
        FROM knowledge_items
        WHERE organization_id = ${organizationId}::uuid
          AND is_active = true
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${embeddingStr}::vector
        LIMIT ${limit}
      `;

      // Map to Prisma-like format
      const items = results.map((r) => ({
        id: r.id,
        organizationId: r.organization_id,
        type: r.type as KnowledgeType,
        title: r.title,
        content: r.content,
        keywords: r.keywords,
        category: r.category,
        isActive: r.is_active,
        priority: r.priority,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        similarity: r.similarity, // 0-1 where 1 is identical
      }));

      // If no results with embeddings, fallback to keyword search
      if (items.length === 0) {
        logger.debug({ organizationId }, 'No items with embeddings found, falling back to keyword search');
        return this.searchByKeywords(organizationId, query, limit);
      }

      logger.debug({ organizationId, resultCount: items.length, topSimilarity: items[0]?.similarity }, 'Semantic search completed');
      return items;
    } catch (error: any) {
      // If vector search fails (e.g., pgvector not installed), fall back to keyword search
      logger.warn({ error: error.message, organizationId }, 'Semantic search failed, falling back to keyword search');
      return this.searchByKeywords(organizationId, query, limit);
    }
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
   * Create a new knowledge item (with embedding generation)
   */
  async createKnowledge(input: CreateKnowledgeInput) {
    const { organizationId, type, title, content, keywords, category, priority } = input;

    // Process keywords - lowercase and dedupe
    const processedKeywords = keywords
      ? [...new Set(keywords.map((k) => k.toLowerCase().trim()).filter(Boolean))]
      : [];

    // Create the item first
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

    // Generate and store embedding asynchronously (don't block creation)
    this.generateAndStoreEmbedding(item.id, organizationId, title, content, type).catch((err) => {
      logger.error({ error: err.message, itemId: item.id }, 'Failed to generate embedding for new knowledge item');
    });

    return item;
  }

  /**
   * Update a knowledge item (regenerates embedding if content changes)
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

    // Regenerate embedding if title or content changed
    const titleChanged = input.title && input.title !== item.title;
    const contentChanged = input.content && input.content !== item.content;

    if (titleChanged || contentChanged) {
      const newTitle = input.title || item.title;
      const newContent = input.content || item.content;
      const newType = input.type || item.type;

      this.generateAndStoreEmbedding(id, organizationId, newTitle, newContent, newType).catch((err) => {
        logger.error({ error: err.message, itemId: id }, 'Failed to regenerate embedding for updated knowledge item');
      });
    }

    return updated;
  }

  /**
   * Generate and store embedding for a knowledge item
   */
  private async generateAndStoreEmbedding(
    itemId: string,
    organizationId: string,
    title: string,
    content: string,
    type: KnowledgeType
  ): Promise<void> {
    const text = this.buildEmbeddingText(title, content, type);
    const embedding = await this.generateEmbedding(organizationId, text);

    if (embedding) {
      // Store embedding using raw SQL (Prisma doesn't support vector type natively)
      const embeddingStr = `[${embedding.join(',')}]`;
      await prisma.$executeRaw`
        UPDATE knowledge_items
        SET embedding = ${embeddingStr}::vector
        WHERE id = ${itemId}::uuid
      `;
      logger.debug({ itemId }, 'Embedding stored successfully');
    }
  }

  /**
   * Regenerate embeddings for all knowledge items in an organization
   * Useful for bulk migration or after schema changes
   */
  async regenerateAllEmbeddings(organizationId: string): Promise<{ processed: number; errors: number }> {
    const items = await prisma.knowledgeItem.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, title: true, content: true, type: true },
    });

    let processed = 0;
    let errors = 0;

    for (const item of items) {
      try {
        await this.generateAndStoreEmbedding(item.id, organizationId, item.title, item.content, item.type);
        processed++;
        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error: any) {
        logger.error({ error: error.message, itemId: item.id }, 'Failed to regenerate embedding');
        errors++;
      }
    }

    logger.info({ organizationId, processed, errors, total: items.length }, 'Bulk embedding regeneration complete');
    return { processed, errors };
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
