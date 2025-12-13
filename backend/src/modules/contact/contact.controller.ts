/**
 * Contact Controller
 *
 * HTTP handlers for contact management
 */

import { Request, Response, NextFunction } from 'express';
import { ChannelType } from '@prisma/client';
import { contactService } from './contact.service';

export class ContactController {
  /**
   * List contacts with filters
   */
  async listContacts(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.user!.organizationId;
      const {
        search,
        channelType,
        tagIds,
        limit,
        offset,
        sortBy,
        sortOrder,
      } = req.query;

      const result = await contactService.listContacts({
        organizationId,
        search: search as string | undefined,
        channelType: channelType as ChannelType | undefined,
        tagIds: tagIds ? (tagIds as string).split(',') : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
        sortBy: sortBy as any,
        sortOrder: sortOrder as 'asc' | 'desc' | undefined,
      });

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a single contact
   */
  async getContact(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const organizationId = req.user!.organizationId;

      const contact = await contactService.getContact(id, organizationId);
      res.json({ success: true, data: contact });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create a new contact
   */
  async createContact(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.user!.organizationId;
      const { identifier, channelType, displayName, firstName, lastName, email, avatarUrl, metadata } = req.body;

      if (!identifier || !channelType) {
        return res.status(400).json({ success: false, error: 'identifier and channelType are required' });
      }

      const contact = await contactService.createContact({
        organizationId,
        identifier,
        channelType,
        displayName,
        firstName,
        lastName,
        email,
        avatarUrl,
        metadata,
      });

      res.status(201).json({ success: true, data: contact });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update a contact
   */
  async updateContact(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const organizationId = req.user!.organizationId;
      const { displayName, firstName, lastName, email, avatarUrl, metadata } = req.body;

      const contact = await contactService.updateContact(id, organizationId, {
        displayName,
        firstName,
        lastName,
        email,
        avatarUrl,
        metadata,
      });

      res.json({ success: true, data: contact });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a contact
   */
  async deleteContact(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const organizationId = req.user!.organizationId;

      await contactService.deleteContact(id, organizationId);
      res.json({ success: true, message: 'Contact deleted' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Add tag to contact
   */
  async addTag(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { tagId } = req.body;
      const organizationId = req.user!.organizationId;

      if (!tagId) {
        return res.status(400).json({ success: false, error: 'tagId is required' });
      }

      const contact = await contactService.addTag(id, organizationId, tagId);
      res.json({ success: true, data: contact });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Remove tag from contact
   */
  async removeTag(req: Request, res: Response, next: NextFunction) {
    try {
      const { id, tagId } = req.params;
      const organizationId = req.user!.organizationId;

      const contact = await contactService.removeTag(id, organizationId, tagId);
      res.json({ success: true, data: contact });
    } catch (error) {
      next(error);
    }
  }
}

export const contactController = new ContactController();
