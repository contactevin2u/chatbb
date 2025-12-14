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
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
