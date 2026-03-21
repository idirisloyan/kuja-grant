'use client';

import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Menu, LogOut, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function Header() {
  const router = useRouter();
  const { user, logout, setLanguage } = useAuthStore();
  const { toggleSidebar, toggleAIPanel } = useUIStore();

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  if (!user) return null;

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 sm:px-6 bg-white border-b border-slate-200">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden h-8 w-8"
          onClick={toggleSidebar}
        >
          <Menu className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex items-center gap-3">
        {/* AI Assistant */}
        <button
          onClick={toggleAIPanel}
          className="text-sm text-slate-500 hover:text-brand-600 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">AI Assistant</span>
          </span>
        </button>

        {/* Language */}
        <Select
          value={user.language || 'en'}
          onValueChange={(val) => { if (val) setLanguage(val); }}
        >
          <SelectTrigger className="w-[60px] h-8 text-xs border-slate-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">EN</SelectItem>
            <SelectItem value="ar">AR</SelectItem>
            <SelectItem value="fr">FR</SelectItem>
            <SelectItem value="es">ES</SelectItem>
          </SelectContent>
        </Select>

        {/* User */}
        <div className="flex items-center gap-2">
          <Avatar className="w-7 h-7">
            <AvatarFallback className="bg-brand-600 text-white text-xs font-medium">
              {user.name?.charAt(0)?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <span className="hidden md:inline text-sm text-slate-700">
            {user.name}
          </span>
        </div>

        {/* Logout */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          className="h-8 w-8 text-slate-400 hover:text-slate-600"
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}
