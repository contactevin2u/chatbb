'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Radio,
  Bot,
  Megaphone,
  BarChart3,
  Settings,
  UsersRound,
  ChevronLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/ui-store';
import { useAuthStore } from '@/stores/auth-store';
import { hasPermission, type Permission } from '@/config/permissions';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: Permission;
}

const navItems: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Inbox', href: '/inbox', icon: MessageSquare, permission: 'conversations:view' },
  { title: 'Contacts', href: '/contacts', icon: Users, permission: 'contacts:view' },
  { title: 'Channels', href: '/channels', icon: Radio, permission: 'channels:view' },
  { title: 'Team', href: '/team', icon: UsersRound, permission: 'team:view' },
  { title: 'Automation', href: '/automation', icon: Bot, permission: 'automation:view' },
  { title: 'Broadcasts', href: '/broadcasts', icon: Megaphone, permission: 'broadcasts:view' },
  { title: 'Reports', href: '/reports', icon: BarChart3, permission: 'reports:view' },
  { title: 'Settings', href: '/settings', icon: Settings, permission: 'settings:view' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { user } = useAuthStore();

  const filteredNavItems = navItems.filter((item) => {
    if (!item.permission) return true;
    if (!user?.role) return false;
    return hasPermission(user.role, item.permission);
  });

  return (
    <>
      {/* Backdrop for mobile */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 lg:hidden transition-opacity',
          sidebarCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
        )}
        onClick={toggleSidebar}
      />

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transition-transform lg:translate-x-0',
          sidebarCollapsed ? '-translate-x-full' : 'translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b">
          <Link href="/dashboard" className="flex items-center gap-2">
            <MessageSquare className="h-7 w-7 text-primary" />
            <span className="text-xl font-bold">ChatBaby</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={toggleSidebar}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {filteredNavItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
                onClick={() => {
                  // Close sidebar on mobile after navigation
                  if (window.innerWidth < 1024) {
                    toggleSidebar();
                  }
                }}
              >
                <Icon className="h-5 w-5" />
                {item.title}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
