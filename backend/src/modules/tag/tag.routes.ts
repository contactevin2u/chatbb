/**
 * Tag Routes
 *
 * Express routes for tag management
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../core/database/prisma';
import { jwtMiddleware } from '../auth/auth.middleware';
import { requirePermission } from '../auth/guards/rbac.guard';

export const tagRoutes = Router();

// Validation schemas
const createTagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

const updateTagSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

// Validation middleware
const validate = (schema: z.ZodSchema) => {
  return (req: any, res: any, next: any) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors,
        });
      }
      next(error);
    }
  };
};

/**
 * @route   GET /api/v1/tags
 * @desc    List all tags for organization
 * @access  Private
 */
tagRoutes.get('/', jwtMiddleware, async (req, res, next) => {
  try {
    const tags = await prisma.tag.findMany({
      where: { organizationId: req.organizationId! },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        color: true,
        createdAt: true,
        _count: {
          select: {
            contacts: true,
            conversations: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: tags.map((tag) => ({
        ...tag,
        contactCount: tag._count.contacts,
        conversationCount: tag._count.conversations,
        _count: undefined,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/tags
 * @desc    Create a new tag
 * @access  Private (team:edit)
 */
tagRoutes.post(
  '/',
  jwtMiddleware,
  requirePermission('team:edit'),
  validate(createTagSchema),
  async (req, res, next) => {
    try {
      const { name, color } = req.body;

      // Check if tag with same name exists
      const existing = await prisma.tag.findFirst({
        where: {
          organizationId: req.organizationId!,
          name: { equals: name, mode: 'insensitive' },
        },
      });

      if (existing) {
        return res.status(409).json({
          success: false,
          error: 'Tag with this name already exists',
        });
      }

      const tag = await prisma.tag.create({
        data: {
          organizationId: req.organizationId!,
          name,
          color: color || '#6366f1',
        },
      });

      res.status(201).json({
        success: true,
        data: tag,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PATCH /api/v1/tags/:id
 * @desc    Update a tag
 * @access  Private (team:edit)
 */
tagRoutes.patch(
  '/:id',
  jwtMiddleware,
  requirePermission('team:edit'),
  validate(updateTagSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { name, color } = req.body;

      const tag = await prisma.tag.findFirst({
        where: { id, organizationId: req.organizationId! },
      });

      if (!tag) {
        return res.status(404).json({
          success: false,
          error: 'Tag not found',
        });
      }

      // Check for name conflict if name is being updated
      if (name && name !== tag.name) {
        const existing = await prisma.tag.findFirst({
          where: {
            organizationId: req.organizationId!,
            name: { equals: name, mode: 'insensitive' },
            id: { not: id },
          },
        });

        if (existing) {
          return res.status(409).json({
            success: false,
            error: 'Tag with this name already exists',
          });
        }
      }

      const updated = await prisma.tag.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(color && { color }),
        },
      });

      res.json({
        success: true,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/v1/tags/:id
 * @desc    Delete a tag
 * @access  Private (team:edit)
 */
tagRoutes.delete(
  '/:id',
  jwtMiddleware,
  requirePermission('team:edit'),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const tag = await prisma.tag.findFirst({
        where: { id, organizationId: req.organizationId! },
      });

      if (!tag) {
        return res.status(404).json({
          success: false,
          error: 'Tag not found',
        });
      }

      await prisma.tag.delete({ where: { id } });

      res.json({
        success: true,
        message: 'Tag deleted',
      });
    } catch (error) {
      next(error);
    }
  }
);
