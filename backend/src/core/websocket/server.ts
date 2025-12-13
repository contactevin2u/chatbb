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

let io: Server | null = null;

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    organizationId: string;
    role: string;
  };
}

export function createSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: env.FRONTEND_URL,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Set up Redis adapter for horizontal scaling
  const pubClient = new Redis(redisConfig.url);
  const subClient = pubClient.duplicate();

  io.adapter(createAdapter(pubClient, subClient));
  logger.info('Socket.IO Redis adapter initialized');

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const payload = await verifyToken(token);

      // Get user info
      const user = await prisma.user.findUnique({
        where: { id: payload.userId as string },
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

    // Auto-join organization room
    await socket.join(`org:${organizationId}`);
    logger.debug({ socketId: socket.id, room: `org:${organizationId}` }, 'Joined organization room');

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

    // Join a conversation room
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
      socket.emit('conversation:joined', { conversationId: data.conversationId });
      logger.debug({ socketId: socket.id, conversationId: data.conversationId }, 'Joined conversation');
    });

    socket.on('conversation:leave', async (data: { conversationId: string }) => {
      await socket.leave(`conversation:${data.conversationId}`);
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

    // Disconnect
    socket.on('disconnect', async (reason) => {
      logger.info({ socketId: socket.id, userId, reason }, 'Client disconnected');

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
