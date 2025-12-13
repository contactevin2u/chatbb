/**
 * Media Routes
 *
 * Handles file uploads for media messages
 */

import { Router } from 'express';
import multer from 'multer';
import { mediaController } from './media.controller';
import { authMiddleware } from '../auth/auth.middleware';
import { requirePermission } from '../auth/guards/rbac.guard';

const router = Router();

// Configure multer for memory storage (we'll upload to Cloudinary)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 64 * 1024 * 1024, // 64MB max (WhatsApp limit for videos)
  },
  fileFilter: (req, file, cb) => {
    // Allow images, videos, audio, and documents
    const allowedMimes = [
      // Images
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      // Videos
      'video/mp4',
      'video/3gpp',
      'video/quicktime',
      'video/webm',
      // Audio
      'audio/mpeg',
      'audio/ogg',
      'audio/wav',
      'audio/mp4',
      'audio/aac',
      // Documents
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'application/zip',
      'application/x-rar-compressed',
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  },
});

// All routes require authentication
router.use(authMiddleware);

/**
 * @route   POST /api/v1/media/upload
 * @desc    Upload a media file to Cloudinary
 * @access  Private (conversations:reply)
 */
router.post(
  '/upload',
  requirePermission('conversations:reply'),
  upload.single('file'),
  mediaController.uploadFile.bind(mediaController)
);

export const mediaRoutes = router;
