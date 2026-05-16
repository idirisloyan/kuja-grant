'use client';

/**
 * CommandPalette — Cmd+K (Ctrl+K on Linux/Windows) universal launcher.
 *
 * Opens with: Cmd/Ctrl + K, or "/" from anywhere not in an input.
 *
 * Three layers:
 *   1. Quick actions  — go-to-page, role-aware
 *   2. Recent items   — applications, grants, orgs the user touched recently (best-effort)
 *   3. Search results — searches across grants + organisations via existing API
 *
 * Renders ALWAYS — listens to the global event `kuja:open-command-palette`
 * and the keyboard shortcuts itself, so a Dock/Header button can fire the event.
 *
 * Uses cmdk via shadcn's CommandDialog primitive.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandSeparator, CommandShortcut,
} from '@/components/ui/command';
import {
  LayoutDashboard, FileText, Briefcase, ShieldCheck, ClipboardCheck,
  Building2, Activity, Search, Sparkles, Award, BarChart3, PlusCircle, Star,
  AlertTriangle, ArrowRightCircle,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';

interface NavAction {
  id: string;
  label: string;
  description?: string;
  href: string;
  icon: typeof Search;
  roles: string[];   // empty = all
  keywords?: string[];
}

const NAV_ACTIONS: NavAction[] = [
  // NGO
  { id: 'ngo-dashboard',    label: 'Dashboard',          description: 'Your readiness console', href: '/dashboard',           icon: LayoutDashboard, roles: ['ngo','donor','reviewer','admin'] },
  { id: 'ngo-trust',        label: 'Trust Profile',      description: 'Two-pillar trust synthesis', href: '/trust',         icon: ShieldCheck,     roles: ['ngo','donor','admin'], keywords: ['passport','adverse','bank','due diligence','pep','sanctions'] },
  { id: 'ngo-assessments',  label: 'Capacity Assessments', description: '5 frameworks',         href: '/assessments',         icon: ClipboardCheck,  roles: ['ngo','admin'], keywords: ['kuja','step','un-hact','chs','nupas'] },
  { id: 'ngo-grants',       label: 'Browse grants',      description: 'Open opportunities',       href: '/grants',              icon: Search,          roles: ['ngo'] },
  { id: 'ngo-apps',         label: 'My applications',    description: 'Drafts + submitted',       href: '/applications',        icon: FileText,        roles: ['ngo','admin'] },
  { id: 'ngo-reports',      label: 'Reports',            description: 'Upcoming + submitted',     href: '/reports',             icon: BarChart3,       roles: ['ngo','donor','admin'] },
  { id: 'ngo-profile',      label: 'Organisation profile', description: 'Your org details',       href: '/organizations/profile', icon: Building2,     roles: ['ngo'] },
  // Donor
  { id: 'donor-new-grant',  label: 'Create a new grant', description: 'Wizard', href: '/grants/new',                          icon: PlusCircle,      roles: ['donor','admin'] },
  { id: 'donor-grants',     label: 'My grants',          description: 'All grants I created',      href: '/grants',             icon: Briefcase,       roles: ['donor'] },
  { id: 'donor-reviews',    label: 'Review applications', description: 'Score + decide',           href: '/reviews',            icon: ClipboardCheck,  roles: ['donor'] },
  { id: 'donor-compliance', label: 'Compliance',         description: 'Grants compliance health',  href: '/compliance',         icon: ShieldCheck,     roles: ['donor','admin'] },
  { id: 'donor-orgs',       label: 'Organisation search', description: 'Find + verify NGOs',       href: '/organizations/search', icon: Search,        roles: ['donor','admin'] },
  { id: 'donor-verification', label: 'Registration checks', description: 'Expiring registrations', href: '/verification',     icon: ShieldCheck,     roles: ['donor','admin'] },
  // Reviewer
  { id: 'reviewer-queue',   label: 'My queue',           description: 'Assigned + in progress',   href: '/reviews',             icon: ClipboardCheck,  roles: ['reviewer'] },
  { id: 'reviewer-completed', label: 'Completed reviews', description: 'My history',              href: '/reviews/completed',   icon: FileText,        roles: ['reviewer'] },
  // Admin
  { id: 'admin-grants',     label: 'All grants',         description: 'Cross-org view',           href: '/grants',              icon: Briefcase,       roles: ['admin'] },
  { id: 'admin-apps',       label: 'All applications',   description: 'Cross-org view',           href: '/applications',        icon: FileText,        roles: ['admin'] },
  { id: 'admin-observability', label: 'Observability',   description: 'AI health + telemetry',    href: '/observability',       icon: Activity,        roles: ['admin'] },
];

interface SearchHitGrant {
  id: number;
  title: string;
  donor_org_name?: string;
}

interface SearchHitOrg {
  id: number;
  name: string;
  country?: string;
}

interface SearchHitDoc {
  document_id: number;
  original_filename: string;
  doc_type: string | null;
  application_id: number | null;
  assessment_id: number | null;
  snippet: string;
  match_locations: string[];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [grantHits, setGrantHits] = useState<SearchHitGrant[]>([]);
  const [orgHits, setOrgHits] = useState<SearchHitOrg[]>([]);
  const [docHits, setDocHits] = useState<SearchHitDoc[]>([]);
  const [searching, setSearching] = useState(false);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const role = user?.role ?? '';

  // Open with keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isModK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      const isSlash = e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement);
      if (isModK || isSlash) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const opener = () => setOpen(true);
    document.addEventListener('keydown', handler);
    window.addEventListener('kuja:open-command-palette', opener);
    return () => {
      document.removeEventListener('keydown', handler);
      window.removeEventListener('kuja:open-command-palette', opener);
    };
  }, []);

  // Live search across grants + orgs + documents (debounced 250ms)
  useEffect(() => {
    if (!query || query.length < 2) {
      setGrantHits([]); setOrgHits([]); setDocHits([]); return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const [g, o, d] = await Promise.all([
          api.get<{ grants?: SearchHitGrant[] }>(`/api/grants/?q=${encodeURIComponent(query)}`).catch(() => ({ grants: [] })),
          api.get<{ organizations?: SearchHitOrg[] }>(`/api/organizations/search?q=${encodeURIComponent(query)}`).catch(() => ({ organizations: [] })),
          api.get<{ hits?: SearchHitDoc[] }>(`/api/documents/search?q=${encodeURIComponent(query)}`).catch(() => ({ hits: [] })),
        ]);
        if (cancelled) return;
        setGrantHits((g.grants ?? []).slice(0, 5));
        setOrgHits((o.organizations ?? []).slice(0, 5));
        setDocHits((d.hits ?? []).slice(0, 5));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  const navActions = useMemo(
    () => NAV_ACTIONS.filter(a => a.roles.length === 0 || a.roles.includes(role)),
    [role]
  );

  const go = useCallback((href: string) => {
    setOpen(false);
    router.push(href);
  }, [router]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Quick actions" description="Search across the app">
      <CommandInput
        placeholder="Type to search grants, orgs, actions…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {query.length < 2 ? 'Type 2+ characters to search.' : searching ? 'Searching…' : 'No results.'}
        </CommandEmpty>

        {/* Quick actions */}
        <CommandGroup heading="Quick actions">
          {navActions.map((a) => {
            const Icon = a.icon;
            return (
              <CommandItem
                key={a.id}
                value={`${a.label} ${a.description ?? ''} ${(a.keywords ?? []).join(' ')}`}
                onSelect={() => go(a.href)}
                className="flex items-center gap-2"
              >
                <Icon className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{a.label}</div>
                  {a.description && (
                    <div className="text-[11px] text-[hsl(var(--kuja-ink-soft))]">{a.description}</div>
                  )}
                </div>
                <ArrowRightCircle className="w-3.5 h-3.5 opacity-50" />
              </CommandItem>
            );
          })}
        </CommandGroup>

        {/* Grant results */}
        {grantHits.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Grants">
              {grantHits.map((g) => (
                <CommandItem
                  key={`grant-${g.id}`}
                  value={`grant-${g.id} ${g.title}`}
                  onSelect={() => go(`/grants/${g.id}`)}
                  className="flex items-center gap-2"
                >
                  <Briefcase className="w-4 h-4 text-[hsl(var(--kuja-savanna))]" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{g.title}</div>
                    {g.donor_org_name && (
                      <div className="text-[11px] text-[hsl(var(--kuja-ink-soft))]">{g.donor_org_name}</div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Org results */}
        {orgHits.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Organisations">
              {orgHits.map((o) => (
                <CommandItem
                  key={`org-${o.id}`}
                  value={`org-${o.id} ${o.name}`}
                  onSelect={() => go(`/trust?org=${o.id}`)}
                  className="flex items-center gap-2"
                >
                  <Building2 className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{o.name}</div>
                    {o.country && (
                      <div className="text-[11px] text-[hsl(var(--kuja-ink-soft))]">{o.country}</div>
                    )}
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-[hsl(var(--kuja-clay))]">Trust</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Document results (Phase 9) */}
        {docHits.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Documents">
              {docHits.map((d) => (
                <CommandItem
                  key={`doc-${d.document_id}`}
                  value={`doc-${d.document_id} ${d.original_filename}`}
                  onSelect={() => {
                    // Drill to the underlying application or assessment if present.
                    if (d.application_id) go(`/applications/${d.application_id}`);
                    else if (d.assessment_id) go('/assessments');
                    else go('/organizations/profile');
                  }}
                  className="flex items-start gap-2"
                >
                  <FileText className="w-4 h-4 text-[hsl(var(--kuja-sky))] mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{d.original_filename}</div>
                    {d.snippet && (
                      <div
                        className="text-[11px] text-[hsl(var(--kuja-ink-soft))] line-clamp-2"
                        dangerouslySetInnerHTML={{ __html: d.snippet }}
                      />
                    )}
                    {d.match_locations.length > 0 && (
                      <div className="text-[10px] uppercase tracking-wider text-[hsl(var(--kuja-ink-soft))] mt-0.5">
                        match: {d.match_locations.join(', ')}
                      </div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Tips">
          <CommandItem disabled className="text-[11px] text-[hsl(var(--kuja-ink-soft))]">
            <Sparkles className="w-3 h-3" /> Press <CommandShortcut>/</CommandShortcut> from anywhere to open this.
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
