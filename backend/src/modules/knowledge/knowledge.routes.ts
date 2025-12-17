/**
 * Knowledge Bank Routes
 *
 * API endpoints for knowledge management
 */

import { Router } from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import { requirePermission } from '../auth/guards/rbac.guard';
import {
  listKnowledge,
  getKnowledge,
  createKnowledge,
  updateKnowledge,
  deleteKnowledge,
  getCategories,
  getStats,
  searchKnowledge,
} from './knowledge.controller';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * @route   GET /api/v1/knowledge
 * @desc    List all knowledge items
 * @access  Private
 * @query   type - Filter by type (FAQ, PRODUCT, POLICY, GENERAL)
 * @query   category - Filter by category
 * @query   search - Search in title/content
 * @query   activeOnly - Only return active items
 */
router.get('/', listKnowledge);

/**
 * @route   GET /api/v1/knowledge/categories
 * @desc    Get all categories
 * @access  Private
 */
router.get('/categories', getCategories);

/**
 * @route   GET /api/v1/knowledge/stats
 * @desc    Get knowledge statistics
 * @access  Private
 */
router.get('/stats', getStats);

/**
 * @route   POST /api/v1/knowledge/search
 * @desc    Search knowledge by keywords (for AI testing)
 * @access  Private
 * @body    query - Search query
 * @body    limit - Max results (default 10)
 */
router.post('/search', searchKnowledge);

/**
 * @route   GET /api/v1/knowledge/:id
 * @desc    Get a single knowledge item
 * @access  Private
 */
router.get('/:id', getKnowledge);

/**
 * @route   POST /api/v1/knowledge
 * @desc    Create a new knowledge item
 * @access  Private (Admin only)
 * @body    type - FAQ, PRODUCT, POLICY, or GENERAL
 * @body    title - Title of the knowledge item
 * @body    content - Content/answer
 * @body    keywords - Array of keywords for search
 * @body    category - Optional category
 * @body    priority - Optional priority (higher = more important)
 */
router.post('/', requirePermission('organization:update'), createKnowledge);

/**
 * @route   PATCH /api/v1/knowledge/:id
 * @desc    Update a knowledge item
 * @access  Private (Admin only)
 */
router.patch('/:id', requirePermission('organization:update'), updateKnowledge);

/**
 * @route   DELETE /api/v1/knowledge/:id
 * @desc    Delete a knowledge item
 * @access  Private (Admin only)
 */
router.delete('/:id', requirePermission('organization:update'), deleteKnowledge);

export default router;
