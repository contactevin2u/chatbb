/**
 * Media Service
 *
 * Handles media download from WhatsApp and upload to Cloudinary
 */

import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { downloadMediaMessage, WAMessage, getContentType, proto } from '@whiskeysockets/baileys';
import { Readable } from 'stream';
import { env } from '../../config/env';
import { logger } from '../utils/logger';

// Configure Cloudinary if URL is available
// Format: cloudinary://API_KEY:API_SECRET@CLOUD_NAME
if (env.CLOUDINARY_URL) {
  // Cloudinary SDK automatically parses CLOUDINARY_URL from environment
  // But we set it explicitly to be safe
  const url = new URL(env.CLOUDINARY_URL.replace('cloudinary://', 'https://'));
  const [apiKey, apiSecret] = url.username ? `${url.username}:${url.password}`.split(':') : ['', ''];
  const cloudName = url.hostname;

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
  logger.info({ cloudName }, 'Cloudinary configured');
} else {
  logger.warn('Cloudinary not configured (CLOUDINARY_URL not set) - media will not be uploaded');
}

export interface MediaInfo {
  url: string;
  publicId: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  format: string;
  resourceType: 'image' | 'video' | 'raw';
}

export interface DownloadedMedia {
  buffer: Buffer;
  mimeType: string;
  filename?: string;
}

/**
 * Get content type from WhatsApp message
 */
export function getWhatsAppContentType(message: proto.IMessage): string | undefined {
  return getContentType(message);
}

/**
 * Check if message contains media
 */
export function isMediaMessage(message: proto.IMessage): boolean {
  const mediaTypes = [
    'imageMessage',
    'videoMessage',
    'audioMessage',
    'documentMessage',
    'stickerMessage',
  ];
  const contentType = getContentType(message);
  return contentType ? mediaTypes.includes(contentType) : false;
}

/**
 * Get media message info
 */
export function getMediaMessageInfo(message: proto.IMessage): {
  type: 'image' | 'video' | 'audio' | 'document' | 'sticker';
  mimeType?: string;
  filename?: string;
  caption?: string;
  seconds?: number;
  isAnimated?: boolean;
  isGif?: boolean;
} | null {
  const contentType = getContentType(message);
  if (!contentType) return null;

  switch (contentType) {
    case 'imageMessage': {
      const img = message.imageMessage;
      return {
        type: 'image',
        mimeType: img?.mimetype || 'image/jpeg',
        caption: img?.caption || undefined,
      };
    }
    case 'videoMessage': {
      const vid = message.videoMessage;
      return {
        type: 'video',
        mimeType: vid?.mimetype || 'video/mp4',
        caption: vid?.caption || undefined,
        seconds: vid?.seconds || undefined,
        isGif: vid?.gifPlayback || false,
      };
    }
    case 'audioMessage': {
      const aud = message.audioMessage;
      return {
        type: 'audio',
        mimeType: aud?.mimetype || 'audio/ogg',
        seconds: aud?.seconds || undefined,
      };
    }
    case 'documentMessage': {
      const doc = message.documentMessage;
      return {
        type: 'document',
        mimeType: doc?.mimetype || 'application/octet-stream',
        filename: doc?.fileName || undefined,
        caption: doc?.caption || undefined,
      };
    }
    case 'stickerMessage': {
      const stk = message.stickerMessage;
      return {
        type: 'sticker',
        mimeType: stk?.mimetype || 'image/webp',
        isAnimated: stk?.isAnimated || false,
      };
    }
    default:
      return null;
  }
}

/**
 * Download media from WhatsApp message
 */
export async function downloadWhatsAppMedia(
  waMessage: WAMessage,
  reuploadRequest?: (msg: WAMessage) => Promise<WAMessage>
): Promise<DownloadedMedia | null> {
  try {
    if (!waMessage.message) return null;

    const mediaInfo = getMediaMessageInfo(waMessage.message);
    if (!mediaInfo) return null;

    // Download as buffer
    const buffer = await downloadMediaMessage(
      waMessage,
      'buffer',
      {},
      {
        logger: logger as any,
        reuploadRequest,
      }
    ) as Buffer;

    return {
      buffer,
      mimeType: mediaInfo.mimeType || 'application/octet-stream',
      filename: mediaInfo.type === 'document' ? mediaInfo.filename : undefined,
    };
  } catch (error) {
    logger.error({ error, messageId: waMessage.key?.id }, 'Failed to download WhatsApp media');
    return null;
  }
}

/**
 * Upload media buffer to Cloudinary
 */
export async function uploadToCloudinary(
  buffer: Buffer,
  options: {
    folder: string;
    resourceType?: 'image' | 'video' | 'raw' | 'auto';
    format?: string;
    publicId?: string;
  }
): Promise<MediaInfo | null> {
  if (!env.CLOUDINARY_URL) {
    logger.warn('Cloudinary not configured, skipping upload');
    return null;
  }

  try {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: options.folder,
          resource_type: options.resourceType || 'auto',
          format: options.format,
          public_id: options.publicId,
          overwrite: true, // Prevent duplicates - if publicId exists, overwrite it
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else if (result) {
            resolve({
              url: result.secure_url,
              publicId: result.public_id,
              mimeType: `${result.resource_type}/${result.format}`,
              size: result.bytes,
              width: result.width,
              height: result.height,
              duration: result.duration,
              format: result.format,
              resourceType: result.resource_type as 'image' | 'video' | 'raw',
            });
          } else {
            reject(new Error('No result from Cloudinary'));
          }
        }
      );

      // Create readable stream from buffer and pipe to upload
      const readable = Readable.from(buffer);
      readable.pipe(uploadStream);
    });
  } catch (error) {
    logger.error({ error }, 'Failed to upload to Cloudinary');
    return null;
  }
}

/**
 * Upload image from URL to Cloudinary
 */
export async function uploadFromUrlToCloudinary(
  imageUrl: string,
  options: {
    folder: string;
    publicId?: string;
  }
): Promise<string | null> {
  if (!env.CLOUDINARY_URL) {
    logger.warn('Cloudinary not configured, skipping upload');
    return null;
  }

  try {
    const result = await cloudinary.uploader.upload(imageUrl, {
      folder: options.folder,
      resource_type: 'image',
      public_id: options.publicId,
      overwrite: true,
    });
    return result.secure_url;
  } catch (error) {
    logger.debug({ error, imageUrl }, 'Failed to upload URL to Cloudinary');
    return null;
  }
}

/**
 * Download from WhatsApp and upload to Cloudinary
 */
export async function processWhatsAppMedia(
  waMessage: WAMessage,
  organizationId: string,
  reuploadRequest?: (msg: WAMessage) => Promise<WAMessage>
): Promise<{
  url: string;
  mimeType: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
} | null> {
  // Download from WhatsApp
  const downloaded = await downloadWhatsAppMedia(waMessage, reuploadRequest);
  if (!downloaded) return null;

  // Upload to Cloudinary
  const folder = `chatbaby/${organizationId}/media`;
  const uploaded = await uploadToCloudinary(downloaded.buffer, {
    folder,
    resourceType: 'auto',
    publicId: waMessage.key?.id || undefined,
  });

  if (!uploaded) {
    // Cloudinary not configured or upload failed
    // Return placeholder (in production, you might want to handle this differently)
    return {
      url: '',
      mimeType: downloaded.mimeType,
    };
  }

  return {
    url: uploaded.url,
    mimeType: downloaded.mimeType,
    size: uploaded.size,
    width: uploaded.width,
    height: uploaded.height,
    duration: uploaded.duration,
  };
}

/**
 * Delete media from Cloudinary
 */
export async function deleteFromCloudinary(publicId: string): Promise<boolean> {
  if (!env.CLOUDINARY_URL) return false;

  try {
    await cloudinary.uploader.destroy(publicId);
    return true;
  } catch (error) {
    logger.error({ error, publicId }, 'Failed to delete from Cloudinary');
    return false;
  }
}

export const mediaService = {
  getWhatsAppContentType,
  isMediaMessage,
  getMediaMessageInfo,
  downloadWhatsAppMedia,
  uploadToCloudinary,
  processWhatsAppMedia,
  deleteFromCloudinary,
};
