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
import { useNetworkStore } from '@/stores/network-store';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useProximatePersona } from '@/lib/hooks/use-proximate-persona';
import { supportedLanguages } from '@/i18n';
import { cn } from '@/lib/utils';

import {
  Menu, LogOut, Sparkles, ChevronDown, User as UserIcon, Check, Globe, Search, Signal, SignalLow, Bell, Palette,
} from 'lucide-react';
import { ChangelogButton } from './ChangelogButton';
import { ThemeToggle } from '@/components/shared/theme-toggle';

export function Header() {
  const router = useRouter();
  const { user, logout, setLanguage } = useAuthStore();
  const language = user?.language ?? 'en';
  const { setMobileSidebarOpen, lowBandwidth, toggleLowBandwidth } = useUIStore();
  const { t } = useTranslation();
  const network = useNetworkStore((s) => s.network);
  // Phase 696 — Proximate donors/OB are seeded as User.role='ngo' for
  // platform compatibility. Override the role label so the avatar
  // menu shows the right persona ("Proximate donor", "Oversight body")
  // instead of "Ngo".
  const { persona, displayName } = useProximatePersona();
  const roleLabel = persona && persona !== 'none'
    ? (persona === 'ob' ? 'Oversight body'
        : persona === 'admin' ? 'Proximate operator'
        : 'Proximate donor')
    : (user?.role ?? 'user');
  // Phase 697 v3 — prefer persona's display_name over user.name when
  // persona is set. The reviewer reported seeing "Proximate Donor Demo"
  // briefly in the header right after logging in as ob@proximate.org —
  // that's the donor's name lingering from the previous session's
  // localStorage-cached auth state. The persona endpoint resolves
  // server-side from the live session cookie, so its display_name is
  // always accurate for the current user. Fall back to user.name only
  // when persona is unloaded (Kuja/NEAR tenants, or pre-fetch race).
  const displayedName = (persona && persona !== 'none' && displayName)
    ? displayName
    : (user?.name ?? '');

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
    // Stay inside the tenant the user was working in. A bare /login
    // deliberately clears any tenant override (several teams test different
    // tenants on one shared host, and a sticky override showed people the
    // wrong brand), so signing out of Proximate dropped you onto the Kuja
    // Marketplace login — jarring, and it reads as if you left the fund.
    // Passing the slug explicitly is the signal NetworkProvider already
    // understands, so branding survives without weakening that rule.
    const slug = (network?.slug || '').trim();
    const isTenant = !!slug && !network?.is_default;
    router.replace(
      isTenant ? `/login?network=${encodeURIComponent(slug)}` : '/login',
    );
  };

  const openCopilot = () => {
    window.dispatchEvent(new CustomEvent('kuja:open-copilot'));
  };

  if (!user) return null;

  const currentLang = supportedLanguages.find((l) => l.code === language) ?? supportedLanguages[0];
  const initials = (displayedName ?? user.email ?? 'U').split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();

  return (
    <header
      // `overflow-x-clip` (not `hidden`): clips any horizontal spill so the
      // header can never widen the document's scroll width on a phone, while
      // — unlike `overflow-hidden` — leaving vertical overflow visible for the
      // user/language dropdowns and not breaking `sticky`. On a 360px viewport
      // the fixed-size control cluster plus the tenant pill exceeded the row
      // by ~33px and put a horizontal scrollbar on every page (browser_test 13.4).
      className="sticky top-0 z-30 h-16 flex items-center bg-background border-b border-border px-3 sm:px-5 overflow-x-clip"
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

      {/* Tenant identity pill — visible to make multi-tenant obvious. Centred
          on a phone (left hamburger · centre identity · right controls,
          PFX-SEP02-GLOBAL-002), left-aligned from sm up. */}
      <div className="flex-1 min-w-0 flex justify-center sm:justify-start">
      {network && (
        <div
          // `min-w-0 shrink` + a truncating name: on a phone the pill is the
          // one flexible item in the row (the right-hand controls are
          // fixed-size icons), so it absorbs the squeeze and ellipsises
          // instead of pushing the controls past the viewport edge.
          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm min-w-0 shrink"
          style={{
            backgroundColor: network.brand_color_hex
              ? `${network.brand_color_hex}15`
              : 'hsl(var(--muted))',
            color: network.brand_color_hex || 'hsl(var(--foreground))',
            border: `1px solid ${network.brand_color_hex || 'hsl(var(--border))'}40`,
          }}
          title={`Tenant: ${network.name}`}
        >
          <span
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: network.brand_color_hex || 'currentColor' }}
            aria-hidden="true"
          />
          <span className="truncate">{network.name}</span>
        </div>
      )}
      </div>

      {/* Right-side actions — `shrink-0`: these are fixed-size icon controls;
          the tenant pill (min-w-0 shrink) is what gives way on narrow screens. */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Phase 4 — Low-bandwidth toggle. Persisted to localStorage; AI
            auto-calls + chart captions defer to manual when on. */}
        <button
          type="button"
          onClick={toggleLowBandwidth}
          className={cn(
            'hidden sm:inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
            lowBandwidth
              ? 'border-[hsl(var(--kuja-sun))] bg-[hsl(var(--kuja-sun)/0.1)] text-[hsl(var(--kuja-sun))]'
              : 'border-[hsl(var(--border))] text-[hsl(var(--kuja-ink-soft))] hover:text-[hsl(var(--kuja-ink))] hover:border-[hsl(var(--kuja-clay))]',
          )}
          aria-pressed={lowBandwidth}
          title={lowBandwidth ? 'Low-bandwidth ON — AI calls deferred' : 'Toggle low-bandwidth mode'}
        >
          {lowBandwidth ? <SignalLow className="h-3.5 w-3.5" /> : <Signal className="h-3.5 w-3.5" />}
          <span className="hidden lg:inline">{lowBandwidth ? 'Low BW' : 'Full BW'}</span>
        </button>

        {/* Phase 2 — Command palette trigger. Cmd+K / Ctrl+K from anywhere
            also opens it; this button is the visible affordance. */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('kuja:open-command-palette'))}
          className="hidden md:inline-flex items-center gap-2 rounded-md border border-[hsl(var(--border))] bg-background px-2.5 py-1.5 text-sm text-[hsl(var(--kuja-ink-soft))] hover:text-[hsl(var(--kuja-ink))] hover:border-[hsl(var(--kuja-clay))] transition-colors"
          aria-label="Open command palette"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">{t('nav.search') !== 'nav.search' ? t('nav.search') : 'Search…'}</span>
          <kbd className="hidden lg:inline-flex items-center rounded border border-[hsl(var(--border))] bg-[hsl(var(--kuja-sand-50))] px-1.5 text-[10px] font-mono">⌘K</kbd>
        </button>

        {/* Ask AI button */}
        <button
          type="button"
          onClick={openCopilot}
          className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--kuja-spark))]/20 bg-[hsl(var(--kuja-spark-soft))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--kuja-spark))] hover:bg-[hsl(var(--kuja-spark))]/15 transition-colors"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t('header.ai_assistant') || 'Ask AI'}</span>
        </button>

        {/* Phase 13.16 — In-app changelog (sparkle + red dot when unread). */}
        <ChangelogButton />

        {/* Phase 111 — App-wide theme toggle (system / light / dark). Below sm
            it lives in the user menu instead (PFX-SEP02-GLOBAL-002): a phone
            header carried seven controls, two of them sparkles. */}
        <ThemeToggle className="hidden sm:inline-flex" />

        {/* Language picker — tablet/desktop; the user menu holds a native
            <select> for phones. */}
        <div className="relative hidden sm:block" ref={langMenuRef}>
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
                  <Globe className="h-3 w-3" /> {t('header.language')}
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
                {t('header.lang_footer')}
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
              <div className="text-sm font-medium text-foreground truncate max-w-[140px]">{displayedName}</div>
              <div className="text-[11px] text-muted-foreground capitalize">{roleLabel}</div>
            </div>
          </button>
          {userMenuOpen && (
            <div
              role="menu"
              // w-64 below sm: the phone-only preferences rows (label + native
              // language select) did not fit the desktop menu's 13rem.
              className="absolute right-0 mt-1 w-64 sm:w-52 max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-popover shadow-lg overflow-hidden z-50"
            >
              <div className="px-3 py-2.5 border-b border-border">
                <div className="text-sm font-medium text-foreground truncate">{displayedName}</div>
                <div className="text-[11px] text-muted-foreground truncate">{user.email}</div>
              </div>
              {/* Phone-only preferences (PFX-SEP02-GLOBAL-002): language, theme
                  and low-bandwidth move here from the bar below sm, so the bar
                  keeps one assistant control, notifications and the avatar. */}
              <div className="sm:hidden border-b border-border py-1">
                <div className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {t('header.preferences')}
                </div>
                <label className="flex items-center gap-2 px-3 py-2 text-sm text-foreground">
                  <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1">{t('header.language')}</span>
                  <select
                    value={currentLang.code}
                    onChange={(e) => {
                      setLanguage(e.target.value as typeof currentLang.code);
                      setUserMenuOpen(false);
                    }}
                    className="max-w-[9.5rem] rounded-md border border-border bg-background px-2 py-1 text-sm"
                  >
                    {supportedLanguages.map((l) => (
                      <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-foreground">
                  <Palette className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1">{t('header.theme')}</span>
                  <ThemeToggle />
                </div>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={lowBandwidth}
                  onClick={toggleLowBandwidth}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                >
                  {lowBandwidth
                    ? <SignalLow className="h-4 w-4 text-muted-foreground shrink-0" />
                    : <Signal className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <span className="flex-1 text-left">{t('header.low_bandwidth')}</span>
                  <span className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    lowBandwidth
                      ? 'bg-[hsl(var(--kuja-sun)/0.15)] text-[hsl(var(--kuja-sun))]'
                      : 'bg-muted text-muted-foreground',
                  )}>
                    {lowBandwidth ? t('common.on') : t('common.off')}
                  </span>
                </button>
              </div>
              <a
                href="/settings/notifications"
                role="menuitem"
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                onClick={() => setUserMenuOpen(false)}
              >
                <Bell className="h-4 w-4 text-muted-foreground" />
                {t('header.notification_settings') || 'Notification settings'}
              </a>
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
