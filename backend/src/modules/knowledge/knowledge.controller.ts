/**
 * Knowledge Bank Controller
 *
 * HTTP request handlers for knowledge management
 */

import { Request, Response } from 'express';
import { knowledgeService } from './knowledge.service';
import { KnowledgeType } from '@prisma/client';

/**
 * List all knowledge items
 * GET /api/v1/knowledge
 */
export async function listKnowledge(req: Request, res: Response) {
  try {
    const organizationId = req.user!.organizationId;
    const { type, category, search, activeOnly } = req.query;

    const items = await knowledgeService.listKnowledge(organizationId, {
      type: type as KnowledgeType | undefined,
      category: category as string | undefined,
      search: search as string | undefined,
      activeOnly: activeOnly === 'true',
    });

    res.json({
      success: true,
      data: items,
    });
  } catch (error: any) {
    console.error('Error listing knowledge:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to list knowledge items',
    });
  }
}

/**
 * Get a single knowledge item
 * GET /api/v1/knowledge/:id
 */
export async function getKnowledge(req: Request, res: Response) {
  try {
    const organizationId = req.user!.organizationId;
    const { id } = req.params;

    const item = await knowledgeService.getKnowledge(id, organizationId);

    res.json({
      success: true,
      data: item,
    });
  } catch (error: any) {
    console.error('Error getting knowledge:', error);
    const status = error.message === 'Knowledge item not found' ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message || 'Failed to get knowledge item',
    });
  }
}

/**
 * Create a new knowledge item
 * POST /api/v1/knowledge
 */
export async function createKnowledge(req: Request, res: Response) {
  try {
    const organizationId = req.user!.organizationId;
    const { type, title, content, keywords, category, priority } = req.body;

    if (!type || !title || !content) {
      return res.status(400).json({
        success: false,
        error: 'Type, title, and content are required',
      });
    }

    // Validate type
    if (!['FAQ', 'PRODUCT', 'POLICY', 'GENERAL'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid type. Must be FAQ, PRODUCT, POLICY, or GENERAL',
      });
    }

    const item = await knowledgeService.createKnowledge({
      organizationId,
      type,
      title,
      content,
      keywords,
      category,
      priority,
    });

    res.status(201).json({
      success: true,
      data: item,
    });
  } catch (error: any) {
    console.error('Error creating knowledge:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create knowledge item',
    });
  }
}

/**
 * Update a knowledge item
 * PATCH /api/v1/knowledge/:id
 */
export async function updateKnowledge(req: Request, res: Response) {
  try {
    const organizationId = req.user!.organizationId;
    const { id } = req.params;
    const { type, title, content, keywords, category, priority, isActive } = req.body;

    // Validate type if provided
    if (type && !['FAQ', 'PRODUCT', 'POLICY', 'GENERAL'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid type. Must be FAQ, PRODUCT, POLICY, or GENERAL',
      });
    }

    const item = await knowledgeService.updateKnowledge(id, organizationId, {
      type,
      title,
      content,
      keywords,
      category,
      priority,
      isActive,
    });

    res.json({
      success: true,
      data: item,
    });
  } catch (error: any) {
    console.error('Error updating knowledge:', error);
    const status = error.message === 'Knowledge item not found' ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message || 'Failed to update knowledge item',
    });
  }
}

/**
 * Delete a knowledge item
 * DELETE /api/v1/knowledge/:id
 */
export async function deleteKnowledge(req: Request, res: Response) {
  try {
    const organizationId = req.user!.organizationId;
    const { id } = req.params;

    await knowledgeService.deleteKnowledge(id, organizationId);

    res.json({
      success: true,
      message: 'Knowledge item deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting knowledge:', error);
    const status = error.message === 'Knowledge item not found' ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message || 'Failed to delete knowledge item',
    });
  }
}

/**
 * Get categories
 * GET /api/v1/knowledge/categories
 */
export async function getCategories(req: Request, res: Response) {
  try {
    const organizationId = req.user!.organizationId;

    const categories = await knowledgeService.getCategories(organizationId);

    res.json({
      success: true,
      data: categories,
    });
  } catch (error: any) {
    console.error('Error getting categories:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get categories',
    });
  }
}

/**
 * Get statistics
 * GET /api/v1/knowledge/stats
 */
export async function getStats(req: Request, res: Response) {
  try {
    const organizationId = req.user!.organizationId;

    const stats = await knowledgeService.getStats(organizationId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get statistics',
    });
  }
}

/**
 * Search knowledge using semantic/vector search (for AI testing)
 * POST /api/v1/knowledge/search
 */
export async function searchKnowledge(req: Request, res: Response) {
  try {
    const organizationId = req.user!.organizationId;
    const { query, limit, useKeywords } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required',
      });
    }

    // Use semantic search by default, fallback to keywords if requested
    const items = useKeywords
      ? await knowledgeService.searchByKeywords(organizationId, query, limit || 10)
      : await knowledgeService.searchSemantic(organizationId, query, limit || 10);

    res.json({
      success: true,
      data: items,
      searchType: useKeywords ? 'keywords' : 'semantic',
    });
  } catch (error: any) {
    console.error('Error searching knowledge:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to search knowledge',
    });
  }
}

/**
 * Regenerate embeddings for all knowledge items
 * POST /api/v1/knowledge/regenerate-embeddings
 */
export async function regenerateEmbeddings(req: Request, res: Response) {
  try {
    const organizationId = req.user!.organizationId;

    const result = await knowledgeService.regenerateAllEmbeddings(organizationId);

    res.json({
      success: true,
      data: result,
      message: `Regenerated embeddings: ${result.processed} successful, ${result.errors} errors`,
    });
  } catch (error: any) {
    console.error('Error regenerating embeddings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to regenerate embeddings',
    });
  }
}
