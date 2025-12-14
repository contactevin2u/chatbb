'use client';

import { useRouter } from 'next/navigation';
import { Menu, Search, LogOut, User, Settings, Command } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useUIStore } from '@/stores/ui-store';
import { useAuthStore } from '@/stores/auth-store';
import { NotificationBell } from './notification-bell';

export function Header() {
  const router = useRouter();
  const { setMobileMenuOpen, openCommandPalette } = useUIStore();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const initials = user
    ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`
    : '??';

  return (
    <header className="sticky top-0 z-30 h-16 bg-gradient-to-r from-white via-pink-50/50 to-lavender-50/50 dark:from-purple-950 dark:via-purple-900/50 dark:to-pink-950/50 border-b border-pink-200/50 dark:border-purple-800/50 flex items-center justify-between px-4 backdrop-blur-sm">
      {/* Left side */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setMobileMenuOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Search / Command Palette Trigger */}
        <button
          onClick={openCommandPalette}
          className="hidden md:flex items-center gap-2 bg-pink-100/50 dark:bg-purple-900/30 hover:bg-pink-200/50 dark:hover:bg-purple-900/50 rounded-xl px-3 py-2 transition-all duration-200 cursor-pointer border border-pink-200/50 dark:border-purple-800/50 hover:shadow-pink-sm group"
        >
          <Search className="h-4 w-4 text-pink-500 dark:text-pink-400 group-hover:scale-110 transition-transform" />
          <span className="text-sm text-pink-600 dark:text-pink-300 w-48 text-left">Search...</span>
          <kbd className="hidden lg:inline-flex h-5 select-none items-center gap-1 rounded-lg border border-pink-200 dark:border-purple-700 bg-white dark:bg-purple-900/50 px-1.5 font-mono text-[10px] font-medium text-pink-500 dark:text-pink-400">
            <Command className="h-3 w-3" />K
          </kbd>
        </button>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Notifications - Unreplied conversations (72 hours) */}
        <NotificationBell />

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full ring-2 ring-pink-200 dark:ring-purple-700 hover:ring-pink-400 dark:hover:ring-purple-500 transition-all duration-200">
              <Avatar className="h-9 w-9">
                <AvatarImage src={user?.avatarUrl || undefined} alt={user?.firstName} />
                <AvatarFallback className="bg-gradient-to-br from-pink-400 to-purple-400 text-white text-sm font-medium">{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 dropdown-cute" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none text-pink-900 dark:text-pink-100">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs leading-none text-pink-500 dark:text-pink-400">
                  {user?.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-pink-200/50 dark:bg-purple-800/50" />
            <DropdownMenuItem onClick={() => router.push('/settings/profile')} className="hover:bg-pink-100 dark:hover:bg-purple-900/50 focus:bg-pink-100 dark:focus:bg-purple-900/50 text-pink-700 dark:text-pink-300 cursor-pointer rounded-lg">
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/settings')} className="hover:bg-pink-100 dark:hover:bg-purple-900/50 focus:bg-pink-100 dark:focus:bg-purple-900/50 text-pink-700 dark:text-pink-300 cursor-pointer rounded-lg">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-pink-200/50 dark:bg-purple-800/50" />
            <DropdownMenuItem onClick={handleLogout} className="text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/30 focus:bg-rose-100 dark:focus:bg-rose-900/30 cursor-pointer rounded-lg">
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
