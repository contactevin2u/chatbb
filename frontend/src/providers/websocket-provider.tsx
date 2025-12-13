'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/auth-store';
import { env } from '@/config/env';
import axios from 'axios';

interface WebSocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  subscribeToChannel: (channelId: string) => void;
  unsubscribeFromChannel: (channelId: string) => void;
  joinConversation: (conversationId: string) => void;
  leaveConversation: (conversationId: string) => void;
  startTyping: (conversationId: string) => void;
  stopTyping: (conversationId: string) => void;
}

const WebSocketContext = createContext<WebSocketContextType>({
  socket: null,
  isConnected: false,
  subscribeToChannel: () => {},
  unsubscribeFromChannel: () => {},
  joinConversation: () => {},
  leaveConversation: () => {},
  startTyping: () => {},
  stopTyping: () => {},
});

export function useWebSocket() {
  return useContext(WebSocketContext);
}

interface WebSocketProviderProps {
  children: React.ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { tokens, isAuthenticated } = useAuthStore();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !tokens?.accessToken) {
      // Disconnect if not authenticated
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    // Create socket connection (use WS_URL, not API_URL which has /api/v1 suffix)
    const newSocket = io(env.NEXT_PUBLIC_WS_URL, {
      auth: {
        token: tokens.accessToken,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = newSocket;

    // Connection events
    newSocket.on('connect', () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      setIsConnected(false);
    });

    newSocket.on('connect_error', async (error) => {
      console.error('WebSocket connection error:', error.message);
      setIsConnected(false);

      // If auth error, try to refresh token
      if (error.message.includes('authentication') || error.message.includes('jwt') || error.message.includes('token')) {
        console.log('Socket auth failed, attempting token refresh...');
        try {
          const refreshToken = useAuthStore.getState().tokens?.refreshToken;
          if (refreshToken) {
            const API_URL = env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
            const response = await axios.post(`${API_URL}/api/v1/auth/refresh`, { refreshToken });
            const newTokens = response.data;

            // Update store with new tokens
            useAuthStore.getState().setTokens(newTokens);

            // Update socket auth and reconnect
            newSocket.auth = { token: newTokens.accessToken };
            newSocket.connect();
            console.log('Token refreshed, reconnecting socket...');
          }
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError);
          // Logout on refresh failure
          useAuthStore.getState().logout();
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
        }
      }
    });

    setSocket(newSocket);

    // Cleanup on unmount
    return () => {
      newSocket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, tokens?.accessToken]);

  const subscribeToChannel = useCallback((channelId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('channel:subscribe', { channelId });
    }
  }, []);

  const unsubscribeFromChannel = useCallback((channelId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('channel:unsubscribe', { channelId });
    }
  }, []);

  const joinConversation = useCallback((conversationId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('conversation:join', { conversationId });
    }
  }, []);

  const leaveConversation = useCallback((conversationId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('conversation:leave', { conversationId });
    }
  }, []);

  const startTyping = useCallback((conversationId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('typing:start', { conversationId });
    }
  }, []);

  const stopTyping = useCallback((conversationId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('typing:stop', { conversationId });
    }
  }, []);

  return (
    <WebSocketContext.Provider
      value={{
        socket,
        isConnected,
        subscribeToChannel,
        unsubscribeFromChannel,
        joinConversation,
        leaveConversation,
        startTyping,
        stopTyping,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}
