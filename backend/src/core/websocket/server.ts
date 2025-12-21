/**
 * WebSocket Server
 *
 * Socket.IO server with Redis adapter for horizontal scaling
 * Handles real-time communication for messaging, typing indicators, and channel events
 */

import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { env } from '../../config/env';
import { redisConfig } from '../../config/redis';
import { logger } from '../../shared/utils/logger';
import { verifyToken } from '../../shared/utils/jwt';
import { prisma } from '../database/prisma';
import { redis } from '../cache/redis.client';

let io: Server | null = null;
let adapterPubClient: Redis | null = null;
let adapterSubClient: Redis | null = null;

// Presence tracking constants
const PRESENCE_PREFIX = 'conv:viewers:';
const PRESENCE_TTL = 3600; // 1 hour TTL for presence data

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    organizationId: string;
    role: string;
    joinedConversations: Set<string>; // Track joined conversations for cleanup on disconnect
  };
}

export function createSocketServer(httpServer: HttpServer): Server {
  // CORS configuration - support multiple origins
  const allowedOrigins = [
    env.FRONTEND_URL,
    'http://localhost:3000',
    'https://chatbb-mauve.vercel.app',
  ].filter(Boolean);

  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          logger.warn({ origin }, 'WebSocket CORS blocked origin');
          callback(null, false);
        }
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Set up Redis adapter for horizontal scaling
  adapterPubClient = new Redis(redisConfig.url);
  adapterSubClient = adapterPubClient.duplicate();

  io.adapter(createAdapter(adapterPubClient, adapterSubClient));
  logger.info('Socket.IO Redis adapter initialized');

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const payload = await verifyToken(token);

      // Get user info (payload.sub contains the user ID)
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, organizationId: true, role: true },
      });

      if (!user) {
        return next(new Error('User not found'));
      }

      // Attach user data to socket
      socket.data = {
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
        joinedConversations: new Set<string>(), // Initialize conversation tracking
      };

      next();
    } catch (error) {
      logger.warn({ error }, 'Socket authentication failed');
      next(new Error('Invalid token'));
    }
  });

  // Connection handling
  io.on('connection', async (socket: AuthenticatedSocket) => {
    const { userId, organizationId, role } = socket.data;

    logger.info({ socketId: socket.id, userId, organizationId }, 'Client connected');

    // Join user-specific room for targeted notifications and sender exclusion
    await socket.join(`user:${userId}`);

    // Auto-join organization room
    await socket.join(`org:${organizationId}`);
    logger.debug({ socketId: socket.id, rooms: [`user:${userId}`, `org:${organizationId}`] }, 'Joined rooms');

    // Update user online status
    await prisma.user.update({
      where: { id: userId },
      data: { lastActiveAt: new Date() },
    });

    // Join a channel room (for QR code streaming, etc.)
    socket.on('channel:subscribe', async (data: { channelId: string }) => {
      // Verify user has access to this channel
      const channel = await prisma.channel.findFirst({
        where: {
          id: data.channelId,
          organizationId,
        },
      });

      if (!channel) {
        socket.emit('error', { message: 'Channel not found or access denied' });
        return;
      }

      await socket.join(`channel:${data.channelId}`);
      socket.emit('channel:subscribed', { channelId: data.channelId });
      logger.debug({ socketId: socket.id, channelId: data.channelId }, 'Subscribed to channel');
    });

    socket.on('channel:unsubscribe', async (data: { channelId: string }) => {
      await socket.leave(`channel:${data.channelId}`);
      socket.emit('channel:unsubscribed', { channelId: data.channelId });
      logger.debug({ socketId: socket.id, channelId: data.channelId }, 'Unsubscribed from channel');
    });

    // Join a conversation room with presence tracking
    socket.on('conversation:join', async (data: { conversationId: string }) => {
      // Verify user has access to this conversation
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: data.conversationId,
          organizationId,
        },
      });

      if (!conversation) {
        socket.emit('error', { message: 'Conversation not found or access denied' });
        return;
      }

      await socket.join(`conversation:${data.conversationId}`);

      // Track active viewers using Redis sets
      const presenceKey = `${PRESENCE_PREFIX}${data.conversationId}`;
      try {
        // Get user info for presence data
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { firstName: true, lastName: true },
        });

        // Store user presence with name as JSON
        const presenceData = JSON.stringify({
          id: userId,
          firstName: user?.firstName,
          lastName: user?.lastName,
          joinedAt: new Date().toISOString(),
        });
        await redis.hset(presenceKey, `user:${userId}`, presenceData);
        await redis.expire(presenceKey, PRESENCE_TTL);

        // Get all current viewers and broadcast to room
        const viewerData = await redis.hgetall(presenceKey);
        const viewers = Object.values(viewerData).map(v => JSON.parse(v));

        // Broadcast updated viewers list to everyone in the room (including joiner)
        io?.to(`conversation:${data.conversationId}`).emit('viewers:update', {
          conversationId: data.conversationId,
          viewers,
        });
      } catch (error) {
        // Redis error - continue without presence tracking
        logger.debug({ conversationId: data.conversationId, error }, 'Failed to track conversation presence');
      }

      // Track joined conversation for cleanup on disconnect
      socket.data.joinedConversations.add(data.conversationId);

      socket.emit('conversation:joined', { conversationId: data.conversationId });
      logger.debug({ socketId: socket.id, conversationId: data.conversationId }, 'Joined conversation');
    });

    socket.on('conversation:leave', async (data: { conversationId: string }) => {
      await socket.leave(`conversation:${data.conversationId}`);

      // Remove from tracking
      socket.data.joinedConversations.delete(data.conversationId);

      // Remove from presence tracking
      const presenceKey = `${PRESENCE_PREFIX}${data.conversationId}`;
      try {
        await redis.hdel(presenceKey, `user:${userId}`);

        // Broadcast updated viewers list to remaining room members
        const viewerData = await redis.hgetall(presenceKey);
        const viewers = Object.values(viewerData).map(v => JSON.parse(v));

        io?.to(`conversation:${data.conversationId}`).emit('viewers:update', {
          conversationId: data.conversationId,
          viewers,
        });
      } catch (error) {
        // Redis error - continue without presence update
        logger.debug({ conversationId: data.conversationId, error }, 'Failed to update conversation presence on leave');
      }

      socket.emit('conversation:left', { conversationId: data.conversationId });
      logger.debug({ socketId: socket.id, conversationId: data.conversationId }, 'Left conversation');
    });

    // Typing indicators
    socket.on('typing:start', async (data: { conversationId: string }) => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });

      socket.to(`conversation:${data.conversationId}`).emit('typing:start', {
        conversationId: data.conversationId,
        userId,
        userName: `${user?.firstName} ${user?.lastName}`.trim(),
      });
    });

    socket.on('typing:stop', (data: { conversationId: string }) => {
      socket.to(`conversation:${data.conversationId}`).emit('typing:stop', {
        conversationId: data.conversationId,
        userId,
      });
    });

    // Broadcast pending message to other agents (shared optimistic UI to prevent double-reply)
    socket.on('message:pending', async (data: {
      conversationId: string;
      message: {
        id: string;
        type: string;
        content: { text?: string; url?: string; mimetype?: string; filename?: string };
        quotedMessageId?: string;
      };
    }) => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });

      // Broadcast to OTHER agents in the conversation room (excludes sender)
      socket.to(`conversation:${data.conversationId}`).emit('message:pending', {
        conversationId: data.conversationId,
        message: {
          ...data.message,
          conversationId: data.conversationId,
          direction: 'OUTBOUND',
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          sentByUser: {
            id: userId,
            firstName: user?.firstName,
            lastName: user?.lastName,
          },
        },
      });
    });

    // Mark messages as read
    socket.on('messages:read', async (data: { conversationId: string; messageIds: string[] }) => {
      // Broadcast to other users viewing this conversation
      socket.to(`conversation:${data.conversationId}`).emit('messages:read', {
        conversationId: data.conversationId,
        messageIds: data.messageIds,
        readBy: userId,
      });
    });

    // Heartbeat
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Disconnect - cleanup presence for all joined conversations
    socket.on('disconnect', async (reason) => {
      logger.info({ socketId: socket.id, userId, reason }, 'Client disconnected');

      // Clean up presence for all conversations this user was viewing
      for (const conversationId of socket.data.joinedConversations) {
        const presenceKey = `${PRESENCE_PREFIX}${conversationId}`;
        try {
          await redis.hdel(presenceKey, `user:${userId}`);

          // Broadcast updated viewers list to remaining room members
          const viewerData = await redis.hgetall(presenceKey);
          const viewers = Object.values(viewerData).map(v => JSON.parse(v));

          io?.to(`conversation:${conversationId}`).emit('viewers:update', {
            conversationId,
            viewers,
          });
        } catch (error) {
          // Redis error - continue cleanup for other conversations
          logger.debug({ conversationId, error }, 'Failed to cleanup presence on disconnect');
        }
      }

      // Update last active time
      await prisma.user.update({
        where: { id: userId },
        data: { lastActiveAt: new Date() },
      }).catch(() => {
        // Ignore errors on disconnect
      });
    });
  });

  logger.info('Socket.IO server initialized');
  return io;
}

export function getSocketServer(): Server {
  if (!io) {
    throw new Error('Socket.IO server not initialized');
  }
  return io;
}

// Socket server interface for type safety
interface SocketServerInterface {
  to: (room: string) => { emit: (event: string, data?: unknown) => void };
  emit: (event: string, data: unknown) => void;
}

// Export socketServer as an alias for getSocketServer for convenience
export const socketServer: SocketServerInterface = {
  to: (room: string) => {
    if (!io) {
      return {
        emit: () => {
          logger.warn('Socket.IO not initialized, cannot emit');
        },
      };
    }
    return io.to(room) as { emit: (event: string, data?: unknown) => void };
  },
  emit: (event: string, data: unknown) => {
    if (!io) {
      logger.warn('Socket.IO not initialized, cannot emit');
      return;
    }
    io.emit(event, data);
  },
};

// Emit to specific organization
export function emitToOrganization(organizationId: string, event: string, data: unknown): void {
  if (io) {
    io.to(`org:${organizationId}`).emit(event, data);
  }
}

// Emit to specific conversation
export function emitToConversation(conversationId: string, event: string, data: unknown): void {
  if (io) {
    io.to(`conversation:${conversationId}`).emit(event, data);
  }
}

// Emit to specific channel (for QR codes, status updates, etc.)
export function emitToChannel(channelId: string, event: string, data: unknown): void {
  if (io) {
    io.to(`channel:${channelId}`).emit(event, data);
  }
}

// Emit to specific user
export function emitToUser(userId: string, event: string, data: unknown): void {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
}

// Emit to organization excluding a specific user (for sender deduplication)
export function emitToOrgExceptUser(
  organizationId: string,
  excludeUserId: string,
  event: string,
  data: unknown
): void {
  if (io) {
    io.to(`org:${organizationId}`).except(`user:${excludeUserId}`).emit(event, data);
  }
}

// Cleanup Socket.IO Redis adapter connections
export async function cleanupSocketServer(): Promise<void> {
  logger.info('Cleaning up Socket.IO server...');

  // Close Socket.IO server
  if (io) {
    io.close();
    io = null;
  }

  // Close Redis adapter connections
  if (adapterPubClient) {
    await adapterPubClient.quit();
    adapterPubClient = null;
  }
  if (adapterSubClient) {
    await adapterSubClient.quit();
    adapterSubClient = null;
  }

  logger.info('Socket.IO cleanup complete');
}
