'use client';

/**
 * Kuja header — shadcn + Tailwind rewrite.
 * Includes the upgraded 6-language picker (flag + native name) and
 * user avatar menu with logout.
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useTranslation } from '@/lib/hooks/use-translation';
import { supportedLanguages } from '@/i18n';
import { cn } from '@/lib/utils';

import {
  Menu, LogOut, Sparkles, ChevronDown, User as UserIcon, Check, Globe,
} from 'lucide-react';

export function Header() {
  const router = useRouter();
  const { user, logout, setLanguage } = useAuthStore();
  const language = user?.language ?? 'en';
  const { setMobileSidebarOpen } = useUIStore();
  const { t } = useTranslation();

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setLangMenuOpen(false);
      }
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, []);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const openCopilot = () => {
    window.dispatchEvent(new CustomEvent('kuja:open-copilot'));
  };

  if (!user) return null;

  const currentLang = supportedLanguages.find((l) => l.code === language) ?? supportedLanguages[0];
  const initials = (user.name ?? user.email ?? 'U').split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();

  return (
    <header
      className="sticky top-0 z-30 h-16 flex items-center bg-background border-b border-border px-3 sm:px-5"
    >
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setMobileSidebarOpen(true)}
        className="mr-2 p-2 rounded-md hover:bg-muted text-muted-foreground lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex-1" />

      {/* Right-side actions */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Ask AI button */}
        <button
          type="button"
          onClick={openCopilot}
          className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--kuja-spark))]/20 bg-[hsl(var(--kuja-spark-soft))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--kuja-spark))] hover:bg-[hsl(var(--kuja-spark))]/15 transition-colors"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t('header.ai_assistant') || 'Ask AI'}</span>
        </button>

        {/* Language picker */}
        <div className="relative" ref={langMenuRef}>
          <button
            type="button"
            onClick={() => setLangMenuOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-sm hover:bg-muted transition-colors"
            aria-haspopup="listbox"
            aria-expanded={langMenuOpen}
            aria-label="Change language"
          >
            <span className="text-base leading-none">{currentLang.flag}</span>
            <span className="hidden md:inline font-medium">{currentLang.label}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          {langMenuOpen && (
            <div
              role="listbox"
              className="absolute right-0 mt-1 w-56 rounded-lg border border-border bg-popover shadow-lg overflow-hidden z-50"
            >
              <div className="px-3 py-2 border-b border-border">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  <Globe className="h-3 w-3" /> Language
                </div>
              </div>
              {supportedLanguages.map((l) => {
                const active = l.code === currentLang.code;
                return (
                  <button
                    key={l.code}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setLanguage(l.code);
                      setLangMenuOpen(false);
                    }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors',
                      active
                        ? 'bg-[hsl(var(--kuja-sand-50))] text-[hsl(var(--kuja-clay-dark))]'
                        : 'hover:bg-muted text-foreground',
                    )}
                  >
                    <span className="text-base leading-none">{l.flag}</span>
                    <span className="flex-1 text-left">
                      <span className="font-medium">{l.label}</span>
                      <span className="ml-1.5 text-[10px] uppercase text-muted-foreground">{l.code}</span>
                    </span>
                    {active && <Check className="h-3.5 w-3.5 text-[hsl(var(--kuja-clay))]" />}
                  </button>
                );
              })}
              <div className="px-3 py-2 border-t border-border text-[11px] text-muted-foreground leading-snug">
                AI responses use your selected language.
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => setUserMenuOpen((o) => !o)}
            className="flex items-center gap-2 rounded-full hover:bg-muted px-1.5 py-1 transition-colors"
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            aria-label="User menu"
          >
            <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[hsl(var(--kuja-clay))] to-[hsl(var(--kuja-clay-dark))] text-white text-sm font-semibold">
              {initials}
            </div>
            <div className="hidden sm:block text-left leading-tight">
              <div className="text-sm font-medium text-foreground truncate max-w-[140px]">{user.name}</div>
              <div className="text-[11px] text-muted-foreground capitalize">{user.role}</div>
            </div>
          </button>
          {userMenuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-1 w-52 rounded-lg border border-border bg-popover shadow-lg overflow-hidden z-50"
            >
              <div className="px-3 py-2.5 border-b border-border">
                <div className="text-sm font-medium text-foreground truncate">{user.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">{user.email}</div>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
              >
                <LogOut className="h-4 w-4 text-muted-foreground" />
                {t('header.logout') || 'Sign out'}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
