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
  requirePermission('contacts:view'),
  contactController.listContacts.bind(contactController)
);

// POST /api/v1/contacts - Create contact
contactRoutes.post(
  '/',
  requirePermission('contacts:edit'),
  contactController.createContact.bind(contactController)
);

// GET /api/v1/contacts/:id - Get contact
contactRoutes.get(
  '/:id',
  requirePermission('contacts:view'),
  contactController.getContact.bind(contactController)
);

// PATCH /api/v1/contacts/:id - Update contact
contactRoutes.patch(
  '/:id',
  requirePermission('contacts:edit'),
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
  requirePermission('contacts:edit'),
  contactController.addTag.bind(contactController)
);

// DELETE /api/v1/contacts/:id/tags/:tagId - Remove tag from contact
contactRoutes.delete(
  '/:id/tags/:tagId',
  requirePermission('contacts:edit'),
  contactController.removeTag.bind(contactController)
);
