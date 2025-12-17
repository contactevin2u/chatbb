'use client';

import Link from 'next/link';
import Image from 'next/image';
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
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
  BookOpen,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/ui-store';
import { useAuthStore } from '@/stores/auth-store';
import { hasPermission, type Permission } from '@/config/permissions';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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
  { title: 'Knowledge', href: '/knowledge', icon: BookOpen, permission: 'knowledge:view' },
  { title: 'AI Settings', href: '/settings/ai', icon: Sparkles, permission: 'ai:view' },
  { title: 'Automation', href: '/automation', icon: Bot, permission: 'automation:view' },
  { title: 'Broadcasts', href: '/broadcasts', icon: Megaphone, permission: 'broadcasts:view' },
  { title: 'Reports', href: '/reports', icon: BarChart3, permission: 'reports:view' },
  { title: 'Settings', href: '/settings', icon: Settings, permission: 'settings:view' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar, mobileMenuOpen, setMobileMenuOpen } = useUIStore();
  const { user } = useAuthStore();

  const filteredNavItems = navItems.filter((item) => {
    if (!item.permission) return true;
    if (!user?.role) return false;
    return hasPermission(user.role, item.permission);
  });

  return (
    <TooltipProvider delayDuration={0}>
      {/* Backdrop for mobile */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 lg:hidden transition-opacity duration-200',
          mobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col transition-all duration-300 ease-out',
          'bg-gradient-to-b from-hotpink-50 via-white to-lavender-50',
          'dark:from-purple-950 dark:via-purple-900 dark:to-hotpink-950/80',
          'border-r border-hotpink-200/30 dark:border-purple-700/50',
          'shadow-[0_0_30px_rgba(255,26,133,0.08)]',
          // Desktop: collapsed = icon-only (w-16), expanded = full (w-64)
          sidebarCollapsed ? 'lg:w-16' : 'lg:w-64',
          // Mobile: controlled by mobileMenuOpen
          mobileMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Logo */}
        <div className={cn(
          'h-16 flex items-center border-b border-pink-200/30 dark:border-purple-800/30 transition-all duration-200',
          sidebarCollapsed ? 'lg:justify-center lg:px-2 px-4' : 'justify-between px-4'
        )}>
          <Link href="/dashboard" className="flex items-center group">
            <Image
              src="/logo.png"
              alt="ChatBaby"
              width={sidebarCollapsed ? 40 : 140}
              height={40}
              className="object-contain transition-all duration-200"
              priority
            />
          </Link>
          {/* Mobile close button */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className={cn(
          'flex-1 py-4 space-y-1 overflow-y-auto',
          sidebarCollapsed ? 'lg:px-2 px-4' : 'px-4'
        )}>
          {filteredNavItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            const linkContent = (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200',
                  sidebarCollapsed ? 'lg:justify-center lg:px-0 lg:py-2.5 px-3 py-2.5' : 'px-3 py-2.5',
                  isActive
                    ? 'bg-gradient-to-r from-hotpink-500 to-purple-500 text-white shadow-[0_4px_15px_rgba(255,26,133,0.4)]'
                    : 'text-hotpink-700 dark:text-hotpink-200 hover:bg-hotpink-100 dark:hover:bg-purple-900/50 hover:text-hotpink-900 dark:hover:text-hotpink-100'
                )}
                onClick={() => {
                  // Close sidebar on mobile after navigation
                  if (window.innerWidth < 1024) {
                    setMobileMenuOpen(false);
                  }
                }}
              >
                <Icon className={cn(
                  'h-5 w-5 flex-shrink-0 transition-all duration-200',
                  sidebarCollapsed && 'lg:h-5 lg:w-5',
                  !isActive && 'group-hover:scale-110 group-hover:animate-wiggle'
                )} />
                <span className={cn(
                  'transition-all duration-200',
                  sidebarCollapsed ? 'lg:hidden' : ''
                )}>
                  {item.title}
                </span>
              </Link>
            );

            // Show tooltip when collapsed on desktop
            if (sidebarCollapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>
                    {linkContent}
                  </TooltipTrigger>
                  <TooltipContent side="right" className="hidden lg:block tooltip-cute">
                    {item.title}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return linkContent;
          })}
        </nav>

        {/* Collapse Toggle (Desktop only) */}
        <div className={cn(
          'hidden lg:flex border-t border-hotpink-200/30 dark:border-purple-700/30 p-2',
          sidebarCollapsed ? 'justify-center' : 'justify-end'
        )}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className="h-8 w-8 text-hotpink-500 dark:text-hotpink-400 hover:bg-hotpink-100 dark:hover:bg-purple-900/50 hover:text-hotpink-600 dark:hover:text-hotpink-300 transition-all duration-200 rounded-lg hover:scale-110"
              >
                {sidebarCollapsed ? (
                  <PanelLeft className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-gradient-to-r from-hotpink-500 to-purple-500 text-white border-0">
              {sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} <kbd className="ml-2 text-xs opacity-60">[</kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
