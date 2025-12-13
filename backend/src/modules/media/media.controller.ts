/**
 * Media Controller
 *
 * Handles media file uploads
 */

import { Request, Response, NextFunction } from 'express';
import { uploadToCloudinary } from '../../shared/services/media.service';
import { logger } from '../../shared/utils/logger';

export class MediaController {
  /**
   * Upload a media file to Cloudinary
   * POST /api/v1/media/upload
   */
  async uploadFile(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.user!;
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          success: false,
          error: 'No file provided',
        });
      }

      // Determine media type from mimetype
      let mediaType: 'image' | 'video' | 'audio' | 'document';
      if (file.mimetype.startsWith('image/')) {
        mediaType = 'image';
      } else if (file.mimetype.startsWith('video/')) {
        mediaType = 'video';
      } else if (file.mimetype.startsWith('audio/')) {
        mediaType = 'audio';
      } else {
        mediaType = 'document';
      }

      // Determine Cloudinary resource type
      let resourceType: 'image' | 'video' | 'raw';
      if (mediaType === 'image') {
        resourceType = 'image';
      } else if (mediaType === 'video' || mediaType === 'audio') {
        resourceType = 'video'; // Cloudinary uses 'video' for both video and audio
      } else {
        resourceType = 'raw'; // Documents
      }

      // Upload to Cloudinary
      const folder = `chatbaby/${organizationId}/uploads`;
      const result = await uploadToCloudinary(file.buffer, {
        folder,
        resourceType,
      });

      if (!result) {
        return res.status(500).json({
          success: false,
          error: 'Failed to upload file. Cloudinary may not be configured.',
        });
      }

      logger.info(
        { organizationId, mediaType, size: file.size, url: result.url },
        'Media file uploaded'
      );

      res.json({
        success: true,
        data: {
          url: result.url,
          publicId: result.publicId,
          type: mediaType,
          mimetype: file.mimetype,
          filename: file.originalname,
          size: file.size,
          width: result.width,
          height: result.height,
          duration: result.duration,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to upload media file');
      next(error);
    }
  }
}

export const mediaController = new MediaController();
