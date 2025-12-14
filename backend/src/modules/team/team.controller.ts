/**
 * Team Controller
 *
 * HTTP request handlers for team operations
 */

import { Request, Response, NextFunction } from 'express';
import { teamService } from './team.service';

export class TeamController {
  // ==================== TEAM CRUD ====================

  /**
   * List teams
   * GET /api/v1/teams
   */
  async listTeams(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;

      const teams = await teamService.listTeams(organizationId);

      res.json({
        success: true,
        data: teams,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create team
   * POST /api/v1/teams
   */
  async createTeam(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { name, description } = req.body;

      const team = await teamService.createTeam({
        organizationId,
        name,
        description,
      });

      res.status(201).json({
        success: true,
        data: team,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get team
   * GET /api/v1/teams/:id
   */
  async getTeam(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;

      const team = await teamService.getTeam(id, organizationId);

      if (!team) {
        return res.status(404).json({
          success: false,
          error: 'Team not found',
        });
      }

      res.json({
        success: true,
        data: team,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update team
   * PATCH /api/v1/teams/:id
   */
  async updateTeam(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;
      const { name, description } = req.body;

      const team = await teamService.updateTeam(id, organizationId, {
        name,
        description,
      });

      res.json({
        success: true,
        data: team,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete team
   * DELETE /api/v1/teams/:id
   */
  async deleteTeam(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;

      await teamService.deleteTeam(id, organizationId);

      res.json({
        success: true,
        message: 'Team deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== TEAM MEMBERS ====================

  /**
   * List team members
   * GET /api/v1/teams/:id/members
   */
  async listMembers(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;

      const members = await teamService.listMembers(id, organizationId);

      res.json({
        success: true,
        data: members,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Add member to team
   * POST /api/v1/teams/:id/members
   */
  async addMember(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;
      const { userId, isLeader } = req.body;

      const member = await teamService.addMember(
        { teamId: id, userId, isLeader },
        organizationId
      );

      res.status(201).json({
        success: true,
        data: member,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Remove member from team
   * DELETE /api/v1/teams/:id/members/:userId
   */
  async removeMember(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id, userId } = req.params;

      await teamService.removeMember(id, userId, organizationId);

      res.json({
        success: true,
        message: 'Member removed successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Set team leader
   * PATCH /api/v1/teams/:id/members/:userId/leader
   */
  async setLeader(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id, userId } = req.params;
      const { isLeader } = req.body;

      const member = await teamService.setLeader(id, userId, isLeader, organizationId);

      res.json({
        success: true,
        data: member,
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== TEAM-CHANNEL ASSIGNMENT ====================

  /**
   * List team channels
   * GET /api/v1/teams/:id/channels
   */
  async listChannels(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;

      const channels = await teamService.listTeamChannels(id, organizationId);

      res.json({
        success: true,
        data: channels,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Assign channel to team
   * POST /api/v1/teams/:id/channels
   */
  async assignChannel(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;
      const { channelId } = req.body;

      const teamChannel = await teamService.assignChannel(id, channelId, organizationId);

      res.status(201).json({
        success: true,
        data: teamChannel,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Unassign channel from team
   * DELETE /api/v1/teams/:id/channels/:channelId
   */
  async unassignChannel(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const { id, channelId } = req.params;

      await teamService.unassignChannel(id, channelId, organizationId);

      res.json({
        success: true,
        message: 'Channel unassigned successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

// Export singleton instance
export const teamController = new TeamController();
