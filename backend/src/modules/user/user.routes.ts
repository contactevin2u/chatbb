import { Router } from 'express';
import { prisma } from '../../core/database/prisma.js';
import { jwtMiddleware } from '../auth/auth.middleware.js';
import { requirePermission } from '../auth/guards/rbac.guard.js';
import { NotFoundException } from '../../shared/exceptions/base.exception.js';

export const userRoutes = Router();

// GET /api/v1/users - List users
userRoutes.get('/', jwtMiddleware, requirePermission('users:read'), async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { organizationId: req.organizationId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        avatarUrl: true,
        lastActiveAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/users/me - Get current user
userRoutes.get('/me', jwtMiddleware, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        organizationId: true,
        avatarUrl: true,
        status: true,
        lastActiveAt: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/users/:id - Get user by ID
userRoutes.get('/:id', async (req, res, next) => {
  try {
    res.status(501).json({ error: 'Not implemented' });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/users - Create user
userRoutes.post('/', async (req, res, next) => {
  try {
    res.status(501).json({ error: 'Not implemented' });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/v1/users/:id - Update user
userRoutes.patch('/:id', async (req, res, next) => {
  try {
    res.status(501).json({ error: 'Not implemented' });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/users/:id - Delete user
userRoutes.delete('/:id', async (req, res, next) => {
  try {
    res.status(501).json({ error: 'Not implemented' });
  } catch (error) {
    next(error);
  }
});
