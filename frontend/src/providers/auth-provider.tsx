'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { authApi } from '@/lib/api/auth';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { tokens, user, isAuthenticated, setUser, setLoading, logout } = useAuthStore();
  const initialized = useRef(false);

  useEffect(() => {
    // Only run once
    if (initialized.current) return;
    initialized.current = true;

    const initAuth = async () => {
      // If no tokens, just mark as not loading
      if (!tokens?.accessToken) {
        setLoading(false);
        return;
      }

      // If user already exists and is authenticated, just mark as not loading
      if (user && isAuthenticated) {
        setLoading(false);
        return;
      }

      // Check if token is expired
      const now = Math.floor(Date.now() / 1000);
      if (tokens.expiresAt && tokens.expiresAt < now) {
        // Token expired, try to refresh
        try {
          const newTokens = await authApi.refresh(tokens.refreshToken);
          useAuthStore.getState().setTokens(newTokens);
          // Now fetch user with new token
          const fetchedUser = await authApi.me();
          useAuthStore.getState().login(fetchedUser, newTokens);
        } catch {
          // Refresh failed, logout
          logout();
          setLoading(false);
        }
        return;
      }

      // Token not expired, fetch user to validate
      try {
        const fetchedUser = await authApi.me();
        // Set user but keep existing tokens
        setUser(fetchedUser);
        setLoading(false);
      } catch (error: any) {
        // If 401, clear tokens
        if (error?.response?.status === 401) {
          logout();
        }
        setLoading(false);
      }
    };

    initAuth();
  }, []); // Empty deps - only run on mount

  return <>{children}</>;
}
