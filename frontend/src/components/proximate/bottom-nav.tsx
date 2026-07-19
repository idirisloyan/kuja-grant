'use client';

/**
 * Proximate mobile bottom navigation — the redesign spec's
 * "role-appropriate bottom navigation for the most frequently used
 * areas" (Home / Rounds / Partners / Disbursements / More).
 *
 * Deliberately narrow scope: renders ONLY on the Proximate tenant for
 * the OB persona, and only below the `sm` breakpoint. Donors and
 * endorsers keep their simpler flows (their whole workspace is one or
 * two pages), and every other tenant is untouched. Navigation targets
 * are the same OB routes the sidebar exposes, so no authorization
 * surface changes — a non-OB can't see the bar, and the routes behind
 * it enforce their own server-side gates regardless.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useNetworkStore } from '@/stores/network-store';
import { useProximatePersona } from '@/lib/hooks/use-proximate-persona';
import { useTranslation } from '@/lib/hooks/use-translation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, HandCoins, Users, Send, Settings as SettingsIcon,
} from 'lucide-react';

const ITEMS = [
  { key: 'home', icon: LayoutDashboard, href: '/proximate/admin' },
  { key: 'rounds', icon: HandCoins, href: '/proximate/rounds' },
  { key: 'partners', icon: Users, href: '/proximate/admin/partners' },
  { key: 'disbursements', icon: Send, href: '/proximate/disbursements' },
  { key: 'more', icon: SettingsIcon, href: '/settings' },
] as const;

export function ProximateBottomNav() {
  const network = useNetworkStore((s) => s.network);
  const { persona } = useProximatePersona();
  const pathname = usePathname();
  const { t } = useTranslation();

  if (network?.slug !== 'proximate' || persona !== 'ob') return null;

  // Longest-prefix match so /proximate/admin/partners lights up
  // Partners, not Home.
  const active = ITEMS.reduce<string>((best, item) => {
    if (!pathname?.startsWith(item.href)) return best;
    const prev = ITEMS.find((i) => i.key === best);
    return !prev || item.href.length > prev.href.length ? item.key : best;
  }, '');

  return (
    <>
      {/* In-flow spacer so page content can scroll clear of the fixed bar. */}
      <div className="h-16 sm:hidden" aria-hidden="true" />
      <nav
        aria-label="Primary"
        className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="grid grid-cols-5">
          {ITEMS.map(({ key, icon: Icon, href }) => (
            <li key={key}>
              <Link
                href={href}
                aria-current={active === key ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium',
                  active === key
                    ? 'text-[hsl(var(--kuja-clay))]'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="truncate max-w-full px-0.5">
                  {t(`proximate.bottom_nav.${key}`)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
