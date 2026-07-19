'use client';

/**
 * Settings hub — the redesign spec's deferred "single Settings landing
 * page". Groups personal preferences (profile, language, theme,
 * bandwidth) above links to the dedicated settings pages
 * (notifications, security) and role-gated platform links. Presentation
 * only: every control here already exists in the shell — this page just
 * gives them one grouped, discoverable home.
 */

import Link from 'next/link';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useNetworkStore } from '@/stores/network-store';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useProximatePersona } from '@/lib/hooks/use-proximate-persona';
import { supportedLanguages } from '@/i18n';
import { Card } from '@/components/ui/card';
import { PageShell, PageHeader, PageMain } from '@/components/layout/page-shell';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import {
  User as UserIcon, Globe, SunMoon, Signal, Bell, Shield, ChevronRight,
  Search, Webhook, Users, BarChart3, Eye,
} from 'lucide-react';

function LinkRow({ href, icon: Icon, title, hint }: {
  href: string; icon: React.ComponentType<{ className?: string }>;
  title: string; hint: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/60 transition-colors"
    >
      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground truncate">{hint}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 rtl:rotate-180" />
    </Link>
  );
}

export default function SettingsHubPage() {
  const { user, setLanguage } = useAuthStore();
  const { lowBandwidth, toggleLowBandwidth } = useUIStore();
  const network = useNetworkStore((s) => s.network);
  const { persona, displayName } = useProximatePersona();
  const { t } = useTranslation();

  if (!user) return null;

  const roleLabel = persona && persona !== 'none'
    ? (persona === 'ob' ? 'Oversight body'
        : persona === 'admin' ? 'Proximate operator'
        : 'Proximate donor')
    : (user.role ?? 'user');
  const isProximate = network?.slug === 'proximate';

  return (
    <PageShell>
      <PageHeader
        title={t('settings.hub.title')}
        subtitle={t('settings.hub.subtitle')}
      />
      <PageMain>
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Profile */}
          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-muted-foreground" />
              {t('settings.hub.profile')}
            </h2>
            <div className="space-y-1 text-sm">
              <p className="font-medium">{displayName || user.name}</p>
              <p className="text-muted-foreground">{user.email}</p>
              <p className="text-xs text-muted-foreground capitalize">{roleLabel}</p>
              {Boolean((user as { read_only?: boolean }).read_only) && (
                <p className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                  <Eye className="w-3 h-3" />
                  {t('settings.hub.read_only_note')}
                </p>
              )}
            </div>
          </Card>

          {/* Preferences: language, theme, bandwidth */}
          <Card className="p-4 space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted-foreground" />
              {t('settings.hub.preferences')}
            </h2>

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t('settings.hub.language')}</p>
                <p className="text-xs text-muted-foreground">{t('settings.hub.language_hint')}</p>
              </div>
              <select
                value={user.language ?? 'en'}
                onChange={(e) => setLanguage(e.target.value)}
                aria-label={t('settings.hub.language')}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                {supportedLanguages.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <SunMoon className="w-3.5 h-3.5 text-muted-foreground" />
                  {t('settings.hub.theme')}
                </p>
                <p className="text-xs text-muted-foreground">{t('settings.hub.theme_hint')}</p>
              </div>
              <ThemeToggle />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Signal className="w-3.5 h-3.5 text-muted-foreground" />
                  {t('settings.hub.bandwidth')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {lowBandwidth
                    ? t('settings.hub.bandwidth_on')
                    : t('settings.hub.bandwidth_off')}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={lowBandwidth}
                onClick={toggleLowBandwidth}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  lowBandwidth ? 'bg-[hsl(var(--kuja-clay))]' : 'bg-muted'
                }`}
                aria-label={t('settings.hub.bandwidth')}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all ${
                    lowBandwidth ? 'start-[calc(100%-1.375rem)]' : 'start-0.5'
                  }`}
                />
              </button>
            </div>
          </Card>

          {/* Notifications + Security links */}
          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold">{t('settings.hub.account')}</h2>
            <LinkRow
              href="/settings/notifications"
              icon={Bell}
              title={t('settings.hub.notifications')}
              hint={t('settings.hub.notifications_hint')}
            />
            <LinkRow
              href="/settings/security"
              icon={Shield}
              title={t('settings.hub.security')}
              hint={t('settings.hub.security_hint')}
            />
          </Card>

          {/* Tenant / role-gated extras. Marketplace-only tools stay off
              the Proximate console (same leak class as the banner). */}
          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold">{t('settings.hub.more')}</h2>
            {!isProximate && (
              <>
                <LinkRow
                  href="/settings/saved-searches"
                  icon={Search}
                  title={t('settings.hub.saved_searches')}
                  hint={t('settings.hub.saved_searches_hint')}
                />
                <LinkRow
                  href="/settings/webhooks"
                  icon={Webhook}
                  title={t('settings.hub.webhooks')}
                  hint={t('settings.hub.webhooks_hint')}
                />
              </>
            )}
            {user.role === 'admin' && !isProximate && (
              <>
                <LinkRow
                  href="/admin/users"
                  icon={Users}
                  title={t('settings.hub.admin_users')}
                  hint={t('settings.hub.admin_users_hint')}
                />
                <LinkRow
                  href="/admin/metrics"
                  icon={BarChart3}
                  title={t('settings.hub.admin_metrics')}
                  hint={t('settings.hub.admin_metrics_hint')}
                />
              </>
            )}
            {isProximate && (
              <LinkRow
                href="/admin/audit-chain"
                icon={Shield}
                title={t('settings.hub.audit_chain')}
                hint={t('settings.hub.audit_chain_hint')}
              />
            )}
          </Card>
        </div>
      </PageMain>
    </PageShell>
  );
}
