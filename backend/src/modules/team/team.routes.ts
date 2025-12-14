/**
 * Team Routes
 *
 * Express routes for team operations
 */

import { Router } from 'express';
import { z } from 'zod';

import { teamController } from './team.controller';
import { authMiddleware } from '../auth/auth.middleware';
import { requirePermission, requireMinRole } from '../auth/guards/rbac.guard';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// ==================== VALIDATION SCHEMAS ====================

const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

const updateTeamSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

const addMemberSchema = z.object({
  userId: z.string().uuid(),
  isLeader: z.boolean().optional(),
});

const setLeaderSchema = z.object({
  isLeader: z.boolean(),
});

const assignChannelSchema = z.object({
  channelId: z.string().uuid(),
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

// ==================== TEAM ROUTES ====================

/**
 * @route   GET /api/v1/teams
 * @desc    List all teams
 * @access  Private (team:view)
 */
router.get(
  '/',
  requirePermission('team:view'),
  teamController.listTeams.bind(teamController)
);

/**
 * @route   POST /api/v1/teams
 * @desc    Create a new team
 * @access  Private (team:edit) - Admin+
 */
router.post(
  '/',
  requirePermission('team:edit'),
  validate(createTeamSchema),
  teamController.createTeam.bind(teamController)
);

/**
 * @route   GET /api/v1/teams/:id
 * @desc    Get a team by ID
 * @access  Private (team:view)
 */
router.get(
  '/:id',
  requirePermission('team:view'),
  teamController.getTeam.bind(teamController)
);

/**
 * @route   PATCH /api/v1/teams/:id
 * @desc    Update a team
 * @access  Private (team:edit)
 */
router.patch(
  '/:id',
  requirePermission('team:edit'),
  validate(updateTeamSchema),
  teamController.updateTeam.bind(teamController)
);

/**
 * @route   DELETE /api/v1/teams/:id
 * @desc    Delete a team
 * @access  Private (team:edit) - Admin+
 */
router.delete(
  '/:id',
  requirePermission('team:edit'),
  teamController.deleteTeam.bind(teamController)
);

// ==================== TEAM MEMBER ROUTES ====================

/**
 * @route   GET /api/v1/teams/:id/members
 * @desc    List team members
 * @access  Private (team:view)
 */
router.get(
  '/:id/members',
  requirePermission('team:view'),
  teamController.listMembers.bind(teamController)
);

/**
 * @route   POST /api/v1/teams/:id/members
 * @desc    Add member to team
 * @access  Private (team:invite)
 */
router.post(
  '/:id/members',
  requirePermission('team:invite'),
  validate(addMemberSchema),
  teamController.addMember.bind(teamController)
);

/**
 * @route   DELETE /api/v1/teams/:id/members/:userId
 * @desc    Remove member from team
 * @access  Private (team:remove)
 */
router.delete(
  '/:id/members/:userId',
  requirePermission('team:remove'),
  teamController.removeMember.bind(teamController)
);

/**
 * @route   PATCH /api/v1/teams/:id/members/:userId/leader
 * @desc    Set or unset team leader
 * @access  Private (team:edit)
 */
router.patch(
  '/:id/members/:userId/leader',
  requirePermission('team:edit'),
  validate(setLeaderSchema),
  teamController.setLeader.bind(teamController)
);

// ==================== TEAM-CHANNEL ROUTES ====================

/**
 * @route   GET /api/v1/teams/:id/channels
 * @desc    List channels assigned to team
 * @access  Private (team:view)
 */
router.get(
  '/:id/channels',
  requirePermission('team:view'),
  teamController.listChannels.bind(teamController)
);

/**
 * @route   POST /api/v1/teams/:id/channels
 * @desc    Assign channel to team
 * @access  Private (team:edit)
 */
router.post(
  '/:id/channels',
  requirePermission('team:edit'),
  validate(assignChannelSchema),
  teamController.assignChannel.bind(teamController)
);

/**
 * @route   DELETE /api/v1/teams/:id/channels/:channelId
 * @desc    Unassign channel from team
 * @access  Private (team:edit)
 */
router.delete(
  '/:id/channels/:channelId',
  requirePermission('team:edit'),
  teamController.unassignChannel.bind(teamController)
);

export const teamRoutes = router;
