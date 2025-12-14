'use client';

import { useEffect, useCallback, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { ShortcutsHelpDialog } from '@/components/shortcuts-help';
import { useKeyboardShortcuts, KeyboardShortcut } from '@/hooks/use-keyboard-shortcuts';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, tokens } = useAuthStore();
  const {
    sidebarCollapsed,
    openShortcutsHelp,
    toggleCommandPalette,
    toggleConversationList,
  } = useUIStore();

  // Global keyboard shortcuts
  const globalShortcuts = useMemo<KeyboardShortcut[]>(
    () => [
      {
        key: 'k',
        ctrl: true,
        description: 'Open command palette',
        category: 'general',
        action: toggleCommandPalette,
      },
      {
        key: '/',
        ctrl: true,
        description: 'Toggle conversation list',
        category: 'general',
        action: toggleConversationList,
      },
      {
        key: '?',
        description: 'Show keyboard shortcuts',
        category: 'general',
        action: openShortcutsHelp,
      },
      {
        key: 'g',
        description: 'Go to prefix (wait for next key)',
        category: 'navigation',
        action: () => {
          // This is a prefix key, handled separately
        },
      },
    ],
    [toggleCommandPalette, toggleConversationList, openShortcutsHelp]
  );

  useKeyboardShortcuts({ shortcuts: globalShortcuts, enabled: isAuthenticated });

  useEffect(() => {
    // Check authentication
    if (!isLoading && !isAuthenticated && !tokens) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, tokens, router]);

  // Show loading while checking auth
  if (isLoading || (!isAuthenticated && tokens)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-white to-lavender-50 dark:from-purple-950 dark:via-purple-900 dark:to-pink-950">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Loader2 className="h-10 w-10 animate-spin text-pink-500" />
            <div className="absolute inset-0 h-10 w-10 animate-ping opacity-30 rounded-full bg-pink-400" />
          </div>
          <p className="text-pink-600 dark:text-pink-400 font-medium animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect if not authenticated
  if (!isAuthenticated && !tokens) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className={cn(
        'transition-all duration-200 ease-in-out',
        sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'
      )}>
        {/* Header */}
        <Header />

        {/* Page Content */}
        <main className="h-[calc(100vh-64px)]">{children}</main>
      </div>

      {/* Global Modals */}
      <ShortcutsHelpDialog />
    </div>
  );
}
