'use client';

/**
 * Grants list — shadcn + Tailwind rewrite.
 * Search, sector filters, sort, role-aware copy (NGO: Browse / Donor: My Grants).
 */

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useGrants } from '@/lib/hooks/use-api';
import { Search, X, Plus, ArrowRight, Inbox, Calendar, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Grant } from '@/lib/types';

function formatFunding(amount: number | null | undefined, currency: string = 'USD'): string {
  if (!amount) return 'TBD';
  const symbol = currency === 'USD' ? '$' : currency + ' ';
  if (amount >= 1_000_000) return `${symbol}${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${symbol}${(amount / 1_000).toFixed(0)}K`;
  return `${symbol}${amount.toLocaleString()}`;
}

function getDaysLeft(dateStr: string | null | undefined): { label: string; tone: 'danger' | 'warn' | 'ok' | 'mute' } {
  if (!dateStr) return { label: 'No deadline', tone: 'mute' };
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: 'Expired', tone: 'danger' };
  if (diffDays === 0) return { label: 'Due today', tone: 'danger' };
  if (diffDays <= 7) return { label: `${diffDays}d left`, tone: 'danger' };
  if (diffDays <= 30) return { label: `${diffDays}d left`, tone: 'warn' };
  return { label: `${diffDays}d left`, tone: 'ok' };
}

const SECTOR_OPTIONS = [
  'Health', 'Education', 'WASH', 'Food Security', 'Livelihoods',
  'Protection', 'Shelter', 'Gender Equality', 'Climate', 'Governance', 'Nutrition',
];

type SortOption = 'deadline' | 'funding' | 'recent';

const STATUS_LABEL: Record<string, string> = {
  open: 'Open', draft: 'Draft', review: 'In review', closed: 'Closed', awarded: 'Awarded',
};
const STATUS_TONE: Record<string, string> = {
  open: 'bg-[hsl(142_68%_95%)] text-[hsl(var(--kuja-grow))] border-[hsl(142_55%_85%)]',
  draft: 'bg-muted text-muted-foreground border-border',
  review: 'bg-[hsl(32_100%_95%)] text-[hsl(32_80%_30%)] border-[hsl(32_80%_85%)]',
  closed: 'bg-muted text-muted-foreground border-border',
  awarded: 'bg-[hsl(var(--kuja-sand-50))] text-[hsl(var(--kuja-clay-dark))] border-[hsl(var(--kuja-sand))]',
};

export default function GrantsPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSectors, setActiveSectors] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortOption>('deadline');
  const { data, isLoading } = useGrants();

  const grants: Grant[] = useMemo(() => data?.grants ?? [], [data]);

  const filteredGrants = useMemo(() => {
    let result = grants;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((g) =>
        g.title.toLowerCase().includes(q) ||
        (g.donor_org_name ?? '').toLowerCase().includes(q) ||
        (g.description ?? '').toLowerCase().includes(q),
      );
    }
    if (activeSectors.size > 0) {
      result = result.filter((g) => g.sectors?.some((s: string) => activeSectors.has(s)));
    }
    result = [...result].sort((a, b) => {
      if (sortBy === 'deadline') {
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }
      if (sortBy === 'funding') return (b.total_funding ?? 0) - (a.total_funding ?? 0);
      return new Date(b.created_at ?? '').getTime() - new Date(a.created_at ?? '').getTime();
    });
    return result;
  }, [grants, searchQuery, activeSectors, sortBy]);

  const toggleSector = (sector: string) => {
    setActiveSectors((prev) => {
      const next = new Set(prev);
      if (next.has(sector)) next.delete(sector);
      else next.add(sector);
      return next;
    });
  };

  const isNgo = user?.role === 'ngo';

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="kuja-shimmer h-10 w-64 rounded" />
        <div className="kuja-shimmer h-10 w-96 rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1,2,3,4].map((i) => <div key={i} className="kuja-shimmer h-48 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="kuja-display text-3xl">{isNgo ? 'Browse Grants' : 'My Grants'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filteredGrants.length} grant{filteredGrants.length !== 1 ? 's' : ''} found
          </p>
        </div>
        {!isNgo && (
          <button
            type="button"
            onClick={() => router.push('/grants/new')}
            className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))] text-white text-sm font-medium px-3 py-2"
          >
            <Plus className="h-4 w-4" /> Create grant
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by title, donor, or keyword…"
          className="w-full h-10 pl-9 pr-9 text-sm rounded-md border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))]"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Sector filters + sort */}
      <div className="flex flex-wrap items-center gap-2">
        {SECTOR_OPTIONS.map((sector) => {
          const active = activeSectors.has(sector);
          return (
            <button
              key={sector}
              type="button"
              onClick={() => toggleSector(sector)}
              className={cn(
                'rounded-full border text-xs px-3 py-1.5 transition-colors',
                active
                  ? 'bg-[hsl(var(--kuja-clay))] text-white border-transparent'
                  : 'border-border text-foreground hover:bg-muted',
              )}
            >
              {sector}
            </button>
          );
        })}
        {activeSectors.size > 0 && (
          <button
            type="button"
            onClick={() => setActiveSectors(new Set())}
            className="text-xs text-[hsl(var(--kuja-flag))] hover:underline px-2"
          >
            Clear filters
          </button>
        )}

        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          Sort:
          {(['deadline', 'funding', 'recent'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSortBy(s)}
              className={cn(
                'px-2 py-1 rounded transition-colors',
                sortBy === s
                  ? 'text-[hsl(var(--kuja-clay))] font-medium'
                  : 'hover:text-foreground',
              )}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Grant cards */}
      {filteredGrants.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background px-6 py-14 text-center">
          <Inbox className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="kuja-display text-xl">No grants match</p>
          <p className="text-sm text-muted-foreground mt-1">Try adjusting your search or clearing filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredGrants.map((grant) => {
            const deadline = getDaysLeft(grant.deadline);
            const deadlineCls =
              deadline.tone === 'danger' ? 'text-[hsl(var(--kuja-flag))]' :
              deadline.tone === 'warn' ? 'text-[hsl(var(--kuja-sun))]' :
              deadline.tone === 'ok' ? 'text-[hsl(var(--kuja-grow))]' :
              'text-muted-foreground';
            return (
              <div
                key={grant.id}
                onClick={() => router.push(`/grants/${grant.id}`)}
                className="rounded-xl border border-border bg-background p-5 hover:border-[hsl(var(--kuja-clay))] hover:shadow-md transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-base text-foreground line-clamp-2">{grant.title}</h3>
                    {grant.donor_org_name && (
                      <p className="text-xs text-muted-foreground mt-0.5">{grant.donor_org_name}</p>
                    )}
                  </div>
                  <span className={cn('kuja-severity border', STATUS_TONE[grant.status] ?? STATUS_TONE.draft)}>
                    {STATUS_LABEL[grant.status] ?? grant.status}
                  </span>
                </div>
                {grant.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{grant.description}</p>
                )}
                {grant.sectors && grant.sectors.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {grant.sectors.slice(0, 4).map((s: string) => (
                      <span key={s} className="text-[10px] uppercase tracking-wider rounded bg-muted text-muted-foreground px-1.5 py-0.5">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-sm">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="kuja-numeric text-foreground">{formatFunding(grant.total_funding, grant.currency)}</span>
                    </div>
                    <div className={cn('flex items-center gap-1.5', deadlineCls)}>
                      <Calendar className="h-3.5 w-3.5" />
                      <span className="text-xs font-medium">{deadline.label}</span>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
