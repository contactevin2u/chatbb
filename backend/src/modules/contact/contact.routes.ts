/**
 * Contact Routes
 *
 * API routes for contact management
 */

import { Router } from 'express';
import { jwtMiddleware } from '../auth/auth.middleware';
import { requirePermission } from '../auth/guards/rbac.guard';
import { contactController } from './contact.controller';

export const contactRoutes = Router();

// All contact routes require authentication
contactRoutes.use(jwtMiddleware);

// GET /api/v1/contacts - List contacts
contactRoutes.get(
  '/',
  requirePermission('contacts:read'),
  contactController.listContacts.bind(contactController)
);

// POST /api/v1/contacts - Create contact
contactRoutes.post(
  '/',
  requirePermission('contacts:create'),
  contactController.createContact.bind(contactController)
);

// GET /api/v1/contacts/:id - Get contact
contactRoutes.get(
  '/:id',
  requirePermission('contacts:read'),
  contactController.getContact.bind(contactController)
);

// PATCH /api/v1/contacts/:id - Update contact
contactRoutes.patch(
  '/:id',
  requirePermission('contacts:update'),
  contactController.updateContact.bind(contactController)
);

// DELETE /api/v1/contacts/:id - Delete contact
contactRoutes.delete(
  '/:id',
  requirePermission('contacts:delete'),
  contactController.deleteContact.bind(contactController)
);

// POST /api/v1/contacts/:id/tags - Add tag to contact
contactRoutes.post(
  '/:id/tags',
  requirePermission('contacts:update'),
  contactController.addTag.bind(contactController)
);

// DELETE /api/v1/contacts/:id/tags/:tagId - Remove tag from contact
contactRoutes.delete(
  '/:id/tags/:tagId',
  requirePermission('contacts:update'),
  contactController.removeTag.bind(contactController)
);
