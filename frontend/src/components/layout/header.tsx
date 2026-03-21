'use client';

import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Menu, LogOut, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';

const roleColors: Record<string, string> = {
  ngo: 'bg-brand-100 text-brand-700',
  donor: 'bg-emerald-100 text-emerald-700',
  reviewer: 'bg-amber-100 text-amber-700',
  admin: 'bg-slate-200 text-slate-700',
};

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
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 sm:px-6 bg-white/80 backdrop-blur-lg border-b border-slate-200/60">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={toggleSidebar}
        >
          <Menu className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* AI Assistant Button */}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-brand-600 border-brand-200 hover:bg-brand-50"
          onClick={toggleAIPanel}
        >
          <Sparkles className="w-4 h-4" />
          <span className="hidden sm:inline">AI Assistant</span>
        </Button>

        {/* Language */}
        <Select
          value={user.language || 'en'}
          onValueChange={(val) => { if (val) setLanguage(val); }}
        >
          <SelectTrigger className="w-[70px] h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">EN</SelectItem>
            <SelectItem value="ar">AR</SelectItem>
            <SelectItem value="fr">FR</SelectItem>
            <SelectItem value="es">ES</SelectItem>
          </SelectContent>
        </Select>

        {/* User info */}
        <div className="flex items-center gap-2">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-brand-600 text-white text-xs font-semibold">
              {user.name?.charAt(0)?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="hidden md:block">
            <p className="text-sm font-medium text-slate-900 leading-tight">{user.name}</p>
          </div>
          <Badge variant="secondary" className={`text-[10px] font-semibold uppercase ${roleColors[user.role] || ''}`}>
            {user.role}
          </Badge>
        </div>

        {/* Logout */}
        <Button variant="ghost" size="icon" onClick={handleLogout} className="text-slate-400 hover:text-slate-700">
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}
