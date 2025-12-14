/**
 * WhatsApp Routes
 *
 * Express routes for WhatsApp channel management
 */

import { Router } from 'express';
import { z } from 'zod';

import { whatsappController } from './whatsapp.controller';
import { authMiddleware } from '../auth/auth.middleware';
import { requirePermission } from '../auth/guards/rbac.guard';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Validation schemas
const createChannelSchema = z.object({
  name: z.string().min(1).max(100),
});

const pairingCodeSchema = z.object({
  phoneNumber: z.string().regex(/^\+?[1-9]\d{6,14}$/, 'Invalid phone number'),
});

const sendMessageSchema = z.object({
  to: z.string().min(1),
  text: z.string().optional(),
  media: z
    .object({
      type: z.enum(['image', 'video', 'audio', 'document']),
      url: z.string().url().optional(),
      mimetype: z.string().optional(),
      filename: z.string().optional(),
      caption: z.string().optional(),
    })
    .optional(),
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
 * @route   GET /api/v1/channels/whatsapp
 * @desc    List all WhatsApp channels
 * @access  Private (channels:view)
 */
router.get(
  '/',
  requirePermission('channels:view'),
  whatsappController.listChannels.bind(whatsappController)
);

/**
 * @route   POST /api/v1/channels/whatsapp
 * @desc    Create a new WhatsApp channel
 * @access  Private (channels:create)
 */
router.post(
  '/',
  requirePermission('channels:create'),
  validate(createChannelSchema),
  whatsappController.createChannel.bind(whatsappController)
);

/**
 * @route   GET /api/v1/channels/whatsapp/:channelId
 * @desc    Get WhatsApp channel status
 * @access  Private (channels:view)
 */
router.get(
  '/:channelId',
  requirePermission('channels:view'),
  whatsappController.getChannelStatus.bind(whatsappController)
);

/**
 * @route   POST /api/v1/channels/whatsapp/:channelId/connect
 * @desc    Connect WhatsApp channel (start QR flow)
 * @access  Private (channels:edit)
 */
router.post(
  '/:channelId/connect',
  requirePermission('channels:edit'),
  whatsappController.connectChannel.bind(whatsappController)
);

/**
 * @route   POST /api/v1/channels/whatsapp/:channelId/pairing-code
 * @desc    Request pairing code instead of QR
 * @access  Private (channels:edit)
 */
router.post(
  '/:channelId/pairing-code',
  requirePermission('channels:edit'),
  validate(pairingCodeSchema),
  whatsappController.requestPairingCode.bind(whatsappController)
);

/**
 * @route   POST /api/v1/channels/whatsapp/:channelId/disconnect
 * @desc    Disconnect WhatsApp channel
 * @access  Private (channels:edit)
 */
router.post(
  '/:channelId/disconnect',
  requirePermission('channels:edit'),
  whatsappController.disconnectChannel.bind(whatsappController)
);

/**
 * @route   POST /api/v1/channels/whatsapp/:channelId/reconnect
 * @desc    Reconnect WhatsApp channel using saved credentials (no QR needed if session valid)
 * @access  Private (channels:edit)
 */
router.post(
  '/:channelId/reconnect',
  requirePermission('channels:edit'),
  whatsappController.reconnectChannel.bind(whatsappController)
);

/**
 * @route   POST /api/v1/channels/whatsapp/:channelId/messages
 * @desc    Send a message via WhatsApp channel
 * @access  Private (conversations:reply)
 */
router.post(
  '/:channelId/messages',
  requirePermission('conversations:reply'),
  validate(sendMessageSchema),
  whatsappController.sendMessage.bind(whatsappController)
);

/**
 * @route   DELETE /api/v1/channels/whatsapp/:channelId/session
 * @desc    Clear session/auth state (use when session is corrupted)
 * @access  Private (channels:edit)
 */
router.delete(
  '/:channelId/session',
  requirePermission('channels:edit'),
  whatsappController.clearSession.bind(whatsappController)
);

/**
 * @route   DELETE /api/v1/channels/whatsapp/:channelId
 * @desc    Delete a WhatsApp channel
 * @access  Private (channels:delete)
 */
router.delete(
  '/:channelId',
  requirePermission('channels:delete'),
  whatsappController.deleteChannel.bind(whatsappController)
);

export const whatsappRoutes = router;
