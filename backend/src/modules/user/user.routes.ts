/**
 * User Routes
 *
 * Express routes for user and agent management
 */

import { Router } from 'express';
import { z } from 'zod';
import { AgentAvailability } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { jwtMiddleware } from '../auth/auth.middleware';
import { requirePermission } from '../auth/guards/rbac.guard';
import { NotFoundException } from '../../shared/exceptions/base.exception';
import { userService } from './user.service';

export const userRoutes = Router();

// ==================== VALIDATION SCHEMAS ====================

const setAvailabilitySchema = z.object({
  status: z.enum(['ONLINE', 'AWAY', 'BUSY', 'OFFLINE']),
});

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['ADMIN', 'SUPERVISOR', 'AGENT']).optional(),
});

const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  role: z.enum(['ADMIN', 'SUPERVISOR', 'AGENT']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
});

// ==================== VALIDATION MIDDLEWARE ====================

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

// ==================== ROUTES ====================

/**
 * @route   GET /api/v1/users
 * @desc    List users in organization
 * @access  Private (users:read)
 */
userRoutes.get('/', jwtMiddleware, requirePermission('users:read'), async (req, res, next) => {
  try {
    const users = await userService.listUsers(req.organizationId!);
    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/users/me
 * @desc    Get current user
 * @access  Private
 */
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
        availabilityStatus: true,
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

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/users/stats
 * @desc    Get agent stats (workload per agent)
 * @access  Private (users:read)
 */
userRoutes.get('/stats', jwtMiddleware, requirePermission('users:read'), async (req, res, next) => {
  try {
    const stats = await userService.getAgentStats(req.organizationId!);
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/users/available
 * @desc    Get available agents (optionally filtered by channel)
 * @access  Private (users:read)
 */
userRoutes.get('/available', jwtMiddleware, requirePermission('users:read'), async (req, res, next) => {
  try {
    const { channelId, statuses } = req.query;

    const validStatuses: AgentAvailability[] = ['ONLINE', 'AWAY', 'BUSY', 'OFFLINE'];
    const statusArray: AgentAvailability[] = statuses
      ? (statuses as string).split(',').filter((s): s is AgentAvailability =>
          validStatuses.includes(s as AgentAvailability)
        )
      : ['ONLINE'];

    const agents = await userService.getAvailableAgents(
      req.organizationId!,
      channelId as string | undefined,
      statusArray
    );

    res.json({
      success: true,
      data: agents,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/v1/users/me/availability
 * @desc    Set current user's availability status
 * @access  Private
 */
userRoutes.put(
  '/me/availability',
  jwtMiddleware,
  validate(setAvailabilitySchema),
  async (req, res, next) => {
    try {
      const { status } = req.body;

      const result = await userService.setAvailability(
        req.user!.sub,
        req.organizationId!,
        status as AgentAvailability
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/users/me/heartbeat
 * @desc    Update last active timestamp
 * @access  Private
 */
userRoutes.post('/me/heartbeat', jwtMiddleware, async (req, res, next) => {
  try {
    const user = await userService.heartbeat(req.user!.sub);
    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/users/:id
 * @desc    Get user by ID
 * @access  Private (users:read)
 */
userRoutes.get('/:id', jwtMiddleware, requirePermission('users:read'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findFirst({
      where: {
        id,
        organizationId: req.organizationId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        avatarUrl: true,
        availabilityStatus: true,
        lastActiveAt: true,
        createdAt: true,
        teamMembers: {
          select: {
            team: {
              select: {
                id: true,
                name: true,
              },
            },
            isLeader: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    res.json({
      success: true,
      data: {
        ...user,
        teams: user.teamMembers.map((tm) => ({
          ...tm.team,
          isLeader: tm.isLeader,
        })),
        teamMembers: undefined,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/users
 * @desc    Create user
 * @access  Private (users:create)
 */
userRoutes.post(
  '/',
  jwtMiddleware,
  requirePermission('users:create'),
  validate(createUserSchema),
  async (req, res, next) => {
    try {
      const user = await userService.createUser({
        organizationId: req.organizationId!,
        ...req.body,
      });

      res.status(201).json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PATCH /api/v1/users/:id
 * @desc    Update user
 * @access  Private (users:update)
 */
userRoutes.patch(
  '/:id',
  jwtMiddleware,
  requirePermission('users:update'),
  validate(updateUserSchema),
  async (req, res, next) => {
    try {
      const user = await userService.updateUser(
        req.params.id,
        req.organizationId!,
        req.body
      );

      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/v1/users/:id
 * @desc    Delete user
 * @access  Private (users:delete)
 */
userRoutes.delete('/:id', jwtMiddleware, requirePermission('users:delete'), async (req, res, next) => {
  try {
    await userService.deleteUser(req.params.id, req.organizationId!);

    res.json({
      success: true,
      message: 'User deleted',
    });
  } catch (error) {
    next(error);
  }
});
